import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaTestContext, PrismaTestContext } from './prisma-test-helper';
import { FakeERPConnector } from '@/server/erp/fake-connector';
import { advanceDraftVendorBill, createDraftVendorBillTask } from '@/server/runtime/vendor-bill-executor';

let vendorConnector: FakeERPConnector;
let vendorTaskId: string;

let first: PrismaTestContext;
let second: PrismaTestContext;

beforeAll(async () => {
  first = await createPrismaTestContext();
  second = await createPrismaTestContext(first.databaseUrl);
  const task = await first.store.createTask({
    id: 'task-restart', tenantId: 'tenant-restart', actorId: 'actor-restart',
    workflowType: 'create_draft_invoice', riskClass: 'MEDIUM', input: { customerId: 22 },
    deadline: new Date(Date.now() + 60_000),
  });
  await first.store.createStep('tenant-restart', {
    id: 'step-restart', taskId: task.id, sequence: 1, name: 'validate_input', maxAttempts: 1,
  });
  vendorConnector = new FakeERPConnector();
  const vendorTask = await createDraftVendorBillTask({ store: first.store, connector: vendorConnector }, {
    tenantId: 'tenant-restart', actorId: 'actor-restart',
    input: { vendorId: 'vendor-1', vendorBillReference: 'RESTART-1', billDate: '2026-02-01', currency: 'EGP', lines: [{ description: 'Paper', quantity: '2', unitPrice: '10.25' }] },
  });
  vendorTaskId = vendorTask.id;
  await advanceDraftVendorBill({ store: first.store, connector: vendorConnector }, 'tenant-restart', vendorTask.id);
}, 120_000);

afterAll(async () => { await second?.dispose(); await first?.dispose(); });

describe('PrismaTaskStore process restart', () => {
  it('reads committed task state from a separately created Prisma client', async () => {
    expect(await second.store.getTask('tenant-restart', 'task-restart')).toMatchObject({ input: { customerId: 22 } });
    expect(await second.store.listSteps('tenant-restart', 'task-restart')).toMatchObject([{ name: 'validate_input' }]);
  });

  it('can approve and finish a persisted vendor-bill task after a separate Prisma client loads it', async () => {
    const steps = await second.store.listSteps('tenant-restart', vendorTaskId);
    const approvalId = (steps.find((step) => step.name === 'await_approval')?.output as { approvalId: string }).approvalId;
    await second.store.decideApproval('tenant-restart', approvalId, 'approved', 'actor-restart');
    const completed = await advanceDraftVendorBill({ store: second.store, connector: vendorConnector }, 'tenant-restart', vendorTaskId);
    expect(completed).toMatchObject({ status: 'succeeded', result: { outcome: 'succeeded', receipt: { documentKind: 'vendor_bill', verifiedTotal: '20.50' } } });
  });
});
