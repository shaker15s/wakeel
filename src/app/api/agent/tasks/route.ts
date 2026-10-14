import { z } from 'zod';
import { requireOwnedOperator } from '@/lib/auth';
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http';
import { buildTaskView } from '@/server/runtime/demo-view';
import { createAndAdvanceTask, getOdooConnector, taskStore } from '@/server/runtime/task-api';

const bodySchema = z.object({
  userId: z.string().trim().min(1),
  workflowType: z.enum(['create_draft_invoice', 'create_draft_vendor_bill']),
  input: z.unknown(),
}).strict();

export async function POST(req: Request) {
  return handleRoute(async () => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(400, 'Provide a supported accounting workflow and input.');
    const guard = await requireOwnedOperator(req, parsed.data.userId);
    if (!guard.ok) return guard.res;
    const connector = await getOdooConnector(guard.user.id);
    if (!connector) return jsonError(409, 'Connect an active ERP workspace before creating an accounting task.');
    const { task } = await createAndAdvanceTask({ tenantId: guard.account.id, actorId: guard.user.id, workflowType: parsed.data.workflowType, input: parsed.data.input }, connector);
    return jsonOk({ task: await buildTaskView(taskStore, guard.account.id, task.id) }, 201);
  });
}
