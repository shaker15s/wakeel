import {
  EntityDefinition,
  ERPConnectionStatus,
  ERPMetadata,
  ExecutionResult,
  IERPConnector,
} from './contract';
import { calculateAgedBalances, calculateFinancialStatement, calculateTrialBalance, readAccountActivity, readChartOfAccounts, type AccountingDataset } from '../accounting/read-tools';
import { createMoney, MoneyMath, type Money } from '../accounting/money';

function demoMoney(amount: string, currency: string): Money {
  return { amount, currency, scale: currency === 'JPY' ? 0 : 2 };
}

export function createDemoAccountingDataset(): AccountingDataset {
  return {
    sourceSystem: 'fake-erp-synthetic-fixture',
    accounts: [
      { id: 'cash-egp', code: '1000', name: 'Cash', type: 'asset', currency: 'EGP' },
      { id: 'receivable-egp', code: '1100', name: 'Accounts receivable', type: 'asset', currency: 'EGP' },
      { id: 'payable-egp', code: '2000', name: 'Accounts payable', type: 'liability', currency: 'EGP' },
      { id: 'equity-egp', code: '3000', name: 'Owner equity', type: 'equity', currency: 'EGP' },
      { id: 'revenue-egp', code: '4000', name: 'Service revenue', type: 'income', currency: 'EGP' },
      { id: 'expense-egp', code: '5000', name: 'Office expense', type: 'expense', currency: 'EGP' },
    ],
    lines: [
      { id: 'demo-1a', journalId: 'demo-1', accountId: 'cash-egp', date: '2026-01-01', debit: demoMoney('10000.00', 'EGP'), credit: demoMoney('0.00', 'EGP'), reference: 'DEMO-OPENING' },
      { id: 'demo-1b', journalId: 'demo-1', accountId: 'equity-egp', date: '2026-01-01', debit: demoMoney('0.00', 'EGP'), credit: demoMoney('10000.00', 'EGP'), reference: 'DEMO-OPENING' },
      { id: 'demo-2a', journalId: 'demo-2', accountId: 'receivable-egp', date: '2026-01-15', debit: demoMoney('2500.00', 'EGP'), credit: demoMoney('0.00', 'EGP'), reference: 'DEMO-AR-001' },
      { id: 'demo-2b', journalId: 'demo-2', accountId: 'revenue-egp', date: '2026-01-15', debit: demoMoney('0.00', 'EGP'), credit: demoMoney('2500.00', 'EGP'), reference: 'DEMO-AR-001' },
      { id: 'demo-3a', journalId: 'demo-3', accountId: 'expense-egp', date: '2026-01-20', debit: demoMoney('300.00', 'EGP'), credit: demoMoney('0.00', 'EGP'), reference: 'DEMO-EXP-001' },
      { id: 'demo-3b', journalId: 'demo-3', accountId: 'cash-egp', date: '2026-01-20', debit: demoMoney('0.00', 'EGP'), credit: demoMoney('300.00', 'EGP'), reference: 'DEMO-EXP-001' },
    ],
    openBalances: [
      { id: 'demo-ap-001', kind: 'payable', partner: 'Demo Supplier', dueDate: '2026-01-10', amount: demoMoney('750.00', 'EGP') },
      { id: 'demo-ar-001', kind: 'receivable', partner: 'Demo Customer', dueDate: '2026-02-10', amount: demoMoney('2500.00', 'EGP') },
    ],
  };
}

/**
 * Deterministic fake ERP connector for tests — no network, no real Odoo.
 *
 * Implements `IERPConnector` plus the OPTIONAL `findByIdempotencyKey`
 * capability so the runtime's full idempotency/reconciliation path
 * (docs/implementation/00-repo-audit.md §9, PRD §9) can actually be tested
 * end-to-end, including the "external side effect succeeded but the caller
 * never found out" crash scenario, which is the hardest case to get right
 * and the one most other test suites skip.
 *
 * Fault injection is configured per-instance via `setNextInvoiceBehavior()`
 * and consumed once (reset to 'success' after the next matching call), so
 * tests stay readable: arrange one faulty call, assert on it, move on.
 */
export type InvoiceFaultBehavior =
  | 'success'
  | 'transient_error' // simulates a network/timeout failure; NOTHING is created
  | 'validation_error' // simulates a permanent, non-ambiguous rejection; NOTHING is created
  | 'crash_after_write'; // the record IS created in the fake backing store, but the call throws anyway

