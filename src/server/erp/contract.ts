/**
 * WAKEEL — Universal ERP Contract v0.1
 *
 * Defines the canonical business interface between Wakeel's Agent Runtime
 * and any connected external ERP (Odoo 19, ERPNext, SAP, etc.).
 *
 * PRINCIPLE: The Agent reasons on canonical entities (Customer, SaleOrder, Invoice),
 * while Connectors map these to provider-specific schemas (e.g. res.partner, sale.order).
 */

export type ERPProvider = 'odoo' | 'erpnext' | 'custom';

export type CapabilityState = 'CONFIRMED' | 'INFERRED' | 'UNAVAILABLE' | 'UNKNOWN';

export interface ERPMetadata {
  provider: ERPProvider;
  version: string;
  serverUrl: string;
  database: string;
  connectedAt: string;
  operatorId: string;
}

export interface EntityField {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'relation' | 'selection';
  required: boolean;
  readonly: boolean;
  relationTarget?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface EntityDefinition {
  id: string; // Canonical ID: e.g. 'customer', 'sale_order', 'invoice', 'product'
  sourceModel: string; // Real ERP model: e.g. 'res.partner', 'sale.order', 'account.move'
  label: string;
  operations: Array<'read' | 'search' | 'create' | 'update' | 'delete'>;
  fields: EntityField[];
}

export interface ERPPermissionSummary {
  canReadSales: boolean;
  canReadCustomers: boolean;
  canReadInvoices: boolean;
  canReadInventory: boolean;
  canCreateDraftInvoices: boolean;
  canCreateDraftPurchases: boolean;
  canMutateFinancials: boolean;
  rawPermissions: Record<string, boolean>;
}

export interface ERPConnectionStatus {
  healthy: boolean;
  authenticated: boolean;
  latencyMs: number;
  user: {
    id: string | number;
    name: string;
    login: string;
  };
  permissions: ERPPermissionSummary;
  confirmedEntities: string[];
}

export interface ExecutionResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  durationMs: number;
  auditId: string;
}

/**
 * Universal Connector Interface that every ERP engine must satisfy.
 */
export interface IERPConnector {
  getMetadata(): ERPMetadata;
  testConnection(): Promise<ERPConnectionStatus>;
  discoverSchema(): Promise<EntityDefinition[]>;
  
  // Canonical Operational Read APIs
  searchEntities(entityId: string, query: { filter?: any; limit?: number; offset?: number }): Promise<ExecutionResult<any[]>>;
  getEntityById(entityId: string, id: string | number): Promise<ExecutionResult<any>>;
  getSalesSummary(params: { dateFrom?: string; dateTo?: string }): Promise<ExecutionResult<{ totalRevenue: number; orderCount: number; currency: string; orders: any[] }>>;
  getReceivablesSummary(): Promise<ExecutionResult<{ totalOutstanding: number; overdueCount: number; currency: string; debtors: any[] }>>;
  getInventoryLevels(params?: { lowStockThreshold?: number }): Promise<ExecutionResult<{ totalItems: number; lowStockItems: any[] }>>;

  // Canonical Safe Mutation APIs (Creates draft states only, verified before execution)
  createDraftInvoice(payload: { customerId: string | number; lines: Array<{ productId?: string | number; description: string; quantity: number; unitPrice: number }> }): Promise<ExecutionResult<{ invoiceId: string | number; invoiceNumber?: string; state: 'draft' }>>;
  createDraftPurchaseOrder(payload: { vendorId: string | number; lines: Array<{ description: string; quantity: number; unitPrice: number }> }): Promise<ExecutionResult<{ orderId: string | number; state: 'draft' }>>;
}
