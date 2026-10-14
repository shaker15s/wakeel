import { beforeEach, describe, expect, it, vi } from 'vitest';

const { taskStore, createAndAdvanceTask, getOdooConnector, advanceTask, cancelTask, buildTaskView, requireOwnedOperator } = vi.hoisted(() => ({
  taskStore: { getTask: vi.fn(), decideApproval: vi.fn() },
  createAndAdvanceTask: vi.fn(), getOdooConnector: vi.fn(), advanceTask: vi.fn(), cancelTask: vi.fn(),
  buildTaskView: vi.fn(), requireOwnedOperator: vi.fn(),
}));
vi.mock('@/server/runtime/task-api', () => ({ taskStore, createAndAdvanceTask, getOdooConnector, advanceTask, cancelTask }));
vi.mock('@/server/runtime/demo-view', () => ({ buildTaskView }));
vi.mock('@/lib/auth', () => ({ requireOwnedOperator }));

import { POST as createTask } from '@/app/api/agent/tasks/route';
import { GET as getTask } from '@/app/api/agent/tasks/[taskId]/route';
import { POST as approveTask } from '@/app/api/agent/tasks/[taskId]/approval/route';

const actor = { id: 'operator-a', name: 'Owner', workspace: 'Company', role: null, accountId: 'account-a' };
const account = { id: 'account-a', email: 'owner@example.test', name: 'Owner' };
const req = (body: unknown) => new Request('http://localhost/api/agent/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('/api/agent/tasks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireOwnedOperator.mockResolvedValue({ ok: true, user: actor, account });
  });

  it('checks the authenticated actor before creating a durable task', async () => {
    requireOwnedOperator.mockResolvedValue({ ok: false, res: new Response(null, { status: 403 }) });
    const response = await createTask(req({ userId: 'operator-a', workflowType: 'create_draft_invoice', input: {} }));
    expect(response.status).toBe(403);
    expect(createAndAdvanceTask).not.toHaveBeenCalled();
  });

  it('does not let an operator from the same account read another actor task', async () => {
    taskStore.getTask.mockResolvedValue({ id: 'task-1', actorId: 'operator-b' });
    const response = await getTask(new Request('http://localhost/api/agent/tasks/task-1?userId=operator-a'), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(404);
    expect(buildTaskView).not.toHaveBeenCalled();
  });

  it('rejects approval ids that are not pending for the requested scoped task', async () => {
    taskStore.getTask.mockResolvedValue({ id: 'task-1', actorId: 'operator-a' });
    buildTaskView.mockResolvedValue({ pendingApproval: { id: 'approval-right' } });
    const response = await approveTask(req({ userId: 'operator-a', approvalId: 'approval-wrong', decision: 'approved' }), { params: Promise.resolve({ taskId: 'task-1' }) });
    expect(response.status).toBe(409);
    expect(taskStore.decideApproval).not.toHaveBeenCalled();
  });
});
