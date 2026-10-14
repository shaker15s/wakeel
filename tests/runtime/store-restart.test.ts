import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaTestContext, PrismaTestContext } from './prisma-test-helper';

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
}, 120_000);

afterAll(async () => { await second?.dispose(); await first?.dispose(); });

describe('PrismaTaskStore process restart', () => {
  it('reads committed task state from a separately created Prisma client', async () => {
    expect(await second.store.getTask('tenant-restart', 'task-restart')).toMatchObject({ input: { customerId: 22 } });
    expect(await second.store.listSteps('tenant-restart', 'task-restart')).toMatchObject([{ name: 'validate_input' }]);
  });
});
