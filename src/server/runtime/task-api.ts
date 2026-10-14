import { db } from '@/lib/db';
import { Odoo19Connector } from '@/server/erp/odoo-connector';
import { PrismaTaskStore } from './prisma-store';
import { advance, createCreateDraftInvoiceTask, cancelTask } from './executor';
import { advanceDraftVendorBill, createDraftVendorBillTask } from './vendor-bill-executor';
import type { Task, TaskStore, WorkflowType } from './types';

export const taskStore: TaskStore = new PrismaTaskStore(db);

export async function getOdooConnector(userId: string): Promise<Odoo19Connector | null> {
  const system = await db.aiSystem.findFirst({ where: { userId, category: 'ERP', status: 'ACTIVE' } });
  if (!system) return null;
  let config: Record<string, unknown>;
  try { config = JSON.parse(system.blueprint) as Record<string, unknown>; } catch { return null; }
  if (typeof config.url !== 'string' || typeof config.db !== 'string' || typeof config.username !== 'string' || typeof config.apiKeyOrPassword !== 'string') return null;
  return new Odoo19Connector({ url: config.url, db: config.db, username: config.username, apiKeyOrPassword: config.apiKeyOrPassword, operatorId: userId });
}

export async function createAndAdvanceTask(input: { tenantId: string; actorId: string; workflowType: WorkflowType; input: unknown }, connector: Odoo19Connector) {
  const deps = { store: taskStore, connector };
  if (input.workflowType === 'create_draft_invoice') {
    const task = await createCreateDraftInvoiceTask(deps, { tenantId: input.tenantId, actorId: input.actorId, input: input.input });
    const advanced = await advance(deps, input.tenantId, task.id);
    return { task, advanced };
  }
  const task = await createDraftVendorBillTask(deps, { tenantId: input.tenantId, actorId: input.actorId, input: input.input });
  const advanced = await advanceDraftVendorBill(deps, input.tenantId, task.id);
  return { task, advanced };
}

export async function advanceTask(deps: { store: TaskStore; connector: Odoo19Connector }, tenantId: string, task: Task) {
  return task.workflowType === 'create_draft_vendor_bill'
    ? advanceDraftVendorBill(deps, tenantId, task.id)
    : advance(deps, tenantId, task.id);
}

export { cancelTask };
