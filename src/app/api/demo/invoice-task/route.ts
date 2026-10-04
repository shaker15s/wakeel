import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleRoute, jsonError } from '@/lib/wakeel/http';
import { advance, createCreateDraftInvoiceTask } from '@/server/runtime/executor';
import { DEMO_ACTOR_ID, getDemoExecutorDeps } from '@/server/runtime/demo-store';
import { readDemoTenantId } from '@/server/runtime/demo-tenant';
import { buildTaskView } from '@/server/runtime/demo-view';

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
  customerId: z.union([z.string(), z.number()]),
  lines: z
    .array(
      z.object({
        description: z.string(),
        quantity: z.number(),
        unitPrice: z.number(),
        productId: z.union([z.string(), z.number()]).optional(),
      }),
    )
    .min(1),
  memo: z.string().optional(),
});

export async function POST(req: Request) {
  return handleRoute(async () => {
    const tenantId = readDemoTenantId(req);
    if (!tenantId) return jsonError(400, `Missing or invalid demo tenant id — send an x-demo-tenant-id header.`);

    const body: unknown = await req.json().catch(() => null);
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, `Invalid invoice request: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    }

    const deps = getDemoExecutorDeps();
    const task = await createCreateDraftInvoiceTask(deps, {
      tenantId,
      actorId: DEMO_ACTOR_ID,
      input: parsed.data,
    });
    await advance(deps, tenantId, task.id);

    const view = await buildTaskView(deps.store, tenantId, task.id);
    return NextResponse.json({ tenantId, task: view }, { status: 201 });
  });
}
