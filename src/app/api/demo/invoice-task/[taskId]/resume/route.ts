import { NextResponse } from "next/server";
import { handleRoute, jsonError } from "@/lib/wakeel/http";
import { advance } from "@/server/runtime/executor";
import {
  getDemoExecutorDeps,
  withDemoMutation,
} from "@/server/runtime/demo-store";
import { readDemoTenantId } from "@/server/runtime/demo-tenant";
import { buildTaskView } from "@/server/runtime/demo-view";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  return handleRoute(() =>
    withDemoMutation(async () => {
      const tenantId = readDemoTenantId(req);
      if (!tenantId) return jsonError(400, "Missing demo tenant id.");
      const { taskId } = await params;
      const deps = getDemoExecutorDeps();
      if (!(await deps.store.getTask(tenantId, taskId)))
        return jsonError(404, "Task not found.");
      await advance(deps, tenantId, taskId);
      return NextResponse.json({
        task: await buildTaskView(deps.store, tenantId, taskId),
      });
    }),
  );
}
