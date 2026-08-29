import { db } from '@/lib/db'
import { handleRoute, jsonOk } from '@/lib/wakeel/http'
import { requireOwnedOperator } from '@/lib/auth'

/** GET /api/users/[id] — operator profile + workspace stats (owner-only). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const guard = await requireOwnedOperator(req, id)
    if (!guard.ok) return guard.res

    const [systems, discovered, created, records, scans] = await db.$transaction([
      db.aiSystem.count({ where: { userId: id } }),
      db.aiSystem.count({ where: { userId: id, origin: 'DISCOVERED' } }),
      db.aiSystem.count({ where: { userId: id, origin: 'CREATED' } }),
      db.systemRecord.count({ where: { system: { userId: id } } }),
      db.scanSession.count({ where: { userId: id } }),
    ])

    return jsonOk({
      user: guard.user,
      stats: { systems, discovered, created, records, scans },
    })
  })
}
