import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleRoute, jsonError } from '@/lib/wakeel/http';
import { advance } from '@/server/runtime/executor';
import { getDemoExecutorDeps } from '@/server/runtime/demo-store';
import { readDemoTenantId } from '@/server/runtime/demo-tenant';
import { buildTaskView } from '@/server/runtime/demo-view';
import { FakeERPConnector, InvoiceFaultBehavior } from '@/server/erp/fake-connector';

type RouteParams = { params: Promise<{ taskId: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  return handleRoute(async () => {
    const { taskId } = await params;
    const tenantId = readDemoTenantId(req);
    if (!tenantId) return jsonError(404, 'No demo session found for this browser.');

    const deps = getDemoExecutorDeps();
    const view = await buildTaskView(deps.store, tenantId, taskId);
    if (!view) return jsonError(404, 'Task not found.');
    return NextResponse.json({ task: view });
  });
}

const FAULT_OPTIONS = ['none', 'transient_once', 'crash_after_write', 'exhaust_retries'] as const;

const decideSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().optional(),
  /**
   * Demo-only lever to showcase the reliability features from Milestone 1:
   * simulates the fake ERP connector misbehaving on the NEXT write attempt,
   * so you can watch the runtime recover (or correctly refuse to guess)
   * instead of just taking our word for it.
   */
  faultInjection: z.enum(FAULT_OPTIONS).optional(),
});

function queueFault(connector: FakeERPConnector, fault: (typeof FAULT_OPTIONS)[number] | undefined) {
  const behaviors: Record<(typeof FAULT_OPTIONS)[number], InvoiceFaultBehavior[]> = {
    none: [],
    transient_once: ['transient_error'],
    crash_after_write: ['crash_after_write'],
    exhaust_retries: ['transient_error', 'transient_error', 'transient_error'],
  };
  for (const b of behaviors[fault ?? 'none']) connector.queueInvoiceBehavior(b);
}

export async function POST(req: Request, { params }: RouteParams) {
  return handleRoute(async () => {
    const { taskId } = await params;
    const tenantId = readDemoTenantId(req);
    if (!tenantId) return jsonError(404, 'No demo session found for this browser.');

    const body: unknown = await req.json().catch(() => null);
    const parsed = decideSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, `Invalid decision: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    }

    const deps = getDemoExecutorDeps();
    const existing = await deps.store.getTask(tenantId, taskId);
    if (!existing) return jsonError(404, 'Task not found.');

    const steps = await deps.store.listSteps(taskId);
    const approvalStep = steps.find((s) => s.name === 'await_approval');
    const approvalId = (approvalStep?.output as { approvalId?: string } | undefined)?.approvalId;
    if (!approvalId) return jsonError(409, 'This task has no pending approval to decide.');

    // Human-decision-only entrypoint — this is the actual approval gate.
    // "decidedBy" here is the demo browser's anonymous tenant id, standing
    // in for a real human operator identity.
    await deps.store.decideApproval(tenantId, approvalId, parsed.data.decision, tenantId, parsed.data.reason);

    if (parsed.data.decision === 'approved' && parsed.data.faultInjection && parsed.data.faultInjection !== 'none') {
      queueFault(deps.connector as FakeERPConnector, parsed.data.faultInjection);
    }

    const task = await advance(deps, tenantId, taskId);
    const view = await buildTaskView(deps.store, tenantId, taskId);
    return NextResponse.json({ task: view, status: task.status });
  });
}
