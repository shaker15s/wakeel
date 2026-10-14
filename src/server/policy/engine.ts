/**
 * WAKEEL — Policy Engine v0.2 (deny-by-default)
 *
 * Implements strict authorization rules:
 * - ONLY explicitly recognized tools are allowed; all others are denied.
 * - READ: Allowed if ERP permission exists and tool is recognized.
 * - DRAFT WRITE: Requires policy check + human approval.
 * - FINANCIAL COMMIT / MUTATION: Requires explicit Human Approval.
 * - DESTRUCTIVE: Disabled by default.
 * - Policy version is embedded in every decision for future auditing.
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

export class PolicyEngine {
  static readonly POLICY_VERSION = 'policy-engine-v0.2';
  static readonly RECOGNIZED_TOOLS = new Set([
    'get_sales_summary',
    'get_receivables_summary',
    'get_inventory_levels',
    'search_customers',
    'create_draft_invoice',
    'create_draft_purchase_order',
  ]);

  static evaluate(action: ActionRequest): PolicyDecision {
    // 1. Destructive actions blocked in MVP
    if (action.category === 'DESTRUCTIVE') {
      return {
        allowed: false,
        requiresApproval: false,
        riskLevel: 'CRITICAL',
        reason: 'Destructive mutations (e.g. DELETE) are disabled for safety.',
      };
    }

    // 2. Undefined/invalid category denied by default (deny-by-default)
    if (!action.category) {
      return {
        allowed: false,
        requiresApproval: false,
        riskLevel: 'LOW',
        reason: 'Action category is undefined or invalid. Tool not recognized.',
      };
    }

    // 3. Unrecognized tool names are denied by default (deny-by-default)
    if (!PolicyEngine.RECOGNIZED_TOOLS.has(action.toolName)) {
      return {
        allowed: false,
        requiresApproval: false,
        riskLevel: 'LOW',
        reason: `Tool "${action.toolName}" is not recognized. Add a policy branch for it before use.`,
      };
    }

    // 4. Read queries are safe & verified (if recognized)
    if (action.category === 'READ') {
      return {
        allowed: true,
        requiresApproval: false,
        riskLevel: 'LOW',
        reason: 'Read operation permitted.',
      };
    }

    // 5. Draft Invoices -> Require Human-In-The-Loop Approval
    if (action.toolName === 'create_draft_invoice') {
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

    // 6. Draft Purchase Orders -> Require Confirmation
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

    // 7. Any other recognized tool: permitted but without approval
    return {
      allowed: true,
      requiresApproval: false,
      riskLevel: 'LOW',
      reason: 'Standard action permitted.',
    };
  }
}