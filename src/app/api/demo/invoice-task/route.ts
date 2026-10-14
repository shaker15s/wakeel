import { createHash } from "node:crypto";
import { computeActionHash } from "@/server/runtime/action-hash";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute, jsonError } from "@/lib/wakeel/http";
import {
  advance,
  createCreateDraftInvoiceTask,
} from "@/server/runtime/executor";
import {
  DEMO_ACTOR_ID,
  getDemoExecutorDeps,
  withDemoMutation,
} from "@/server/runtime/demo-store";
import { readDemoTenantId } from "@/server/runtime/demo-tenant";
import { buildTaskView } from "@/server/runtime/demo-view";

/**
 * Demo-only, no-login API for the create_draft_invoice runtime
 * (see src/server/runtime/demo-store.ts for why this exists separately
 * from the real authenticated app). Never add real ERP credentials or
 * production data here — this always runs against FakeERPConnector.
 *
 * Tenant identity comes from the `x-demo-tenant-id` request header, not a
 * cookie — see src/server/runtime/demo-tenant.ts for why.
 */

const createTaskSchema = z.object({
  customerId: z.union([z.string().min(1).max(100), z.number().finite()]),
  lines: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        quantity: z.number(),
        unitPrice: z.number(),
        productId: z
          .union([z.string().min(1).max(100), z.number().finite()])
          .optional(),
      }),
    )
    .min(1)
    .max(100),
  memo: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
  return handleRoute(() =>
    withDemoMutation(async () => {
      const tenantId = readDemoTenantId(req);
      if (!tenantId)
        return jsonError(
          400,
          `Missing or invalid demo tenant id — send an x-demo-tenant-id header.`,
        );

      const body: unknown = await req.json().catch(() => null);
      const parsed = createTaskSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(
          400,
          `Invalid invoice request: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        );
      }

      const key = req.headers.get("x-idempotency-key");
      if (key && !/^[a-zA-Z0-9_-]{16,100}$/.test(key))
        return jsonError(400, "Invalid intake idempotency key.");
      const taskId = key
        ? createHash("sha256")
            .update(JSON.stringify([tenantId, key]))
            .digest("hex")
        : undefined;
      const deps = getDemoExecutorDeps();
      if (taskId) {
        const previous = await deps.store.getTask(tenantId, taskId);
        if (previous) {
          const hash = (input: unknown) =>
            computeActionHash({
              toolName: "demo_intake",
              normalizedParams: input,
              policyVersion: "intake-v1",
              resourceRef: tenantId,
            });
          if (hash(previous.input) !== hash(parsed.data))
            return jsonError(
              409,
              "تم استخدام معرّف الطلب ببيانات مختلفة. راجع المهمة السابقة ثم افتح مهمة جديدة.",
            );
          await advance(deps, tenantId, taskId);
          return NextResponse.json({
            tenantId,
            task: await buildTaskView(deps.store, tenantId, taskId),
            replayed: true,
          });
        }
      }
      const task = await createCreateDraftInvoiceTask(deps, {
        tenantId,
        actorId: DEMO_ACTOR_ID,
        taskId,
        input: parsed.data,
      });
      await advance(deps, tenantId, task.id);

      const view = await buildTaskView(deps.store, tenantId, task.id);
      return NextResponse.json({ tenantId, task: view }, { status: 201 });
    }),
  );
}

export async function GET(req: Request) {
  return handleRoute(async () => {
    const tenantId = readDemoTenantId(req);
    if (!tenantId) return jsonError(400, "Missing demo tenant id.");
    const { store } = getDemoExecutorDeps();
    const tasks = await store.listTasks(tenantId);
    const views = await Promise.all(
      tasks.map((t) => buildTaskView(store, tenantId, t.id)),
    );
    return NextResponse.json({
      tasks: views,
      mode: "demo",
      persistence: "sqlite-local",
      limit: 100,
    });
  });
}
