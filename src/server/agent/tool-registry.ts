import { z } from 'zod';
import type { IERPConnector, ERPConnectionStatus, ExecutionResult } from '../erp/contract';
import { PolicyEngine } from '../policy/engine';

export type FinanceRiskClass = 'READ' | 'DRAFT_WRITE' | 'FINANCIAL_COMMIT' | 'DESTRUCTIVE';
export type FinanceCapability = Exclude<keyof ERPConnectionStatus['permissions'], 'rawPermissions'>;

export interface FinanceToolContext {
  /** Connector and permissions are resolved by trusted server code, never model input. */
  connector: IERPConnector;
  operatorId: string;
  capabilities: Partial<Record<FinanceCapability, boolean>>;
  /** Set only by the server-side approval/runtime path. */
  approvalGranted?: boolean;
}

export interface FinanceTool<TInput = unknown, TOutput = unknown> {
  name: string;
  domain: 'sales' | 'accounts_receivable' | 'inventory' | 'customers' | 'accounts_payable';
  description: string;
  riskClass: FinanceRiskClass;
  inputSchema: z.ZodType<TInput>;
  requiredCapability: FinanceCapability;
  execute(ctx: FinanceToolContext, input: TInput): Promise<ExecutionResult<TOutput>>;
}

export type EvidenceRef = {
  provider: string;
  auditId: string;
  observedAt: string;
};

export type ToolExecutionResult<T = unknown> =
  | { status: 'succeeded'; data: T; evidence: EvidenceRef[] }
  | { status: 'approval_required'; approval: NonNullable<ReturnType<typeof PolicyEngine.evaluate>['approvalCard']> }
  | { status: 'review_required'; reason: string }
  | { status: 'denied'; reason: string };

const emptyInput = z.object({}).strict();
const date = z.string().date();
const salesInput = z.object({ dateFrom: date.optional(), dateTo: date.optional() }).strict().refine(
  ({ dateFrom, dateTo }) => !dateFrom || !dateTo || dateFrom <= dateTo,
  { message: 'dateFrom must be on or before dateTo' },
);
const receivablesInput = emptyInput;
const inventoryInput = z.object({ lowStockThreshold: z.number().int().min(0).max(100_000).default(10) }).strict();
const customerSearchInput = z.object({ name: z.string().trim().min(1).max(128) }).strict();
const invoiceInput = z.object({
  customerId: z.union([z.string().trim().min(1).max(128), z.number().int().positive()]),
  lines: z.array(z.object({
    productId: z.union([z.string().trim().min(1).max(128), z.number().int().positive()]).optional(),
    description: z.string().trim().min(1).max(300),
    quantity: z.number().finite().positive().max(1_000_000),
    unitPrice: z.number().finite().nonnegative().max(1_000_000_000_000),
  }).strict()).min(1).max(100),
}).strict();

export const FINANCE_TOOLS: readonly FinanceTool<any, any>[] = [
  {
    name: 'get_sales_summary',
    domain: 'sales',
    description: 'Read sales totals and orders for an explicit date range.',
    riskClass: 'READ',
    inputSchema: salesInput,
    requiredCapability: 'canReadSales',
    execute: (ctx, input) => ctx.connector.getSalesSummary(input),
  },
  {
    name: 'get_receivables_summary',
    domain: 'accounts_receivable',
    description: 'Read outstanding customer balances and overdue invoices.',
    riskClass: 'READ',
    inputSchema: receivablesInput,
    requiredCapability: 'canReadInvoices',
    execute: (ctx) => ctx.connector.getReceivablesSummary(),
  },
  {
    name: 'get_inventory_levels',
    domain: 'inventory',
    description: 'Read stock levels and identify low-stock items.',
    riskClass: 'READ',
    inputSchema: inventoryInput,
    requiredCapability: 'canReadInventory',
    execute: (ctx, input) => ctx.connector.getInventoryLevels(input),
  },
  {
    name: 'search_customers',
    domain: 'customers',
    description: 'Search customer records by name.',
    riskClass: 'READ',
    inputSchema: customerSearchInput,
    requiredCapability: 'canReadCustomers',
    execute: (ctx, input) => ctx.connector.searchEntities('customer', {
      filter: [['name', 'ilike', input.name]],
      limit: 50,
    }),
  },
  {
    name: 'create_draft_invoice',
    domain: 'accounts_receivable',
    description: 'Prepare a customer invoice draft. Requires a server-side human approval.',
    riskClass: 'DRAFT_WRITE',
    inputSchema: invoiceInput,
    requiredCapability: 'canCreateDraftInvoices',
    execute: (ctx, input) => ctx.connector.createDraftInvoice(input),
  },
];

const toolByName = new Map(FINANCE_TOOLS.map((tool) => [tool.name, tool]));

export function resolveFinanceTool(name: string): FinanceTool<any, any> | null {
  return toolByName.get(name) ?? null;
}

export async function executeFinanceTool(
  ctx: FinanceToolContext,
  name: string,
  unknownInput: unknown,
): Promise<ToolExecutionResult> {
  const tool = resolveFinanceTool(name);
  if (!tool) return { status: 'denied', reason: 'Tool is not registered.' };

  const parsed = tool.inputSchema.safeParse(unknownInput);
  if (!parsed.success) return { status: 'denied', reason: 'Tool arguments do not match the registered schema.' };

  if (!ctx.capabilities[tool.requiredCapability]) {
    return { status: 'review_required', reason: `ERP capability ${tool.requiredCapability} is unavailable or unconfirmed.` };
  }

  const decision = PolicyEngine.evaluate({
    toolName: tool.name,
    category: tool.riskClass,
    parameters: parsed.data as Record<string, any>,
    operatorId: ctx.operatorId,
  });
  if (!decision.allowed) return { status: 'denied', reason: decision.reason };
  if (decision.requiresApproval && !ctx.approvalGranted) {
    if (!decision.approvalCard) return { status: 'review_required', reason: 'Policy requires approval but did not produce an approval record.' };
    return { status: 'approval_required', approval: decision.approvalCard };
  }

  try {
    const result = await tool.execute(ctx, parsed.data);
    if (!result.success) {
      return { status: 'review_required', reason: result.error?.message ?? 'ERP did not confirm the requested operation.' };
    }
    return {
      status: 'succeeded',
      data: result,
      evidence: [{
        provider: ctx.connector.getMetadata().provider,
        auditId: result.auditId,
        observedAt: new Date().toISOString(),
      }],
    };
  } catch {
    return { status: 'review_required', reason: 'ERP result is uncertain; reconcile it before retrying.' };
  }
}
