import { z } from 'zod';
import { requireOwnedOperator } from '@/lib/auth';
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http';
import { buildTaskView } from '@/server/runtime/demo-view';
import { advanceTask, getOdooConnector, taskStore } from '@/server/runtime/task-api';

const bodySchema = z.object({ userId: z.string().trim().min(1), approvalId: z.string().trim().min(1), decision: z.enum(['approved', 'rejected']), reason: z.string().trim().max(500).optional() }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  return handleRoute(async () => {
    const { taskId } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, 'Provide a valid task approval decision.');
    const guard = await requireOwnedOperator(req, parsed.data.userId);
    if (!guard.ok) return guard.res;
    const task = await taskStore.getTask(guard.account.id, taskId);
    if (!task || task.actorId !== guard.user.id) return jsonError(404, 'Task not found.');
    const view = await buildTaskView(taskStore, guard.account.id, taskId);
    if (!view?.pendingApproval || view.pendingApproval.id !== parsed.data.approvalId) return jsonError(409, 'This approval is not pending for the requested task.');
    const connector = await getOdooConnector(guard.user.id);
    if (!connector) return jsonError(409, 'The ERP connection is unavailable; the approval decision was not recorded.');
    await taskStore.decideApproval(guard.account.id, parsed.data.approvalId, parsed.data.decision, guard.user.id, parsed.data.reason);
    const deps = { store: taskStore, connector };
    await advanceTask(deps, guard.account.id, task);
    return jsonOk({ task: await buildTaskView(taskStore, guard.account.id, taskId) });
  });
}
