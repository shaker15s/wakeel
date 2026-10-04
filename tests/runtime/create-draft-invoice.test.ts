import { describe, expect, it, vi } from 'vitest';
import { advance, createCreateDraftInvoiceTask, ExecutorDeps } from '@/server/runtime/executor';
import { PolicyEngine } from '@/server/policy/engine';
import { FakeERPConnector } from '@/server/erp/fake-connector';
import { TaskStep } from '@/server/runtime/types';
import { ACTOR, HUMAN_APPROVER, makeDeps, TENANT_A, TENANT_B, VALID_INPUT } from './helpers';

async function approvalStepOf(deps: ExecutorDeps, taskId: string): Promise<TaskStep> {
  const steps = await deps.store.listSteps(taskId);
  const step = steps.find((s) => s.name === 'await_approval');
  if (!step) throw new Error('await_approval step not found');
  return step;
}

describe('create_draft_invoice workflow — happy path', () => {
  it('runs validate -> policy -> approval -> write -> verify and succeeds exactly once', async () => {
    const deps = makeDeps();
    const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });

    let t = await advance(deps, TENANT_A, task.id);
    expect(t.status).toBe('waiting_for_approval');

    const step = await approvalStepOf(deps, task.id);
    const approvalId = (step.output as { approvalId: string }).approvalId;
    const approval = await deps.store.getApproval(TENANT_A, approvalId);
    expect(approval?.status).toBe('pending');
    expect(approval?.riskLevel).toBe('MEDIUM'); // 2 * 100 = 200, below the HIGH threshold

    await deps.store.decideApproval(TENANT_A, approvalId, 'approved', HUMAN_APPROVER);

    t = await advance(deps, TENANT_A, task.id);
    expect(t.status).toBe('succeeded');
    expect(t.result?.outcome).toBe('succeeded');
    expect(t.result?.unresolvedIssues).toEqual([]);

    const connector = deps.connector as FakeERPConnector;
    expect(connector.getCreatedInvoices()).toHaveLength(1);

    // Calling advance() again on an already-terminal task must be a safe no-op.
    const again = await advance(deps, TENANT_A, task.id);
    expect(again.status).toBe('succeeded');
    expect(connector.getCreatedInvoices()).toHaveLength(1);
  });
});

describe('approval handling', () => {
  it('rejection: fails the task and never calls the connector', async () => {
    const deps = makeDeps();
    const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
    await advance(deps, TENANT_A, task.id);
    const step = await approvalStepOf(deps, task.id);
    const approvalId = (step.output as { approvalId: string }).approvalId;

    await deps.store.decideApproval(TENANT_A, approvalId, 'rejected', HUMAN_APPROVER, 'amount looks wrong');
    const t = await advance(deps, TENANT_A, task.id);

    expect(t.status).toBe('failed');
    expect(t.result?.unresolvedIssues).toContain('approval_rejected');
    expect((deps.connector as FakeERPConnector).getCreatedInvoices()).toHaveLength(0);
  });

  it('tampering: a mismatched stored action hash blocks execution even after approval', async () => {
    const deps = makeDeps();
    const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
    await advance(deps, TENANT_A, task.id);
    const step = await approvalStepOf(deps, task.id);
    const approvalId = (step.output as { approvalId: string }).approvalId;

    // Simulate a tampered/compromised approval record (e.g. a corrupted row,
    // or an approval incorrectly reused for a different action). The public
    // store API has no way to mutate actionHash — reaching into the
    // in-memory map models an attacker/bug operating below the store's API
    // surface, which is exactly the threat this check defends against.
    const rawApprovals = (deps.store as unknown as { approvals: Map<string, { actionHash: string }> }).approvals;
    rawApprovals.get(approvalId)!.actionHash = '0'.repeat(64);

    await deps.store.decideApproval(TENANT_A, approvalId, 'approved', HUMAN_APPROVER);
    const t = await advance(deps, TENANT_A, task.id);

    expect(t.status).toBe('failed');
    expect(t.result?.unresolvedIssues).toContain('action_hash_mismatch_at_execution');
    expect((deps.connector as FakeERPConnector).getCreatedInvoices()).toHaveLength(0);
  });

  it('expiry: an undecided approval past its TTL fails the task, never silently proceeds', async () => {
    const deps = makeDeps({ approvalTtlMs: 5 });
    const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
    await advance(deps, TENANT_A, task.id);

    await new Promise((resolve) => setTimeout(resolve, 30));

    const t = await advance(deps, TENANT_A, task.id);
    expect(t.status).toBe('failed');
    expect(t.result?.unresolvedIssues).toContain('approval_expired');
    expect((deps.connector as FakeERPConnector).getCreatedInvoices()).toHaveLength(0);
  });

  it('replay: a decided approval can never be decided again, in either direction', async () => {
    const deps = makeDeps();
    const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
    await advance(deps, TENANT_A, task.id);
    const step = await approvalStepOf(deps, task.id);
    const approvalId = (step.output as { approvalId: string }).approvalId;

    await deps.store.decideApproval(TENANT_A, approvalId, 'approved', HUMAN_APPROVER);
    await expect(deps.store.decideApproval(TENANT_A, approvalId, 'approved', HUMAN_APPROVER)).rejects.toThrow();
    await expect(deps.store.decideApproval(TENANT_A, approvalId, 'rejected', 'someone-else')).rejects.toThrow();
  });
});

