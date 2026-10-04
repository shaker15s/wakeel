import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleRoute, jsonError } from '@/lib/wakeel/http';
import { advance, createCreateDraftInvoiceTask } from '@/server/runtime/executor';
import { DEMO_ACTOR_ID, getDemoExecutorDeps } from '@/server/runtime/demo-store';
import { ensureDemoTenantCookie } from '@/server/runtime/demo-tenant';
import { buildTaskView } from '@/server/runtime/demo-view';

/**
 * Demo-only, no-login API for the create_draft_invoice runtime
 * (see src/server/runtime/demo-store.ts for why this exists separately
 * from the real authenticated app). Never add real ERP credentials or
 * production data here — this always runs against FakeERPConnector.
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
    const body: unknown = await req.json().catch(() => null);
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, `Invalid invoice request: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    }

    const deps = getDemoExecutorDeps();
    const cookieCarrier = NextResponse.json({});
    const tenantId = ensureDemoTenantCookie(req, cookieCarrier);
    const setCookie = cookieCarrier.headers.get('set-cookie');

    const task = await createCreateDraftInvoiceTask(deps, {
      tenantId,
      actorId: DEMO_ACTOR_ID,
      input: parsed.data,
    });
    await advance(deps, tenantId, task.id);

    const view = await buildTaskView(deps.store, tenantId, task.id);
    const response = NextResponse.json({ tenantId, task: view }, { status: 201 });
    if (setCookie) response.headers.set('set-cookie', setCookie);
    return response;
  });
}
