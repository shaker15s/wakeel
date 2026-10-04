import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleRoute, jsonError } from '@/lib/wakeel/http';
import { cancelTask } from '@/server/runtime/executor';
import { getDemoExecutorDeps } from '@/server/runtime/demo-store';
import { readDemoTenantId } from '@/server/runtime/demo-tenant';
import { buildTaskView } from '@/server/runtime/demo-view';

type RouteParams = { params: Promise<{ taskId: string }> };

const cancelSchema = z.object({ reason: z.string().optional() });

export async function POST(req: Request, { params }: RouteParams) {
  return handleRoute(async () => {
    const { taskId } = await params;
    const tenantId = readDemoTenantId(req);
    if (!tenantId) return jsonError(400, 'Missing or invalid demo tenant id — send an x-demo-tenant-id header.');

    const body: unknown = await req.json().catch(() => ({}));
    const parsed = cancelSchema.safeParse(body ?? {});
    if (!parsed.success) return jsonError(400, `Invalid cancel request: ${parsed.error.issues.map((i) => i.message).join('; ')}`);

    const deps = getDemoExecutorDeps();
    try {
      await cancelTask(deps, tenantId, taskId, tenantId, parsed.data.reason);
    } catch (err) {
      // cancelTask() throws both for "not found for this tenant" and for
      // "already wrote, cannot cancel" — distinguish them for a useful
      // client message instead of a blanket 500.
      const message = err instanceof Error ? err.message : 'Could not cancel this task.';
      if (message.includes('already completed')) return jsonError(409, message);
      return jsonError(404, 'Task not found.');
    }

    const view = await buildTaskView(deps.store, tenantId, taskId);
    return NextResponse.json({ task: view });
  });
}
