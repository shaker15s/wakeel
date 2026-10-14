/**
 * WAKEEL — Policy Engine v0.1
 *
 * Implements strict authorization rules:
 * - READ: Allowed if ERP permission exists.
 * - DRAFT WRITE: Requires policy check.
 * - FINANCIAL COMMIT / MUTATION: Requires explicit Human Approval.
 * - DESTRUCTIVE: Disabled by default.
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ActionRequest {
  toolName: string;
  category: 'READ' | 'DRAFT_WRITE' | 'FINANCIAL_COMMIT' | 'DESTRUCTIVE';
  parameters: Record<string, any>;
  operatorId: string;
  amount?: number;
}

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  riskLevel: RiskLevel;
  reason: string;
  approvalCard?: {
    title: string;
    description: string;
    details: Array<{ label: string; value: string }>;
    mutationPayload: any;
  };
}

const REGISTERED_TOOL_CATEGORIES: Readonly<Record<string, ActionRequest['category']>> = {
  get_sales_summary: 'READ',
  get_receivables_summary: 'READ',
  get_inventory_levels: 'READ',
  search_customers: 'READ',
  get_chart_of_accounts: 'READ',
  get_trial_balance: 'READ',
  get_account_activity: 'READ',
  get_aged_balances: 'READ',
  get_financial_statement: 'READ',
  calculate_budget_variance: 'READ',
  build_period_close_checklist: 'READ',
  assess_expense: 'READ',
  calculate_asset_schedule: 'READ',
  propose_bank_matches: 'READ',
  prepare_journal_entry_proposal: 'READ',
  create_draft_invoice: 'DRAFT_WRITE',
  create_draft_customer_invoice: 'DRAFT_WRITE',
  create_draft_vendor_bill: 'DRAFT_WRITE',
  // Preserved for the existing, separately approval-gated runtime workflow.
  create_draft_purchase_order: 'DRAFT_WRITE',
};

export class PolicyEngine {
  static evaluate(action: ActionRequest): PolicyDecision {
    const registeredCategory = REGISTERED_TOOL_CATEGORIES[action.toolName];
    if (!registeredCategory || registeredCategory !== action.category) {
      return {
        allowed: false,
        requiresApproval: false,
        riskLevel: 'HIGH',
        reason: 'Unknown tool or risk category mismatch; policy denies by default.',
      };
    }

    // 1. Destructive actions blocked in MVP
    if (action.category === 'DESTRUCTIVE') {
      return {
        allowed: false,
        requiresApproval: false,
        riskLevel: 'CRITICAL',
        reason: 'Destructive mutations (e.g. DELETE) are disabled for safety.',
      };
    }

    // 2. Read queries are safe & verified
    if (action.category === 'READ') {
      return {
        allowed: true,
        requiresApproval: false,
        riskLevel: 'LOW',
        reason: 'Read operation permitted.',
      };
    }

    // 3. Draft Invoices / Purchase Orders -> Require Human-In-The-Loop Approval
    if (action.toolName === 'create_draft_invoice' || action.toolName === 'create_draft_customer_invoice') {
      const amount = action.parameters.lines?.reduce(
        (sum: number, l: any) => sum + (Number(l.quantity) * Number(l.unitPrice) || 0),
        0
      );

      return {
        allowed: true,
        requiresApproval: true,
        riskLevel: amount > 25000 ? 'HIGH' : 'MEDIUM',
        reason: 'Creating a draft invoice requires explicit operator approval.',
        approvalCard: {
          title: 'إنشاء مسودة فاتورة (Create Draft Invoice)',
          description: `المبلغ الإجمالي: ${amount?.toLocaleString()} ج.م`,
          details: [
            { label: 'العميل (Customer ID)', value: String(action.parameters.customerId) },
            { label: 'عدد البنود (Lines)', value: String(action.parameters.lines?.length || 0) },
            { label: 'المبلغ الإجمالي (Amount)', value: `${amount?.toLocaleString()} EGP` },
          ],
          mutationPayload: action.parameters,
        },
      };
    }

    if (action.toolName === 'create_draft_vendor_bill') {
      return {
        allowed: true, requiresApproval: true,
        riskLevel: action.amount && action.amount > 25000 ? 'HIGH' : 'MEDIUM',
        reason: 'Creating a vendor bill draft requires explicit operator approval.',
        approvalCard: {
          title: 'إنشاء مسودة فاتورة مورد',
          description: `مسودة المورد ${action.parameters.vendorBillReference} بقيمة ${action.parameters.totalAmount} ${action.parameters.currency}`,
          details: [
            { label: 'المورد', value: String(action.parameters.vendorId) },
            { label: 'مرجع فاتورة المورد', value: String(action.parameters.vendorBillReference) },
            { label: 'عدد البنود', value: String(action.parameters.lines?.length ?? 0) },
          ],
          mutationPayload: action.parameters,
        },
      };
    }

    if (action.toolName === 'create_draft_purchase_order') {
      return {
        allowed: true,
        requiresApproval: true,
        riskLevel: 'MEDIUM',
        reason: 'Creating a purchase order draft requires explicit confirmation.',
        approvalCard: {
          title: 'إنشاء مسودة أمر شراء (Create Purchase Draft)',
          description: `المورد: ${action.parameters.vendorId}`,
          details: [
            { label: 'المورد (Vendor ID)', value: String(action.parameters.vendorId) },
            { label: 'البنود', value: String(action.parameters.lines?.length || 0) },
          ],
          mutationPayload: action.parameters,
        },
      };
    }

    return {
      allowed: true,
      requiresApproval: false,
      riskLevel: 'LOW',
      reason: 'Standard action permitted.',
    };
  }
}
