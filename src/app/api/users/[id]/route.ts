import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'

/** GET /api/users/[id] — operator profile + workspace stats. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const user = await db.user.findUnique({ where: { id } })
    if (!user) return jsonError(404, 'User not found.')

    const [systems, discovered, created, records, scans] = await db.$transaction([
      db.aiSystem.count({ where: { userId: id } }),
      db.aiSystem.count({ where: { userId: id, origin: 'DISCOVERED' } }),
      db.aiSystem.count({ where: { userId: id, origin: 'CREATED' } }),
      db.systemRecord.count({ where: { system: { userId: id } } }),
      db.scanSession.count({ where: { userId: id } }),
    ])

    return jsonOk({
      user,
      stats: { systems, discovered, created, records, scans },
    })
  })
}