interface FakeInvoiceRecord {
  id: number;
  customerId: string | number;
  lines: Array<{ productId?: string | number; description: string; quantity: number; unitPrice: number }>;
  totalAmount: number;
  idempotencyKey?: string;
  createdAt: string;
}

interface FakeVendorBillRecord {
  id: number; vendorId: string | number; vendorBillReference: string; billDate: string;
  currency: string; totalAmount: string; documentKind: 'vendor_bill'; moveType: 'in_invoice'; state: 'draft';
  lines: Array<{ description: string; quantity: string; unitPrice: string }>; idempotencyKey: string;
}

export class FakeERPConnector implements IERPConnector {
  private invoices: FakeInvoiceRecord[] = [];
  private nextId = 1;
  private invoiceBehaviorQueue: InvoiceFaultBehavior[] = [];
  private verificationDrift: Partial<FakeInvoiceRecord> | null = null;
  constructor(private accountingDataset: AccountingDataset = createDemoAccountingDataset()) {}
  private vendorBills: FakeVendorBillRecord[] = [];
  private vendorBillBehaviorQueue: InvoiceFaultBehavior[] = [];

  /**
   * Test hook: queue the behavior for the next N createDraftInvoice() calls,
   * consumed one at a time (FIFO). Once the queue is empty, calls behave as
   * `'success'`. Use this (rather than a single flag) when a test needs
   * several consecutive failures, e.g. to exhaust a step's retry budget.
   */
  queueInvoiceBehavior(behavior: InvoiceFaultBehavior): void {
    this.invoiceBehaviorQueue.push(behavior);
  }

  queueVendorBillBehavior(behavior: InvoiceFaultBehavior): void { this.vendorBillBehaviorQueue.push(behavior); }
  getCreatedVendorBills(): ReadonlyArray<FakeVendorBillRecord> { return this.vendorBills.map((bill) => ({ ...bill, lines: bill.lines.map((line) => ({ ...line })) })); }

  /** Test hook: inspect everything "created" so far, e.g. to assert call count. */
  getCreatedInvoices(): ReadonlyArray<FakeInvoiceRecord> {
    return this.invoices.map((i) => ({ ...i }));
  }

  /**
   * Test hook: make the NEXT getEntityById('invoice', ...) call return data
   * patched with `drift`, without touching the real backing record. Used to
   * simulate a read-after-write verification mismatch (e.g. the ERP
   * silently changed something) without needing the create call itself to
   * behave abnormally.
   */
  simulateVerificationDrift(drift: Partial<FakeInvoiceRecord>): void {
    this.verificationDrift = drift;
  }

  getMetadata(): ERPMetadata {
    return {
      provider: 'custom',
      version: 'fake-1.0',
      serverUrl: 'fake://local',
      database: 'fake',
      connectedAt: new Date().toISOString(),
      operatorId: 'fake-operator',
    };
  }

  async testConnection(): Promise<ERPConnectionStatus> {
    return {
      healthy: true,
      authenticated: true,
      latencyMs: 1,
      user: { id: 1, name: 'Fake User', login: 'fake' },
      permissions: {
        canReadSales: true,
        canReadCustomers: true,
        canReadInvoices: true,
        canReadInventory: true,
        canCreateDraftInvoices: true,
        canCreateDraftPurchases: true,
        canMutateFinancials: false,
        canReadAccounting: true,
        canCreateDraftVendorBills: true,
        rawPermissions: {},
      },
      confirmedEntities: ['customer', 'sale_order', 'invoice', 'product'],
    };
  }

  async discoverSchema(): Promise<EntityDefinition[]> {
    return [];
  }

  async searchEntities(entityId: string, query: { filter?: any; limit?: number; offset?: number }): Promise<ExecutionResult<any[]>> {
    const start = Date.now();
    if (entityId === 'invoice') {
      return {
        success: true,
        data: this.invoices.map((i) => ({ ...i })),
        durationMs: Date.now() - start,
        auditId: `fake-${Date.now()}`,
      };
    }
    return { success: true, data: [], durationMs: Date.now() - start, auditId: `fake-${Date.now()}` };
  }

