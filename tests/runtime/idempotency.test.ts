import { describe, expect, it } from 'vitest';
import { advance, createCreateDraftInvoiceTask } from '@/server/runtime/executor';
import { FakeERPConnector } from '@/server/erp/fake-connector';
import { ACTOR, HUMAN_APPROVER, makeDeps, TENANT_A, VALID_INPUT } from './helpers';

/**
 * Builds a connector that cannot reconcile ambiguous outcomes at all — the
 * "no capability" case. `findByIdempotencyKey` is defined on
 * `FakeERPConnector.prototype`, so shadowing it with an own `undefined`
 * property on the instance is what actually makes
 * `connector.findByIdempotencyKey` falsy (a subclass with no override would
 * still inherit the method from the prototype chain).
 */
function makeNoReconcileConnector(): FakeERPConnector {
  const connector = new FakeERPConnector();
  (connector as unknown as { findByIdempotencyKey?: unknown }).findByIdempotencyKey = undefined;
  return connector;
}

async function runToApproved(deps: ReturnType<typeof makeDeps>) {
  const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
  await advance(deps, TENANT_A, task.id);
  const steps = await deps.store.listSteps(task.id);
  const approvalId = (steps.find((s) => s.name === 'await_approval')!.output as { approvalId: string }).approvalId;
  await deps.store.decideApproval(TENANT_A, approvalId, 'approved', HUMAN_APPROVER);
  return task;
}

describe('idempotency and crash recovery', () => {
  it('reconciles a crash-after-write: the side effect happened, but the call appeared to fail', async () => {
    const deps = makeDeps();
    const connector = deps.connector as FakeERPConnector;
    connector.queueInvoiceBehavior('crash_after_write');

    const task = await runToApproved(deps);
    const t = await advance(deps, TENANT_A, task.id);

    expect(t.status).toBe('succeeded');
    // Exactly one invoice was ever created in the backing store, even though
    // the first call "appeared" to fail from the caller's perspective.
    expect(connector.getCreatedInvoices()).toHaveLength(1);
  });

  it('never blindly retries an ambiguous outcome when the connector cannot reconcile', async () => {
    const deps = makeDeps({ connector: makeNoReconcileConnector() });
    const connector = deps.connector as FakeERPConnector;
    connector.queueInvoiceBehavior('transient_error'); // no side effect occurs

    const task = await runToApproved(deps);
    const t = await advance(deps, TENANT_A, task.id);

    expect(t.status).toBe('failed');
    expect(t.result?.unresolvedIssues).toContain('ambiguous_write_outcome_needs_manual_review');
    // Only one attempt was made — it did NOT retry blindly despite having
    // retry budget left, because it could not confirm the first attempt's
    // outcome.
    expect(connector.getCreatedInvoices()).toHaveLength(0);
  });

  it('retries genuinely transient failures (confirmed no side effect) up to the retry budget, then exhausts', async () => {
    const deps = makeDeps();
    const connector = deps.connector as FakeERPConnector;
    // maxAttempts for execute_write is 3 — queue 3 confirmed-no-side-effect failures.
    connector.queueInvoiceBehavior('transient_error');
    connector.queueInvoiceBehavior('transient_error');
    connector.queueInvoiceBehavior('transient_error');

    const task = await runToApproved(deps);

    let t = await advance(deps, TENANT_A, task.id);
    // First advance() call already exhausts all 3 attempts because advance()
    // loops internally until blocked; each failed-but-reconciled-as-no-op
    // attempt resets the step to pending and the loop immediately retries.
    expect(t.status).toBe('failed');
    expect(t.result?.unresolvedIssues).toContain('retry_exhausted');
    expect(connector.getCreatedInvoices()).toHaveLength(0);
  });

  it('recovers after a transient failure once the connector starts succeeding', async () => {
    const deps = makeDeps();
    const connector = deps.connector as FakeERPConnector;
    connector.queueInvoiceBehavior('transient_error'); // attempt 1 fails, confirmed no side effect
    // attempt 2 will default to 'success'

    const task = await runToApproved(deps);
    const t = await advance(deps, TENANT_A, task.id);

    expect(t.status).toBe('succeeded');
    expect(connector.getCreatedInvoices()).toHaveLength(1);
  });

  it('rejects a permanent validation error with no retry and no side effect', async () => {
    const deps = makeDeps();
    const connector = deps.connector as FakeERPConnector;
    connector.queueInvoiceBehavior('validation_error');

    const task = await runToApproved(deps);
    const t = await advance(deps, TENANT_A, task.id);

    expect(t.status).toBe('failed');
    expect(t.result?.unresolvedIssues[0]).toMatch(/^connector_rejected:/);
    expect(connector.getCreatedInvoices()).toHaveLength(0);
  });

  it('dedups a re-entrant execute_write against an already-completed idempotency record without re-calling the connector', async () => {
    const deps = makeDeps();
    const connector = deps.connector as FakeERPConnector;

    const task = await runToApproved(deps);
    const succeeded = await advance(deps, TENANT_A, task.id);
    expect(succeeded.status).toBe('succeeded');
    expect(connector.getCreatedInvoices()).toHaveLength(1);

    // Simulate an orchestrator crash/restart that re-entered the
    // execute_write step after the external write (and the idempotency
    // record) had already completed, but before step-level bookkeeping was
    // durably updated to reflect that. This models a real crash window; the
    // public store API has no way to force it directly in a single call.
    const steps = await deps.store.listSteps(task.id);
    const execStep = steps.find((s) => s.name === 'execute_write')!;
    await deps.store.updateStep(task.id, execStep.id, { status: 'pending' });
    await deps.store.updateTask(TENANT_A, task.id, { status: 'running' });

    const again = await advance(deps, TENANT_A, task.id);
    expect(again.status).toBe('succeeded');
    // The connector must NOT have been called a second time — the cached,
    // completed idempotency record was reused instead.
    expect(connector.getCreatedInvoices()).toHaveLength(1);
  });

  it('rejects idempotency-key reuse with a different request hash instead of trusting the cache blindly', async () => {
    const deps = makeDeps();
    const task = await runToApproved(deps);
    await advance(deps, TENANT_A, task.id); // completes normally, hash H recorded for this task's key

    const steps = await deps.store.listSteps(task.id);
    const execStep = steps.find((s) => s.name === 'execute_write')!;
    // Corrupt the recorded request hash to simulate the same idempotency key
    // somehow being associated with a different request (should never
    // happen with our per-task key derivation, but must fail loudly if it does).
    const key = `task:${task.id}:execute_write`;
    const record = await deps.store.getIdempotencyRecord(TENANT_A, 'create_draft_invoice', key);
    expect(record).not.toBeNull();
    // The public store API has no method to rewrite a completed record's
    // hash — intentionally, since that would defeat the whole guarantee.
    // Reach into the internal map to model "the stored record is wrong"
    // (corruption, or a bug elsewhere), which is the actual threat this
    // check defends against.
    const rawMap = (deps.store as unknown as { idempotency: Map<string, { requestHash: string }> }).idempotency;
    const mapKey = `${TENANT_A}::create_draft_invoice::${key}`;
    rawMap.get(mapKey)!.requestHash = 'tampered-hash';

    await deps.store.updateStep(task.id, execStep.id, { status: 'pending' });
    await deps.store.updateTask(TENANT_A, task.id, { status: 'running' });

    const result = await advance(deps, TENANT_A, task.id);
    expect(result.status).toBe('failed');
    expect(result.result?.unresolvedIssues).toContain('idempotency_key_reused_with_different_request');
  });
});
