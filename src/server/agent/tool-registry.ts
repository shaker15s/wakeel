import { z } from 'zod';
import type { IERPConnector, ERPConnectionStatus, ExecutionResult } from '../erp/contract';
import { PolicyEngine } from '../policy/engine';
import { createDraftVendorBillInputSchema } from '../runtime/workflows/create-draft-vendor-bill';
import { calculateBudgetVariance, buildPeriodCloseChecklist } from '../accounting/budgets';
import { assessExpense } from '../accounting/expenses';
import { calculateAssetSchedule } from '../accounting/fixed-assets';
import { validateJournalDraft, type JournalDraftInput } from '../accounting/journal-entry';
import { proposeBankMatches } from '../accounting/reconciliation';

export type FinanceRiskClass = 'READ' | 'DRAFT_WRITE' | 'FINANCIAL_COMMIT' | 'DESTRUCTIVE';
export type FinanceCapability = Exclude<keyof ERPConnectionStatus['permissions'], 'rawPermissions'> | 'canCalculateAccounting';

export interface FinanceToolContext {
  /** Connector and permissions are resolved by trusted server code, never model input. */
  connector?: IERPConnector;
  operatorId: string;
  capabilities: Partial<Record<FinanceCapability, boolean>>;
  /** Set only by the server-side approval/runtime path. */
  approvalGranted?: boolean;
}