  async getEntityById(entityId: string, id: string | number): Promise<ExecutionResult<any>> {
    const start = Date.now();
    if (entityId === 'invoice') {
      const found = this.invoices.find((i) => i.id === Number(id)) ?? null;
      let data: any = found ? { ...found } : null;
      if (data && this.verificationDrift) {
        data = { ...data, ...this.verificationDrift };
        this.verificationDrift = null; // one-shot
      }
      return { success: true, data, durationMs: Date.now() - start, auditId: `fake-${Date.now()}` };
    }
    if (entityId === 'vendor_bill') {
      const found = this.vendorBills.find((bill) => bill.id === Number(id)) ?? null;
      return { success: true, data: found ? { ...found, lines: found.lines.map((line) => ({ ...line })) } : null, durationMs: Date.now() - start, auditId: `fake-${Date.now()}` };
    }
    return { success: true, data: null, durationMs: Date.now() - start, auditId: `fake-${Date.now()}` };
  }

  async getSalesSummary(): Promise<ExecutionResult<{ totalRevenue: string; orderCount: number; currency: string | null; orders: any[] }>> {
    return { success: true, data: { totalRevenue: '0.00', orderCount: 0, currency: null, orders: [] }, durationMs: 1, auditId: 'fake' };
  }

  async getReceivablesSummary(): Promise<ExecutionResult<{ totalOutstanding: string; overdueCount: number; currency: string | null; debtors: any[] }>> {
    return { success: true, data: { totalOutstanding: '0.00', overdueCount: 0, currency: null, debtors: [] }, durationMs: 1, auditId: 'fake' };
  }

  async getInventoryLevels(): Promise<ExecutionResult<{ totalItems: number; lowStockItems: any[] }>> {
    return { success: true, data: { totalItems: 0, lowStockItems: [] }, durationMs: 1, auditId: 'fake' };
  }

  async getChartOfAccounts(): Promise<ExecutionResult<any>> {
    return this.accountingRead(() => readChartOfAccounts(this.accountingDataset));
  }

  async getTrialBalance(params: { dateFrom?: string; dateTo: string; currency: string }): Promise<ExecutionResult<any>> {
    return this.accountingRead(() => calculateTrialBalance(this.accountingDataset, params));
  }

  async getAccountActivity(params: { accountId: string; dateFrom: string; dateTo: string; currency: string }): Promise<ExecutionResult<any>> {
    return this.accountingRead(() => readAccountActivity(this.accountingDataset, params));
  }

  async getAgedBalances(params: { kind: 'payable' | 'receivable'; asOf: string; currency: string }): Promise<ExecutionResult<any>> {
    return this.accountingRead(() => calculateAgedBalances(this.accountingDataset, params));
  }

  async getFinancialStatement(params: { kind: 'profit_and_loss' | 'balance_sheet' | 'cash_flow'; dateFrom: string; dateTo: string; currency: string }): Promise<ExecutionResult<any>> {
    return this.accountingRead(() => calculateFinancialStatement(this.accountingDataset, params));
  }

  async verifyPartnerRole(partnerId: string | number, role: 'customer' | 'vendor'): Promise<ExecutionResult<{ partnerId: string | number; role: 'customer' | 'vendor'; matches: boolean }>> {
    const matches = role === 'vendor' ? String(partnerId) === 'vendor-1' : String(partnerId) === 'customer-1';
    return { success: true, data: { partnerId, role, matches }, durationMs: 1, auditId: 'fake-partner-role' };
  }

  private accountingRead<T>(read: () => T): ExecutionResult<T> {
    try { return { success: true, data: read(), durationMs: 1, auditId: `fake-accounting-${Date.now()}` }; }
    catch (error) { return { success: false, error: { code: 'ACCOUNTING_READ_REVIEW_REQUIRED', message: error instanceof Error ? error.message : 'Accounting read is unavailable.' }, durationMs: 1, auditId: `fake-accounting-${Date.now()}` }; }
  }

  async createDraftInvoice(
    payload: { customerId: string | number; lines: Array<{ productId?: string | number; description: string; quantity: number; unitPrice: number }> },
    idempotencyKey?: string,
  ): Promise<ExecutionResult<{ invoiceId: string | number; invoiceNumber?: string; state: 'draft' }>> {
    const start = Date.now();
    const behavior = this.invoiceBehaviorQueue.shift() ?? 'success';

    if (behavior === 'transient_error') {
      throw new Error('ETIMEDOUT: simulated transient network failure (no side effect occurred)');
    }
    if (behavior === 'validation_error') {
      return {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'simulated permanent validation failure (no side effect occurred)' },
        durationMs: Date.now() - start,
        auditId: `fake-${Date.now()}`,
      };
    }

