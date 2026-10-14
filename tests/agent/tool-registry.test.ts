import { describe, expect, it, vi } from 'vitest';
import { FakeERPConnector } from '@/server/erp/fake-connector';
import { ERP_TOOLS } from '@/server/agent/tools';
import { executeFinanceTool, financeToolCapabilities, FINANCE_TOOLS, resolveFinanceTool } from '@/server/agent/tool-registry';
import type { FinanceToolContext } from '@/server/agent/tool-registry';

const createContext = (connector = new FakeERPConnector(), overrides: Partial<FinanceToolContext> = {}) => ({
  connector,
  operatorId: 'operator-1',
  capabilities: {
    canReadSales: true,
    canReadCustomers: true,
    canReadInvoices: true,
    canReadInventory: true,
    canCreateDraftInvoices: true,
    canCreateDraftPurchases: false,
    canMutateFinancials: false,
    canReadAccounting: true,
    canCreateDraftVendorBills: true,
  },
  ...overrides,
});

describe('finance tool registry', () => {
  it('registers unique tools with Zod schemas, risk classes, and handlers', () => {
    const names = FINANCE_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(ERP_TOOLS.map((tool) => tool.name)));
    expect(ERP_TOOLS.find((tool) => tool.name === 'get_sales_summary')?.parametersSchema).toMatchObject({
      type: 'object',
      properties: { dateFrom: { type: 'string', format: 'date' } },
      additionalProperties: false,
    });
    for (const tool of FINANCE_TOOLS) {
      expect(tool.inputSchema.safeParse({}).success).toEqual(expect.any(Boolean));
      expect(['READ', 'DRAFT_WRITE', 'FINANCIAL_COMMIT', 'DESTRUCTIVE']).toContain(tool.riskClass);
      expect(typeof tool.execute).toBe('function');
      expect(resolveFinanceTool(tool.name)).toBe(tool);
    }
  });

  it('denies unknown names without touching the connector', async () => {
    const connector = new FakeERPConnector();
    const probe = vi.spyOn(connector, 'testConnection');

    await expect(executeFinanceTool(createContext(connector), 'anything', {})).resolves.toMatchObject({ status: 'denied' });
    expect(probe).not.toHaveBeenCalled();
    expect(resolveFinanceTool('anything')).toBeNull();
  });

  it('rejects malformed model arguments before any ERP call', async () => {
    const connector = new FakeERPConnector();
    const read = vi.spyOn(connector, 'getSalesSummary');
    const result = await executeFinanceTool(createContext(connector), 'get_sales_summary', { dateFrom: 5, extra: 'ignored?' });

    expect(result).toMatchObject({ status: 'denied' });
    expect(read).not.toHaveBeenCalled();
  });

  it('routes only to the handler registered for the selected read tool', async () => {
    const connector = new FakeERPConnector();
    const sales = vi.spyOn(connector, 'getSalesSummary');
    const write = vi.spyOn(connector, 'createDraftInvoice');

    const result = await executeFinanceTool(createContext(connector), 'get_sales_summary', {});

    expect(result.status).toBe('succeeded');
    expect(sales).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
  });

  it('returns deterministic report evidence through the typed read-only accounting tool', async () => {
    const connector = new FakeERPConnector();
    const result = await executeFinanceTool(createContext(connector), 'get_trial_balance', {
      dateFrom: '2026-01-01', dateTo: '2026-01-31', currency: 'EGP',
    });
    expect(result.status).toBe('succeeded');
    if (result.status === 'succeeded') {
      expect(result.evidence[0].provider).toBe('custom');
      expect(result.data).toMatchObject({ data: { totals: { balanced: true }, evidence: { calculationVersion: 'wakeel-accounting-v1' } } });
    }
  });

  it('does not call the connector when the server-derived capability is unavailable', async () => {
    const connector = new FakeERPConnector();
    const read = vi.spyOn(connector, 'getSalesSummary');
    const result = await executeFinanceTool(createContext(connector, {
      capabilities: { canReadSales: false },
    }), 'get_sales_summary', {});

    expect(result).toMatchObject({ status: 'review_required' });
    expect(read).not.toHaveBeenCalled();
  });

  it('returns an approval request instead of executing a draft write', async () => {
    const connector = new FakeERPConnector();
    const write = vi.spyOn(connector, 'createDraftInvoice');
    const result = await executeFinanceTool(createContext(connector), 'create_draft_customer_invoice', {
      customerId: 12,
      lines: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
    });

    expect(result.status).toBe('approval_required');
    expect(write).not.toHaveBeenCalled();
  });

  it('requires durable approval for a vendor bill and never writes from a model tool call', async () => {
    const connector = new FakeERPConnector();
    const write = vi.spyOn(connector, 'createDraftVendorBill');
    const result = await executeFinanceTool(createContext(connector), 'create_draft_vendor_bill', {
      vendorId: 'vendor-1', vendorBillReference: 'SUP-1', billDate: '2026-02-01', currency: 'EGP',
      lines: [{ description: 'Paper', quantity: '2', unitPrice: '10.25' }],
    });
    expect(result.status).toBe('approval_required');
    expect(write).not.toHaveBeenCalled();
  });

  it('exposes deterministic accounting calculators without granting ERP read capabilities', async () => {
    const capabilities = financeToolCapabilities(null);
    expect(capabilities.canCalculateAccounting).toBe(true);
    expect(capabilities.canReadAccounting).toBe(false);
    const names = FINANCE_TOOLS.filter((tool) => capabilities[tool.requiredCapability]).map((tool) => tool.name);
    expect(names).toContain('calculate_budget_variance');
    expect(names).not.toContain('get_trial_balance');

    const result = await executeFinanceTool({ operatorId: 'operator-1', capabilities }, 'calculate_budget_variance', {
      period: '2026-09', actual: { amount: '120.00', currency: 'EGP', scale: 2 }, budget: { amount: '100.00', currency: 'EGP', scale: 2 },
    });
    expect(result).toMatchObject({ status: 'succeeded', data: { data: { status: 'over_budget', variance: { amount: '20.00', currency: 'EGP' } } } });
    if (result.status === 'succeeded') expect(result.evidence[0].provider).toBe('local_calculation');
  });

  it('keeps journal preparation a balanced proposal and never posts it', async () => {
    const result = await executeFinanceTool({ operatorId: 'operator-1', capabilities: { canCalculateAccounting: true } }, 'prepare_journal_entry_proposal', {
      date: '2026-09-30', currency: 'EGP', description: 'Accrual',
      lines: [
        { accountId: 'expense', debit: { amount: '50.00', currency: 'EGP', scale: 2 }, credit: { amount: '0.00', currency: 'EGP', scale: 2 } },
        { accountId: 'accrual', debit: { amount: '0.00', currency: 'EGP', scale: 2 }, credit: { amount: '50.00', currency: 'EGP', scale: 2 } },
      ],
    });
    expect(result).toMatchObject({ status: 'review_required' });
  });

  it('uses the connector chart instead of model-supplied account authorization for journal proposals', async () => {
    const connector = new FakeERPConnector();
    const chart = vi.spyOn(connector, 'getChartOfAccounts');
    const result = await executeFinanceTool(createContext(connector), 'prepare_journal_entry_proposal', {
      date: '2026-09-30', currency: 'EGP', description: 'Accrual',
      lines: [
        { accountId: 'expense-egp', debit: { amount: '50.00', currency: 'EGP', scale: 2 }, credit: { amount: '0.00', currency: 'EGP', scale: 2 } },
        { accountId: 'payable-egp', debit: { amount: '0.00', currency: 'EGP', scale: 2 }, credit: { amount: '50.00', currency: 'EGP', scale: 2 } },
      ],
    });
    expect(chart).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: 'succeeded', data: { data: { status: 'draft', posted: false } } });
  });

  it('never invents expense policy or tax treatment when company policy is unavailable', async () => {
    const result = await executeFinanceTool({ operatorId: 'operator-1', capabilities: { canCalculateAccounting: true } }, 'assess_expense', {
      date: '2026-09-30', amount: { amount: '50.00', currency: 'EGP', scale: 2 }, description: 'Taxi', category: 'travel', receiptPresent: true,
    });
    expect(result).toMatchObject({ status: 'succeeded', data: { data: { status: 'review_required', reasons: ['expense_policy_missing'], taxTreatment: { status: 'review_required' } } } });
  });
});