export interface FinanceTool<TInput = unknown, TOutput = unknown> {
  name: string;
  domain: 'sales' | 'accounts_receivable' | 'inventory' | 'customers' | 'accounts_payable' | 'accounting';
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
const accountingReportInput = z.object({ dateFrom: date.optional(), dateTo: date, currency: z.string().trim().regex(/^[A-Za-z]{3}$/) }).strict().refine(
  ({ dateFrom, dateTo }) => !dateFrom || dateFrom <= dateTo,
  { message: 'dateFrom must be on or before dateTo' },
);
const accountActivityInput = z.object({ accountId: z.string().trim().min(1).max(128), dateFrom: date, dateTo: date, currency: z.string().trim().regex(/^[A-Za-z]{3}$/) }).strict().refine(
  ({ dateFrom, dateTo }) => dateFrom <= dateTo,
  { message: 'dateFrom must be on or before dateTo' },
);
const agedBalancesInput = z.object({ kind: z.enum(['payable', 'receivable']), asOf: date, currency: z.string().trim().regex(/^[A-Za-z]{3}$/) }).strict();
const statementInput = z.object({ kind: z.enum(['profit_and_loss', 'balance_sheet', 'cash_flow']), dateFrom: date, dateTo: date, currency: z.string().trim().regex(/^[A-Za-z]{3}$/) }).strict().refine(
  ({ dateFrom, dateTo }) => dateFrom <= dateTo,
  { message: 'dateFrom must be on or before dateTo' },
);
const invoiceInput = z.object({
  customerId: z.union([z.string().trim().min(1).max(128), z.number().int().positive()]),
  lines: z.array(z.object({
    productId: z.union([z.string().trim().min(1).max(128), z.number().int().positive()]).optional(),
    description: z.string().trim().min(1).max(300),
    quantity: z.number().finite().positive().max(1_000_000),
    unitPrice: z.number().finite().nonnegative().max(1_000_000_000_000),
  }).strict()).min(1).max(100),
}).strict();

const moneyInput = z.object({ amount: z.string().max(80), currency: z.string().regex(/^[A-Za-z]{3}$/), scale: z.number().int().min(0).max(12) }).strict();
const budgetInput = z.object({ period: z.string().max(7), costCenter: z.string().max(128).optional(), actual: moneyInput, budget: moneyInput }).strict();
const closeInput = z.object({ period: z.string().max(7), controls: z.object({ bankReconciled: z.boolean().nullable(), subledgersReconciled: z.boolean().nullable(), trialBalanceBalanced: z.boolean().nullable(), taxReviewed: z.boolean().nullable() }).strict() }).strict();
const journalInput = z.object({
  date, currency: z.string().regex(/^[A-Za-z]{3}$/), description: z.string().max(500),
  lines: z.array(z.object({ accountId: z.string().min(1).max(128), debit: moneyInput, credit: moneyInput, description: z.string().max(300).optional(), reference: z.string().max(128).nullable().optional() }).strict()).min(2).max(200),
}).strict();
const reconciliationLine = z.object({ id: z.string().min(1).max(128), date, amount: moneyInput, description: z.string().max(300), reference: z.string().max(128).nullable() }).strict();
const reconciliationInput = z.object({
  statementLines: z.array(reconciliationLine).max(500),
  ledgerItems: z.array(reconciliationLine).max(2_000),
  policy: z.object({ maxDateDifferenceDays: z.number().int().min(0).max(365), nearAmountTolerance: moneyInput, minimumScore: z.number().int().min(0).max(100) }).strict(),
}).strict();
const expenseInput = z.object({ date, amount: moneyInput, description: z.string().max(500), category: z.string().max(128), receiptPresent: z.boolean() }).strict();
const assetInput = z.object({ assetId: z.string().max(128), inServiceDate: date, cost: moneyInput, residualValue: moneyInput, usefulLifeMonths: z.number().int().min(1).max(1200), method: z.enum(['straight_line', 'declining_balance']) }).strict();

export function financeToolCapabilities(permissions?: ERPConnectionStatus['permissions'] | null): Partial<Record<FinanceCapability, boolean>> {
  return { ...(permissions ?? {}), canReadAccounting: permissions?.canReadAccounting === true, canCalculateAccounting: true };
}

function localResult<T>(data: T): ExecutionResult<T> {
  return { success: true, data, durationMs: 0, auditId: `local-calculation-${crypto.randomUUID()}` };
}

export const FINANCE_TOOLS: readonly FinanceTool<any, any>[] = [
  {
    name: 'get_sales_summary',
    domain: 'sales',
    description: 'Read sales totals and orders for an explicit date range.',
    riskClass: 'READ',
    inputSchema: salesInput,
    requiredCapability: 'canReadSales',
    execute: (ctx, input) => ctx.connector!.getSalesSummary(input),
  },
  {
    name: 'get_receivables_summary',
    domain: 'accounts_receivable',
    description: 'Read outstanding customer balances and overdue invoices.',
    riskClass: 'READ',
    inputSchema: receivablesInput,
    requiredCapability: 'canReadInvoices',
    execute: (ctx) => ctx.connector!.getReceivablesSummary(),
  },
  {
    name: 'get_inventory_levels',
    domain: 'inventory',
    description: 'Read stock levels and identify low-stock items.',
    riskClass: 'READ',
    inputSchema: inventoryInput,
    requiredCapability: 'canReadInventory',
    execute: (ctx, input) => ctx.connector!.getInventoryLevels(input),
  },
  {
    name: 'search_customers',
    domain: 'customers',
    description: 'Search customer records by name.',
    riskClass: 'READ',
    inputSchema: customerSearchInput,
    requiredCapability: 'canReadCustomers',
    execute: (ctx, input) => ctx.connector!.searchEntities('customer', {
      filter: [['name', 'ilike', input.name]],
      limit: 50,
    }),
  },
  {
    name: 'get_chart_of_accounts', domain: 'accounting', description: 'Read the verified chart of accounts.', riskClass: 'READ', inputSchema: emptyInput, requiredCapability: 'canReadAccounting',
    execute: (ctx) => ctx.connector!.getChartOfAccounts(),
  },
  {
    name: 'get_trial_balance', domain: 'accounting', description: 'Read debit and credit totals by account for an explicit date range and currency.', riskClass: 'READ', inputSchema: accountingReportInput, requiredCapability: 'canReadAccounting',
    execute: (ctx, input) => ctx.connector!.getTrialBalance(input),
  },
  {
    name: 'get_account_activity', domain: 'accounting', description: 'Read ledger activity for one account, date range, and currency.', riskClass: 'READ', inputSchema: accountActivityInput, requiredCapability: 'canReadAccounting',
    execute: (ctx, input) => ctx.connector!.getAccountActivity(input),
  },
  {
    name: 'get_aged_balances', domain: 'accounting', description: 'Read payable or receivable aging buckets for an as-of date and currency.', riskClass: 'READ', inputSchema: agedBalancesInput, requiredCapability: 'canReadAccounting',
    execute: (ctx, input) => ctx.connector!.getAgedBalances(input),
  },
  {
    name: 'get_financial_statement', domain: 'accounting', description: 'Read a profit and loss or balance sheet report; cash flow is returned as review-required until configured.', riskClass: 'READ', inputSchema: statementInput, requiredCapability: 'canReadAccounting',
    execute: (ctx, input) => ctx.connector!.getFinancialStatement(input),
  },
  {
    name: 'create_draft_customer_invoice',
    domain: 'accounts_receivable',
    description: 'Prepare a customer invoice draft for a verified customer. Never use this for supplier bills; a durable human approval is mandatory.',
    riskClass: 'DRAFT_WRITE',
    inputSchema: invoiceInput,
    requiredCapability: 'canCreateDraftInvoices',
    execute: (ctx, input) => ctx.connector!.createDraftInvoice(input),
  },
  {
    name: 'create_draft_vendor_bill',
    domain: 'accounts_payable',
    description: 'Prepare a vendor-bill draft after checking vendor identity and the exact approved amount. A durable human approval is mandatory.',
    riskClass: 'DRAFT_WRITE',
    inputSchema: createDraftVendorBillInputSchema,
    requiredCapability: 'canCreateDraftVendorBills',
    execute: async () => ({ success: false, error: { code: 'DURABLE_APPROVAL_REQUIRED', message: 'Vendor-bill drafts require the persisted approval task workflow.' }, durationMs: 0, auditId: `vendor-bill-approval-required-${Date.now()}` }),
  },
  {
    name: 'calculate_budget_variance', domain: 'accounting', description: 'Calculate a variance from user-supplied amounts only; this does not read live ledger data.', riskClass: 'READ', inputSchema: budgetInput, requiredCapability: 'canCalculateAccounting',
    execute: async (_ctx, input) => localResult(calculateBudgetVariance(input.actual, input.budget, input)),
  },
  {
    name: 'build_period_close_checklist', domain: 'accounting', description: 'Organize explicitly supplied close-control statuses into a checklist; never closes or posts a period.', riskClass: 'READ', inputSchema: closeInput, requiredCapability: 'canCalculateAccounting',
    execute: async (_ctx, input) => localResult(buildPeriodCloseChecklist(input.period, input.controls)),
  },
  {
    name: 'assess_expense', domain: 'accounting', description: 'Check expense intake against a server-configured company policy. Company policy and tax treatment are not inferred; absent policy always requires review.', riskClass: 'READ', inputSchema: expenseInput, requiredCapability: 'canCalculateAccounting',
    execute: async (_ctx, input) => localResult(assessExpense(input, null)),
  },
  {
    name: 'calculate_asset_schedule', domain: 'accounting', description: 'Calculate an estimate only when server-configured depreciation policy is available. This tool never posts depreciation.', riskClass: 'READ', inputSchema: assetInput, requiredCapability: 'canCalculateAccounting',
    execute: async (_ctx, input) => localResult(calculateAssetSchedule(input, null)),
  },
  {
    name: 'propose_bank_matches', domain: 'accounting', description: 'Rank supplied bank and ledger lines as review-only match suggestions. Never reconciles or changes either source.', riskClass: 'READ', inputSchema: reconciliationInput, requiredCapability: 'canCalculateAccounting',
    execute: async (_ctx, input) => localResult({ source: 'user_supplied', mutatesLedger: false, proposals: proposeBankMatches(input.statementLines, input.ledgerItems, input.policy) }),
  },
  {
    name: 'prepare_journal_entry_proposal', domain: 'accounting', description: 'Prepare a balanced, unposted journal proposal against the verified chart of accounts. Human review is required; this never writes or posts.', riskClass: 'READ', inputSchema: journalInput, requiredCapability: 'canReadAccounting',
    execute: async (ctx, input) => {
      const chart = await ctx.connector!.getChartOfAccounts();
      const accounts = (chart.data as { accounts?: Array<{ id?: unknown }> } | undefined)?.accounts;
      if (!chart.success || !Array.isArray(accounts) || accounts.some((account) => typeof account.id !== 'string')) {
        return { success: false, error: { code: 'VERIFIED_CHART_UNAVAILABLE', message: 'A verified, typed chart of accounts is required.' }, durationMs: chart.durationMs, auditId: chart.auditId };
      }
      try {
        const proposal = validateJournalDraft(input as JournalDraftInput, accounts as Array<{ id: string }>);
        return localResult(proposal);
      } catch (error) {
        return { success: false, error: { code: 'JOURNAL_REQUIRES_REVIEW', message: error instanceof Error ? error.message : 'Journal draft requires review.' }, durationMs: 0, auditId: `journal-review-${crypto.randomUUID()}` };
      }
    },
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

  if (!ctx.capabilities[tool.requiredCapability] || (tool.requiredCapability !== 'canCalculateAccounting' && !ctx.connector)) {
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
        provider: ctx.connector?.getMetadata().provider ?? 'local_calculation',
        auditId: result.auditId,
        observedAt: new Date().toISOString(),
      }],
    };
  } catch {
    return { status: 'review_required', reason: 'ERP result is uncertain; reconcile it before retrying.' };
  }
}