    const totalAmount = payload.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
    const record: FakeInvoiceRecord = {
      id: this.nextId++,
      customerId: payload.customerId,
      lines: payload.lines,
      totalAmount,
      idempotencyKey,
      createdAt: new Date().toISOString(),
    };
    this.invoices.push(record);

    if (behavior === 'crash_after_write') {
      // The "external side effect" above already happened and is now
      // sitting in the fake backing store — exactly like a real ERP that
      // received and committed the request before the HTTP response made it
      // back to WAKIL. This is the scenario the idempotency/reconciliation
      // layer exists for.
      throw new Error('ECONNRESET: simulated crash AFTER the write succeeded upstream');
    }

    return {
      success: true,
      data: { invoiceId: record.id, invoiceNumber: `FAKE-INV-${record.id}`, state: 'draft' },
      durationMs: Date.now() - start,
      auditId: `fake-${Date.now()}`,
    };
  }

  async createDraftPurchaseOrder(): Promise<ExecutionResult<{ orderId: string | number; state: 'draft' }>> {
    return { success: true, data: { orderId: 1, state: 'draft' }, durationMs: 1, auditId: 'fake' };
  }

  async createDraftVendorBill(
    payload: { vendorId: string | number; vendorBillReference: string; billDate: string; currency: string; lines: Array<{ description: string; quantity: string; unitPrice: string }> },
    idempotencyKey: string,
  ): Promise<ExecutionResult<{ vendorBillId: string | number; vendorBillReference: string; vendorId: string | number; currency: string; totalAmount: string; documentKind: 'vendor_bill'; moveType: 'in_invoice'; state: 'draft' }>> {
    const start = Date.now();
    const behavior = this.vendorBillBehaviorQueue.shift() ?? 'success';
    if (behavior === 'transient_error') throw new Error('ETIMEDOUT: simulated vendor bill failure before write.');
    if (behavior === 'validation_error') return { success: false, error: { code: 'VALIDATION_ERROR', message: 'Synthetic vendor validation failed.' }, durationMs: Date.now() - start, auditId: `fake-${Date.now()}` };
    if (this.vendorBills.some((bill) => bill.vendorBillReference === payload.vendorBillReference)) {
      return { success: false, error: { code: 'DUPLICATE_VENDOR_REFERENCE', message: 'Vendor bill reference already exists.' }, durationMs: Date.now() - start, auditId: `fake-${Date.now()}` };
    }
    const currency = payload.currency.toUpperCase();
    const scale = createMoney('0', currency).scale;
    let total = createMoney('0', currency, scale);
    for (const line of payload.lines) total = MoneyMath.add(total, MoneyMath.multiply(createMoney(line.unitPrice, currency), line.quantity, scale));
    const bill: FakeVendorBillRecord = { id: this.vendorBills.length + 1, ...payload, currency, totalAmount: total.amount, documentKind: 'vendor_bill', moveType: 'in_invoice', state: 'draft', idempotencyKey };
    this.vendorBills.push(bill);
    if (behavior === 'crash_after_write') throw new Error('ECONNRESET: synthetic crash after vendor bill write.');
    return { success: true, data: { vendorBillId: bill.id, vendorBillReference: bill.vendorBillReference, vendorId: bill.vendorId, currency, totalAmount: total.amount, documentKind: bill.documentKind, moveType: bill.moveType, state: bill.state }, durationMs: Date.now() - start, auditId: `fake-vendor-bill-${bill.id}` };
  }

  async findByIdempotencyKey(entityId: string, idempotencyKey: string): Promise<ExecutionResult<any | null>> {
    const start = Date.now();
    if (entityId !== 'invoice') {
      if (entityId === 'vendor_bill') {
        const found = this.vendorBills.find((bill) => bill.idempotencyKey === idempotencyKey) ?? null;
        return { success: true, data: found, durationMs: Date.now() - start, auditId: `fake-${Date.now()}` };
      }
      return { success: true, data: null, durationMs: Date.now() - start, auditId: `fake-${Date.now()}` };
    }
    const found = this.invoices.find((i) => i.idempotencyKey === idempotencyKey) ?? null;
    return { success: true, data: found, durationMs: Date.now() - start, auditId: `fake-${Date.now()}` };
  }
}
