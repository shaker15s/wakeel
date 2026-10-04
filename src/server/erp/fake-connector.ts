import {
  EntityDefinition,
  ERPConnectionStatus,
  ERPMetadata,
  ExecutionResult,
  IERPConnector,
} from './contract';

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

export class FakeERPConnector implements IERPConnector {
  private invoices: FakeInvoiceRecord[] = [];
  private nextId = 1;
  private invoiceBehaviorQueue: InvoiceFaultBehavior[] = [];
  private verificationDrift: Partial<FakeInvoiceRecord> | null = null;

  /**
   * Test hook: queue the behavior for the next N createDraftInvoice() calls,
   * consumed one at a time (FIFO). Once the queue is empty, calls behave as
   * `'success'`. Use this (rather than a single flag) when a test needs
   * several consecutive failures, e.g. to exhaust a step's retry budget.
   */
  queueInvoiceBehavior(behavior: InvoiceFaultBehavior): void {
    this.invoiceBehaviorQueue.push(behavior);
  }

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
    return { success: true, data: null, durationMs: Date.now() - start, auditId: `fake-${Date.now()}` };
  }

  async getSalesSummary(): Promise<ExecutionResult<{ totalRevenue: number; orderCount: number; currency: string; orders: any[] }>> {
    return { success: true, data: { totalRevenue: 0, orderCount: 0, currency: 'EGP', orders: [] }, durationMs: 1, auditId: 'fake' };
  }

  async getReceivablesSummary(): Promise<ExecutionResult<{ totalOutstanding: number; overdueCount: number; currency: string; debtors: any[] }>> {
    return { success: true, data: { totalOutstanding: 0, overdueCount: 0, currency: 'EGP', debtors: [] }, durationMs: 1, auditId: 'fake' };
  }

  async getInventoryLevels(): Promise<ExecutionResult<{ totalItems: number; lowStockItems: any[] }>> {
    return { success: true, data: { totalItems: 0, lowStockItems: [] }, durationMs: 1, auditId: 'fake' };
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

  async findByIdempotencyKey(entityId: string, idempotencyKey: string): Promise<ExecutionResult<any | null>> {
    const start = Date.now();
    if (entityId !== 'invoice') {
      return { success: true, data: null, durationMs: Date.now() - start, auditId: `fake-${Date.now()}` };
    }
    const found = this.invoices.find((i) => i.idempotencyKey === idempotencyKey) ?? null;
    return { success: true, data: found, durationMs: Date.now() - start, auditId: `fake-${Date.now()}` };
  }
}
