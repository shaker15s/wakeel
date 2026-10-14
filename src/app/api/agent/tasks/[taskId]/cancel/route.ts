import { z } from 'zod';
import { requireOwnedOperator } from '@/lib/auth';
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http';
import { buildTaskView } from '@/server/runtime/demo-view';
import { cancelTask, taskStore } from '@/server/runtime/task-api';

const bodySchema = z.object({ userId: z.string().trim().min(1), reason: z.string().trim().max(500).optional() }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  return handleRoute(async () => {
    const { taskId } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, 'Provide a valid cancellation request.');
    const guard = await requireOwnedOperator(req, parsed.data.userId);
    if (!guard.ok) return guard.res;
    const task = await taskStore.getTask(guard.account.id, taskId);
    if (!task || task.actorId !== guard.user.id) return jsonError(404, 'Task not found.');
    await cancelTask({ store: taskStore }, guard.account.id, taskId, guard.user.id, parsed.data.reason);
    return jsonOk({ task: await buildTaskView(taskStore, guard.account.id, taskId) });
  });
}
