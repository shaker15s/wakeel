import { z } from 'zod';
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http';
import { requireOwnedOperator } from '@/lib/auth';
import { Odoo19Connector } from '@/server/erp/odoo-connector';
import { executeToolCall } from '@/server/agent/tools';
import { db } from '@/lib/db';

const executeApprovalSchema = z.object({
  userId: z.string().min(1),
  toolName: z.string().min(1),
  parameters: z.record(z.string(), z.any()),
  confirmed: z.boolean(),
});

export async function POST(req: Request) {
  return handleRoute(async () => {
    const body = await req.json().catch(() => null);
    const parsed = executeApprovalSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, 'Invalid approval parameters.');
    }

    const { userId, toolName, parameters, confirmed } = parsed.data;
    const guard = await requireOwnedOperator(req, userId);
    if (!guard.ok) return guard.res;

    if (!confirmed) {
      return jsonOk({ success: false, cancelled: true, message: 'Action cancelled by operator.' });
    }

    // Load active Odoo connection
    const erpSystem = await db.aiSystem.findFirst({
      where: { userId: guard.user.id, category: 'ERP', status: 'ACTIVE' },
    });

    if (!erpSystem) {
      return jsonError(400, 'No active ERP connection found for this workspace.');
    }

    let config: any = {};
    try {
      config = JSON.parse(erpSystem.blueprint);
    } catch {
      return jsonError(500, 'Corrupted ERP connection blueprint.');
    }

    const connector = new Odoo19Connector({
      url: config.url,
      db: config.db,
      username: config.username,
      apiKeyOrPassword: config.apiKeyOrPassword,
      operatorId: guard.user.id,
    });

    // Execute with approvalGranted = true
    const result = await executeToolCall(
      connector,
      toolName,
      parameters,
      guard.user.id,
      true
    );

    await db.activity.create({
      data: {
        userId: guard.user.id,
        type: 'RECORD',
        title: `Executed approved action: ${toolName}`,
        detail: JSON.stringify(result),
        status: result.success ? 'DONE' : 'FAILED',
      },
    });

    return jsonOk({
      success: result.success,
      data: result.data,
      error: result.error,
    });
  });
}
