import { z } from 'zod';
import { requireOwnedOperator } from '@/lib/auth';
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http';
import { buildTaskView } from '@/server/runtime/demo-view';
import { taskStore } from '@/server/runtime/task-api';

const querySchema = z.object({ userId: z.string().trim().min(1) });

export async function GET(req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  return handleRoute(async () => {
    const { taskId } = await ctx.params;
    const parsed = querySchema.safeParse({ userId: new URL(req.url).searchParams.get('userId') });
    if (!parsed.success) return jsonError(400, 'userId is required.');
    const guard = await requireOwnedOperator(req, parsed.data.userId);
    if (!guard.ok) return guard.res;
    const task = await taskStore.getTask(guard.account.id, taskId);
    if (!task || task.actorId !== guard.user.id) return jsonError(404, 'Task not found.');
    return jsonOk({ task: await buildTaskView(taskStore, guard.account.id, taskId) });
  });
}
