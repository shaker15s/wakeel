import { describe, expect, it } from 'vitest';
import { advance, cancelTask, createCreateDraftInvoiceTask } from '@/server/runtime/executor';
import { FakeERPConnector } from '@/server/erp/fake-connector';
import { ACTOR, HUMAN_APPROVER, makeDeps, TENANT_A, TENANT_B, VALID_INPUT } from './helpers';

describe('cancellation', () => {
  it('cancels a task waiting for approval: terminal, no connector call, idempotent re-cancel', async () => {
    const deps = makeDeps();
    const connector = deps.connector as FakeERPConnector;
    const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
    await advance(deps, TENANT_A, task.id);

    const cancelled = await cancelTask(deps, TENANT_A, task.id, ACTOR, 'changed my mind');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.result?.outcome).toBe('cancelled');
    expect(cancelled.result?.unresolvedIssues).toContain('cancelled_by_actor');
    expect(connector.getCreatedInvoices()).toHaveLength(0);

    // The approval must not be left dangling as "pending" on a now-terminal
    // task — a UI building its view from the approval's status alone (as
    // the demo surface does) would otherwise keep showing an approve/reject
    // card for a task that is already over.
    const steps = await deps.store.listSteps(task.id);
    const approvalId = (steps.find((s) => s.name === 'await_approval')!.output as { approvalId: string }).approvalId;
    const approval = await deps.store.getApproval(TENANT_A, approvalId);
    expect(approval?.status).toBe('rejected');

    // advance() on a cancelled task must be a safe no-op.
    const afterAdvance = await advance(deps, TENANT_A, task.id);
    expect(afterAdvance.status).toBe('cancelled');

    const eventsBefore = (await deps.store.listEvents(task.id)).length;
    const cancelledAgain = await cancelTask(deps, TENANT_A, task.id, ACTOR, 'trying again');
    expect(cancelledAgain.status).toBe('cancelled');
    const eventsAfter = (await deps.store.listEvents(task.id)).length;
    expect(eventsAfter).toBe(eventsBefore); // no duplicate event from re-cancelling a terminal task
  });

  it('refuses to cancel once execute_write already succeeded — never silently discards a real side effect', async () => {
    const deps = makeDeps();
    const connector = deps.connector as FakeERPConnector;
    const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
    await advance(deps, TENANT_A, task.id);
    const steps = await deps.store.listSteps(task.id);
    const approvalId = (steps.find((s) => s.name === 'await_approval')!.output as { approvalId: string }).approvalId;
    await deps.store.decideApproval(TENANT_A, approvalId, 'approved', HUMAN_APPROVER);
    const succeeded = await advance(deps, TENANT_A, task.id);
    expect(succeeded.status).toBe('succeeded');
    expect(connector.getCreatedInvoices()).toHaveLength(1);

    // The task is already terminal at this point, so cancelTask() would be a
    // safe no-op via the terminal-status check alone — that is not what this
    // test is about. This models the narrower, specifically dangerous
    // window the execute_write guard defends: the write has already
    // succeeded, but the task has not (yet) been marked terminal (e.g. a
    // crash between execute_write succeeding and the task-level status
    // update landing; see the same reach-into-the-store pattern used in
    // tests/runtime/idempotency.test.ts for other crash-window scenarios).
    await deps.store.updateTask(TENANT_A, task.id, { status: 'running', result: undefined });

    await expect(cancelTask(deps, TENANT_A, task.id, ACTOR)).rejects.toThrow(/already completed/);

    // The refused cancel attempt did not touch the real side effect, and the
    // task can still be resumed to its true terminal state by advance().
    expect(connector.getCreatedInvoices()).toHaveLength(1);
    const resumed = await advance(deps, TENANT_A, task.id);
    expect(resumed.status).toBe('succeeded');
    expect(connector.getCreatedInvoices()).toHaveLength(1);
  });


  it('a task already cancelled, re-cancelled is a safe no-op (idempotent)', async () => {
    const deps = makeDeps();
    const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
    const first = await cancelTask(deps, TENANT_A, task.id, ACTOR);
    expect(first.status).toBe('cancelled');
    const second = await cancelTask(deps, TENANT_A, task.id, ACTOR);
    expect(second.status).toBe('cancelled');
  });

  it('tenant B cannot cancel a task belonging to tenant A', async () => {
    const deps = makeDeps();
    const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
    await expect(cancelTask(deps, TENANT_B, task.id, 'attacker')).rejects.toThrow();

    // Tenant A's task is unaffected by the cross-tenant attempt.
    const stillThere = await deps.store.getTask(TENANT_A, task.id);
    expect(stillThere?.status).not.toBe('cancelled');
  });
});
