import { describe, expect, it } from 'vitest';
import { advance, createCreateDraftInvoiceTask } from '@/server/runtime/executor';
import { FakeERPConnector } from '@/server/erp/fake-connector';
import { ACTOR, HUMAN_APPROVER, makeDeps, TENANT_A, VALID_INPUT } from './helpers';

describe('verification', () => {
  it('never reports success when read-after-write does not match what was approved', async () => {
    const deps = makeDeps();
    const connector = deps.connector as FakeERPConnector;

    const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
    await advance(deps, TENANT_A, task.id);
    const steps = await deps.store.listSteps(task.id);
    const approvalId = (steps.find((s) => s.name === 'await_approval')!.output as { approvalId: string }).approvalId;
    await deps.store.decideApproval(TENANT_A, approvalId, 'approved', HUMAN_APPROVER);

    // Make the read-after-write check see a different customer than what was
    // actually requested/approved — simulating the ERP silently drifting
    // from the request (or a bug in the connector's write path).
    connector.simulateVerificationDrift({ customerId: 'someone-else' });

    const t = await advance(deps, TENANT_A, task.id);

    // The write happened (we have an invoice id) but verification could not
    // confirm it matches — this must NEVER be reported as `succeeded`.
    expect(t.status).toBe('partially_succeeded');
    expect(t.result?.outcome).toBe('partially_succeeded');
    expect(t.result?.unresolvedIssues).toContain('customerId_mismatch');
    expect(connector.getCreatedInvoices()).toHaveLength(1); // the write itself was not retried/duplicated
  });

  it('reports partial success (not failure, not success) when the written record cannot be found at all', async () => {
    const deps = makeDeps();
    const connector = deps.connector as FakeERPConnector;

    const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
    await advance(deps, TENANT_A, task.id);
    const steps = await deps.store.listSteps(task.id);
    const approvalId = (steps.find((s) => s.name === 'await_approval')!.output as { approvalId: string }).approvalId;
    await deps.store.decideApproval(TENANT_A, approvalId, 'approved', HUMAN_APPROVER);

    const originalGetEntityById = connector.getEntityById.bind(connector);
    connector.getEntityById = async (entityId: string, id: string | number) => {
      if (entityId === 'invoice') {
        return { success: true, data: null, durationMs: 1, auditId: 'forced-not-found' };
      }
      return originalGetEntityById(entityId, id);
    };

    const t = await advance(deps, TENANT_A, task.id);
    expect(t.status).toBe('partially_succeeded');
    expect(t.result?.unresolvedIssues[0]).toMatch(/^verification_read_failed/);
  });
});
