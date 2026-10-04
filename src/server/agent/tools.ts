import { ExecutionResult, IERPConnector } from '../erp/contract';
import { ActionRequest, PolicyEngine } from '../policy/engine';

export interface ToolDefinition {
  name: string;
  description: string;
  category: 'READ' | 'DRAFT_WRITE' | 'FINANCIAL_COMMIT' | 'DESTRUCTIVE';
  parametersSchema: Record<string, any>;
}

export const ERP_TOOLS: ToolDefinition[] = [
  {
    name: 'get_sales_summary',
    description: 'Retrieve real verified total revenue, order count, and sales orders from the connected ERP.',
    category: 'READ',
    parametersSchema: {
      dateFrom: { type: 'string', description: 'ISO date e.g. 2026-08-01' },
      dateTo: { type: 'string', description: 'ISO date' },
    },
  },
  {
    name: 'get_receivables_summary',
    description: 'Retrieve outstanding balances, unpaid customer invoices, and overdue amounts from ERP.',
    category: 'READ',
    parametersSchema: {},
  },
  {
    name: 'get_inventory_levels',
    description: 'Check stock on hand and identify low-stock items from ERP.',
    category: 'READ',
    parametersSchema: {
      lowStockThreshold: { type: 'number', default: 10 },
    },
  },
  {
    name: 'search_customers',
    description: 'Search customer records in the ERP by name, email, or phone.',
    category: 'READ',
    parametersSchema: {
      name: { type: 'string' },
    },
  },
  {
    name: 'create_draft_invoice',
    description: 'Prepare a new customer invoice draft in the ERP (Requires Human Approval).',
    category: 'DRAFT_WRITE',
    parametersSchema: {
      customerId: { type: 'string | number', required: true },
      lines: {
        type: 'array',
        items: {
          description: { type: 'string' },
          quantity: { type: 'number' },
          unitPrice: { type: 'number' },
        },
      },
    },
  },
];

/**
 * Discriminated-ish result shape for executeToolCall(). Every branch carries
 * the same keys (optional where not applicable) so callers can read
 * `.requiresApproval` / `.data` / `.reason` without narrowing first — this
 * used to be an implicit, inconsistent union that `tsc` could not check
 * (see docs/implementation/00-repo-audit.md, tsc baseline section).
 */
export type ToolCallResult =
  | { success: false; error: string; requiresApproval: false; data?: undefined; approvalCard?: undefined; reason?: undefined }
  | { success: false; requiresApproval: true; approvalCard: unknown; reason?: string; data?: undefined; error?: undefined }
  | (ExecutionResult<any> & { requiresApproval?: false; approvalCard?: undefined; reason?: undefined });

export async function executeToolCall(
  connector: IERPConnector,
  toolName: string,
  parameters: Record<string, any>,
  operatorId: string,
  approvalGranted = false
): Promise<ToolCallResult> {
  const tool = ERP_TOOLS.find((t) => t.name === toolName);
  if (!tool) {
    throw new Error(`Tool ${toolName} not found in registry.`);
  }

  // 1. Evaluate Policy
  const actionReq: ActionRequest = {
    toolName,
    category: tool.category,
    parameters,
    operatorId,
  };

  const decision = PolicyEngine.evaluate(actionReq);

  if (!decision.allowed) {
    return {
      success: false,
      error: decision.reason,
      requiresApproval: false,
    };
  }

  if (decision.requiresApproval && !approvalGranted) {
    return {
      success: false,
      requiresApproval: true,
      approvalCard: decision.approvalCard,
      reason: decision.reason,
    };
  }

  // 2. Dispatch to Real ERP Connector
  switch (toolName) {
    case 'get_sales_summary':
      return await connector.getSalesSummary(parameters);
    case 'get_receivables_summary':
      return await connector.getReceivablesSummary();
    case 'get_inventory_levels':
      return await connector.getInventoryLevels(parameters);
    case 'search_customers':
      return await connector.searchEntities('customer', {
        filter: parameters.name ? [['name', 'ilike', parameters.name]] : [],
      });
    case 'create_draft_invoice':
      return await connector.createDraftInvoice(parameters as any);
    default:
      throw new Error(`Unsupported tool implementation: ${toolName}`);
  }
}