describe('invalid input and policy denial', () => {
  it('rejects empty line items before touching policy or the connector', async () => {
    const deps = makeDeps();
    const task = await createCreateDraftInvoiceTask(deps, {
      tenantId: TENANT_A,
      actorId: ACTOR,
      input: { customerId: 'cust-1', lines: [] },
    });

    const t = await advance(deps, TENANT_A, task.id);
    expect(t.status).toBe('failed');
    expect(t.result?.unresolvedIssues[0]).toMatch(/^invalid_input:/);
    expect((deps.connector as FakeERPConnector).getCreatedInvoices()).toHaveLength(0);
  });

  it('respects a policy denial and never requests approval or executes', async () => {
    const deps = makeDeps();
    const spy = vi.spyOn(PolicyEngine, 'evaluate').mockReturnValue({
      allowed: false,
      requiresApproval: false,
      riskLevel: 'CRITICAL',
      reason: 'blocked for test: simulates a stricter future policy',
    });

    try {
      const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
      const t = await advance(deps, TENANT_A, task.id);
      expect(t.status).toBe('failed');
      expect(t.result?.unresolvedIssues[0]).toMatch(/^policy_denied:/);
      expect((deps.connector as FakeERPConnector).getCreatedInvoices()).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('cross-tenant isolation', () => {
  it('a task created for tenant A is invisible and inoperable for tenant B', async () => {
    const deps = makeDeps();
    const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });

    expect(await deps.store.getTask(TENANT_B, task.id)).toBeNull();
    await expect(advance(deps, TENANT_B, task.id)).rejects.toThrow();

    await advance(deps, TENANT_A, task.id);
    const step = await approvalStepOf(deps, task.id);
    const approvalId = (step.output as { approvalId: string }).approvalId;

    expect(await deps.store.getApproval(TENANT_B, approvalId)).toBeNull();
    await expect(deps.store.decideApproval(TENANT_B, approvalId, 'approved', 'attacker')).rejects.toThrow();

    // The legitimate tenant must be unaffected by the cross-tenant attempts above.
    const stillPending = await deps.store.getApproval(TENANT_A, approvalId);
    expect(stillPending?.status).toBe('pending');
  });
});

describe('task-level deadline exhaustion', () => {
  it('expires a task that runs past its deadline instead of continuing indefinitely', async () => {
    const deps = makeDeps();
    const task = await createCreateDraftInvoiceTask(deps, {
      tenantId: TENANT_A,
      actorId: ACTOR,
      input: VALID_INPUT,
      deadlineMs: 5,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    const t = await advance(deps, TENANT_A, task.id);
    expect(t.status).toBe('expired');
    expect(t.result?.unresolvedIssues).toContain('deadline_exceeded');
  });
});
