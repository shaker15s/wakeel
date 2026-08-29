import {
  EntityDefinition,
  ERPConnectionStatus,
  ERPMetadata,
  ExecutionResult,
  IERPConnector,
} from './contract';

export interface OdooConfig {
  url: string;
  db: string;
  username: string;
  apiKeyOrPassword: string;
  operatorId: string;
}

/**
 * Odoo 19 External Connector
 *
 * Grounded in Odoo's official External API specification:
 * Operates strictly with user-delegated permissions (no superuser bypass).
 */
export class Odoo19Connector implements IERPConnector {
  private config: OdooConfig;
  private uid: number | null = null;

  constructor(config: OdooConfig) {
    this.config = {
      ...config,
      url: config.url.replace(/\/+$/, ''),
    };
  }

  getMetadata(): ERPMetadata {
    return {
      provider: 'odoo',
      version: '19.0',
      serverUrl: this.config.url,
      database: this.config.db,
      connectedAt: new Date().toISOString(),
      operatorId: this.config.operatorId,
    };
  }

  /**
   * JSON-RPC / External API execute helper
   */
  private async executeKw<T = any>(
    model: string,
    method: string,
    args: any[] = [],
    kwargs: Record<string, any> = {}
  ): Promise<T> {
    const start = Date.now();
    const endpoint = `${this.config.url}/jsonrpc`;

    // Ensure authenticated uid
    if (!this.uid && method !== 'authenticate') {
      await this.authenticate();
    }

    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.db,
          this.uid,
          this.config.apiKeyOrPassword,
          model,
          method,
          args,
          kwargs,
        ],
      },
      id: Math.floor(Math.random() * 1000000),
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Odoo HTTP Error ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(`Odoo RPC Error: ${data.error.data?.message || data.error.message}`);
    }

    return data.result;
  }

  private async authenticate(): Promise<number> {
    const endpoint = `${this.config.url}/jsonrpc`;
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'common',
        method: 'authenticate',
        args: [
          this.config.db,
          this.config.username,
          this.config.apiKeyOrPassword,
          {},
        ],
      },
      id: Math.floor(Math.random() * 1000000),
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.error || !data.result) {
      throw new Error(`Odoo Authentication failed: invalid credentials or database name.`);
    }

    this.uid = Number(data.result);
    return this.uid;
  }

  async testConnection(): Promise<ERPConnectionStatus> {
    const start = Date.now();
    try {
      const uid = await this.authenticate();
      const userRecords = await this.executeKw('res.users', 'read', [[uid]], {
        fields: ['name', 'login'],
      });

      const user = userRecords?.[0] || { name: this.config.username, login: this.config.username };

      // Verify access to key models
      const checkModelAccess = async (model: string, op: 'read' | 'write') => {
        try {
          return await this.executeKw(model, 'check_access_rights', [op], { raise_exception: false });
        } catch {
          return false;
        }
      };

      const [canReadSales, canReadCustomers, canReadInvoices, canReadInventory, canCreateDraftInvoices] =
        await Promise.all([
          checkModelAccess('sale.order', 'read'),
          checkModelAccess('res.partner', 'read'),
          checkModelAccess('account.move', 'read'),
          checkModelAccess('stock.quant', 'read'),
          checkModelAccess('account.move', 'write'),
        ]);

      return {
        healthy: true,
        authenticated: true,
        latencyMs: Date.now() - start,
        user: {
          id: uid,
          name: user.name,
          login: user.login,
        },
        permissions: {
          canReadSales: !!canReadSales,
          canReadCustomers: !!canReadCustomers,
          canReadInvoices: !!canReadInvoices,
          canReadInventory: !!canReadInventory,
          canCreateDraftInvoices: !!canCreateDraftInvoices,
          canCreateDraftPurchases: true,
          canMutateFinancials: false, // Strict safety
          rawPermissions: {},
        },
        confirmedEntities: ['customer', 'sale_order', 'invoice', 'product'],
      };
    } catch (err: any) {
      return {
        healthy: false,
        authenticated: false,
        latencyMs: Date.now() - start,
        user: { id: 0, name: '', login: '' },
        permissions: {
          canReadSales: false,
          canReadCustomers: false,
          canReadInvoices: false,
          canReadInventory: false,
          canCreateDraftInvoices: false,
          canCreateDraftPurchases: false,
          canMutateFinancials: false,
          rawPermissions: {},
        },
        confirmedEntities: [],
      };
    }
  }

  async discoverSchema(): Promise<EntityDefinition[]> {
    return [
      {
        id: 'customer',
        sourceModel: 'res.partner',
        label: 'Customer / Contact',
        operations: ['read', 'search', 'create', 'update'],
        fields: [
          { name: 'name', label: 'Name', type: 'string', required: true, readonly: false },
          { name: 'email', label: 'Email', type: 'string', required: false, readonly: false },
          { name: 'phone', label: 'Phone', type: 'string', required: false, readonly: false },
          { name: 'total_due', label: 'Outstanding Due', type: 'number', required: false, readonly: true },
        ],
      },
      {
        id: 'sale_order',
        sourceModel: 'sale.order',
        label: 'Sales Order',
        operations: ['read', 'search'],
        fields: [
          { name: 'name', label: 'Order Reference', type: 'string', required: true, readonly: true },
          { name: 'partner_id', label: 'Customer', type: 'relation', required: true, readonly: false, relationTarget: 'customer' },
          { name: 'amount_total', label: 'Total Amount', type: 'number', required: true, readonly: true },
          { name: 'state', label: 'Status', type: 'selection', required: true, readonly: true },
          { name: 'date_order', label: 'Order Date', type: 'date', required: true, readonly: true },
        ],
      },
      {
        id: 'invoice',
        sourceModel: 'account.move',
        label: 'Customer Invoice',
        operations: ['read', 'search', 'create'],
        fields: [
          { name: 'name', label: 'Number', type: 'string', required: true, readonly: true },
          { name: 'partner_id', label: 'Customer', type: 'relation', required: true, readonly: false, relationTarget: 'customer' },
          { name: 'amount_total', label: 'Total', type: 'number', required: true, readonly: true },
          { name: 'amount_residual', label: 'Amount Due', type: 'number', required: true, readonly: true },
          { name: 'state', label: 'State', type: 'selection', required: true, readonly: true },
        ],
      },
    ];
  }

  async searchEntities(entityId: string, query: { filter?: any; limit?: number; offset?: number }): Promise<ExecutionResult<any[]>> {
    const start = Date.now();
    try {
      const modelMap: Record<string, string> = {
        customer: 'res.partner',
        sale_order: 'sale.order',
        invoice: 'account.move',
        product: 'product.product',
      };
      const model = modelMap[entityId] || entityId;
      const domain = query.filter || [];
      const limit = query.limit || 20;

      const records = await this.executeKw(model, 'search_read', [domain], {
        limit,
        offset: query.offset || 0,
      });

      return {
        success: true,
        data: records,
        durationMs: Date.now() - start,
        auditId: `odoo-${Date.now()}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'SEARCH_FAILED', message: err.message },
        durationMs: Date.now() - start,
        auditId: `odoo-${Date.now()}`,
      };
    }
  }

  async getEntityById(entityId: string, id: string | number): Promise<ExecutionResult<any>> {
    const res = await this.searchEntities(entityId, { filter: [['id', '=', Number(id)]], limit: 1 });
    return {
      ...res,
      data: res.data?.[0] || null,
    };
  }

  async getSalesSummary(params: { dateFrom?: string; dateTo?: string }): Promise<ExecutionResult<{ totalRevenue: number; orderCount: number; currency: string; orders: any[] }>> {
    const start = Date.now();
    try {
      const domain: any[] = [['state', 'in', ['sale', 'done']]];
      if (params.dateFrom) domain.push(['date_order', '>=', params.dateFrom]);
      if (params.dateTo) domain.push(['date_order', '<=', params.dateTo]);

      const orders = await this.executeKw('sale.order', 'search_read', [domain], {
        fields: ['name', 'partner_id', 'amount_total', 'date_order', 'currency_id'],
        limit: 50,
      });

      const totalRevenue = orders.reduce((sum: number, o: any) => sum + (Number(o.amount_total) || 0), 0);

      return {
        success: true,
        data: {
          totalRevenue,
          orderCount: orders.length,
          currency: orders[0]?.currency_id?.[1] || 'EGP',
          orders,
        },
        durationMs: Date.now() - start,
        auditId: `odoo-sales-${Date.now()}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'SALES_FETCH_ERROR', message: err.message },
        durationMs: Date.now() - start,
        auditId: `odoo-${Date.now()}`,
      };
    }
  }

  async getReceivablesSummary(): Promise<ExecutionResult<{ totalOutstanding: number; overdueCount: number; currency: string; debtors: any[] }>> {
    const start = Date.now();
    try {
      const domain = [
        ['move_type', '=', 'out_invoice'],
        ['state', '=', 'posted'],
        ['payment_state', 'in', ['not_paid', 'partial']],
      ];

      const invoices = await this.executeKw('account.move', 'search_read', [domain], {
        fields: ['name', 'partner_id', 'amount_total', 'amount_residual', 'invoice_date_due', 'currency_id'],
        limit: 50,
      });

      const totalOutstanding = invoices.reduce((sum: number, inv: any) => sum + (Number(inv.amount_residual) || 0), 0);

      return {
        success: true,
        data: {
          totalOutstanding,
          overdueCount: invoices.length,
          currency: invoices[0]?.currency_id?.[1] || 'EGP',
          debtors: invoices,
        },
        durationMs: Date.now() - start,
        auditId: `odoo-receivables-${Date.now()}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'RECEIVABLES_FETCH_ERROR', message: err.message },
        durationMs: Date.now() - start,
        auditId: `odoo-${Date.now()}`,
      };
    }
  }

  async getInventoryLevels(params?: { lowStockThreshold?: number }): Promise<ExecutionResult<{ totalItems: number; lowStockItems: any[] }>> {
    const start = Date.now();
    try {
      const threshold = params?.lowStockThreshold || 10;
      const products = await this.executeKw('product.product', 'search_read', [[['type', '=', 'product']]], {
        fields: ['name', 'qty_available', 'standard_price'],
        limit: 50,
      });

      const lowStockItems = products.filter((p: any) => (p.qty_available || 0) <= threshold);

      return {
        success: true,
        data: {
          totalItems: products.length,
          lowStockItems,
        },
        durationMs: Date.now() - start,
        auditId: `odoo-stock-${Date.now()}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'INVENTORY_FETCH_ERROR', message: err.message },
        durationMs: Date.now() - start,
        auditId: `odoo-${Date.now()}`,
      };
    }
  }

  async createDraftInvoice(payload: { customerId: string | number; lines: Array<{ productId?: string | number; description: string; quantity: number; unitPrice: number }> }): Promise<ExecutionResult<{ invoiceId: string | number; invoiceNumber?: string; state: 'draft' }>> {
    const start = Date.now();
    try {
      const invoiceLines = payload.lines.map((l) => [
        0,
        0,
        {
          name: l.description,
          quantity: l.quantity,
          price_unit: l.unitPrice,
          product_id: l.productId ? Number(l.productId) : false,
        },
      ]);

      const invoiceVals = {
        move_type: 'out_invoice',
        partner_id: Number(payload.customerId),
        invoice_line_ids: invoiceLines,
      };

      const newId = await this.executeKw('account.move', 'create', [invoiceVals]);
      const created = await this.executeKw('account.move', 'read', [[newId]], { fields: ['name', 'state'] });

      return {
        success: true,
        data: {
          invoiceId: newId,
          invoiceNumber: created?.[0]?.name || `DRAFT-${newId}`,
          state: 'draft',
        },
        durationMs: Date.now() - start,
        auditId: `odoo-create-inv-${Date.now()}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'DRAFT_INVOICE_FAILED', message: err.message },
        durationMs: Date.now() - start,
        auditId: `odoo-${Date.now()}`,
      };
    }
  }

  async createDraftPurchaseOrder(payload: { vendorId: string | number; lines: Array<{ description: string; quantity: number; unitPrice: number }> }): Promise<ExecutionResult<{ orderId: string | number; state: 'draft' }>> {
    const start = Date.now();
    try {
      const lines = payload.lines.map((l) => [
        0,
        0,
        {
          name: l.description,
          product_qty: l.quantity,
          price_unit: l.unitPrice,
        },
      ]);

      const orderVals = {
        partner_id: Number(payload.vendorId),
        order_line: lines,
      };

      const newId = await this.executeKw('purchase.order', 'create', [orderVals]);

      return {
        success: true,
        data: {
          orderId: newId,
          state: 'draft',
        },
        durationMs: Date.now() - start,
        auditId: `odoo-create-po-${Date.now()}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'DRAFT_PURCHASE_FAILED', message: err.message },
        durationMs: Date.now() - start,
        auditId: `odoo-${Date.now()}`,
      };
    }
  }
}
