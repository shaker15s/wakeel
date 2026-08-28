import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'

/** GET /api/users/[id]/systems — all systems in the workspace, newest first. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const user = await db.user.findUnique({ where: { id }, select: { id: true } })
    if (!user) return jsonError(404, 'User not found.')

    const systems = await db.aiSystem.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { records: true } } },
    })
    return jsonOk({ systems })
  })
}
