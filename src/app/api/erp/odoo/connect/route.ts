import { z } from 'zod';
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http';
import { requireOwnedOperator } from '@/lib/auth';
import { Odoo19Connector } from '@/server/erp/odoo-connector';
import { db } from '@/lib/db';

const connectSchema = z.object({
  userId: z.string().min(1),
  url: z.string().url(),
  db: z.string().min(1),
  username: z.string().min(1),
  apiKeyOrPassword: z.string().min(1),
});

export async function POST(req: Request) {
  return handleRoute(async () => {
    const body = await req.json().catch(() => null);
    const parsed = connectSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, 'Invalid Odoo connection parameters.');
    }

    const { userId, url, db: odooDb, username, apiKeyOrPassword } = parsed.data;
    const guard = await requireOwnedOperator(req, userId);
    if (!guard.ok) return guard.res;

    // Test real Odoo connection and verify permissions
    const connector = new Odoo19Connector({
      url,
      db: odooDb,
      username,
      apiKeyOrPassword,
      operatorId: guard.user.id,
    });

    const status = await connector.testConnection();

    if (!status.authenticated || !status.healthy) {
      return jsonError(400, 'Could not authenticate with Odoo. Check URL, database name, and credentials.');
    }

    // Save as active ERP connection in DB
    const existingSystem = await db.aiSystem.findFirst({
      where: { userId: guard.user.id, category: 'ERP' },
    });

    const systemData = {
      name: `Odoo ERP (${odooDb})`,
      description: `Connected to ${url} as ${username}`,
      category: 'ERP',
      icon: 'Database',
      origin: 'DISCOVERED',
      status: 'ACTIVE',
      health: 98,
      confidence: 100,
      source: url,
      blueprint: JSON.stringify({
        url,
        db: odooDb,
        username,
        apiKeyOrPassword,
        permissions: status.permissions,
        user: status.user,
      }),
      capabilities: JSON.stringify(status.confirmedEntities),
    };

    if (existingSystem) {
      await db.aiSystem.update({
        where: { id: existingSystem.id },
        data: systemData,
      });
    } else {
      await db.aiSystem.create({
        data: {
          ...systemData,
          userId: guard.user.id,
        },
      });
    }

    await db.activity.create({
      data: {
        userId: guard.user.id,
        type: 'ADOPT',
        title: `Connected Odoo ERP (${odooDb})`,
        detail: `Authenticated as ${status.user.name || username} with verified permissions.`,
        status: 'DONE',
      },
    });

    return jsonOk({
      success: true,
      status,
    });
  });
}
