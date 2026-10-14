import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaTestContext, PrismaTestContext } from './prisma-test-helper';

let context: PrismaTestContext;

beforeAll(async () => { context = await createPrismaTestContext(); }, 120_000);
afterAll(async () => { await context?.dispose(); });

describe('PrismaTaskStore tenant boundaries and durable records', () => {
  it('round-trips tasks, steps, and redacted events through SQLite', async () => {
    const { store } = context;
    const task = await store.createTask({
      id: 'task-roundtrip', tenantId: 'tenant-a', actorId: 'actor-a',
      workflowType: 'create_draft_invoice', riskClass: 'MEDIUM', input: { amount: 125 },
      deadline: new Date(Date.now() + 60_000),
    });
    const step = await store.createStep('tenant-a', {
      id: 'step-roundtrip', taskId: task.id, sequence: 1, name: 'validate_input', maxAttempts: 1,
    });
    await store.appendEvent('tenant-a', {
      taskId: task.id, type: 'task_created', actorType: 'human', actorId: 'actor-a',
      payload: { details: { apiKey: 'must-not-persist', amount: 125 } },
    });

    expect((await store.getTask('tenant-a', task.id))?.input).toEqual({ amount: 125 });
    expect(await store.getStep('tenant-a', task.id, step.id)).toMatchObject({ name: 'validate_input' });
    expect(await store.listSteps('tenant-a', task.id)).toHaveLength(1);
    expect((await store.listEvents('tenant-a', task.id))[0].payload).toEqual({ details: { apiKey: '[REDACTED]', amount: 125 } });
  });

  it('does not expose or mutate a task, step, or event across tenants', async () => {
    const { store } = context;
    const task = await store.createTask({
      id: 'task-tenant-a', tenantId: 'tenant-a', actorId: 'actor-a',
      workflowType: 'create_draft_invoice', riskClass: 'MEDIUM', input: {}, deadline: new Date(Date.now() + 60_000),
    });
    const step = await store.createStep('tenant-a', {
      id: 'step-tenant-a', taskId: task.id, sequence: 1, name: 'validate_input', maxAttempts: 1,
    });
    await store.appendEvent('tenant-a', { taskId: task.id, type: 'task_created', actorType: 'system', payload: {} });

    expect(await store.getTask('tenant-b', task.id)).toBeNull();
    expect(await store.getStep('tenant-b', task.id, step.id)).toBeNull();
    expect(await store.listSteps('tenant-b', task.id)).toEqual([]);
    expect(await store.listEvents('tenant-b', task.id)).toEqual([]);
    await expect(store.updateTask('tenant-b', task.id, { status: 'failed' })).rejects.toThrow();
    await expect(store.updateStep('tenant-b', task.id, step.id, { status: 'failed' })).rejects.toThrow();
    await expect(store.appendEvent('tenant-b', { taskId: task.id, type: 'task_created', actorType: 'system', payload: {} })).rejects.toThrow();
  });

  it('enforces unique idempotency keys within a tenant and scopes every operation', async () => {
    const { store } = context;
    const record = { tenantId: 'tenant-a', toolName: 'create_draft_invoice', idempotencyKey: 'request-1', requestHash: 'hash-1' };
    await store.startIdempotencyRecord('tenant-a', record);
    await expect(store.startIdempotencyRecord('tenant-a', record)).rejects.toThrow();
    expect(await store.getIdempotencyRecord('tenant-b', record.toolName, record.idempotencyKey)).toBeNull();
    await expect(store.completeIdempotencyRecord('tenant-b', record.toolName, record.idempotencyKey, { invoiceId: 1 })).rejects.toThrow();
    await store.failIdempotencyRecord('tenant-a', record.toolName, record.idempotencyKey);
    await expect(store.startIdempotencyRecord('tenant-a', { ...record, requestHash: 'different-request' })).rejects.toThrow(/different request/);
    expect(await store.startIdempotencyRecord('tenant-a', record)).toMatchObject({ status: 'in_progress', requestHash: record.requestHash });
    await store.failIdempotencyRecord('tenant-a', record.toolName, record.idempotencyKey);
    expect(await store.completeIdempotencyRecord('tenant-a', record.toolName, record.idempotencyKey, { invoiceId: 1 })).toMatchObject({ status: 'completed' });
  });

  it('validates approval parents and atomically allows only one concurrent decision', async () => {
    const { store } = context;
    const task = await store.createTask({
      id: 'task-approval', tenantId: 'tenant-a', actorId: 'actor-a', workflowType: 'create_draft_invoice',
      riskClass: 'MEDIUM', input: {}, deadline: new Date(Date.now() + 60_000),
    });
    const step = await store.createStep('tenant-a', {
      id: 'step-approval', taskId: task.id, sequence: 1, name: 'await_approval', maxAttempts: 1,
    });
    const approval = await store.createApproval('tenant-a', {
      id: 'approval-race', taskId: task.id, stepId: step.id, tenantId: 'tenant-a',
      toolName: 'create_draft_invoice', actionHash: 'action-hash', normalizedParams: { amount: 100 },
      policyVersion: 'v1', riskLevel: 'MEDIUM', summary: 'Invoice 100', expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(store.createApproval('tenant-b', {
      id: 'wrong-parent', tenantId: 'tenant-b', taskId: task.id, stepId: step.id,
      toolName: approval.toolName, actionHash: approval.actionHash, normalizedParams: approval.normalizedParams,
      policyVersion: approval.policyVersion, riskLevel: approval.riskLevel, summary: approval.summary,
      expiresAt: approval.expiresAt,
    })).rejects.toThrow();

    const decisions = await Promise.allSettled([
      store.decideApproval('tenant-a', approval.id, 'approved', 'actor-a'),
      store.decideApproval('tenant-a', approval.id, 'rejected', 'actor-b'),
    ]);
    expect(decisions.filter((decision) => decision.status === 'fulfilled')).toHaveLength(1);
    expect(decisions.filter((decision) => decision.status === 'rejected')).toHaveLength(1);
    expect(await store.getApproval('tenant-a', approval.id)).toMatchObject({ status: expect.stringMatching(/approved|rejected/) });
    expect(await store.getApproval('tenant-b', approval.id)).toBeNull();
    expect((await store.listEvents('tenant-a', task.id)).filter((event) => event.type === 'approval_decided')).toHaveLength(1);
  });
});
