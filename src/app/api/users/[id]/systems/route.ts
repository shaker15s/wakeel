import { db } from '@/lib/db'
import { handleRoute, jsonOk } from '@/lib/wakeel/http'
import { requireOwnedOperator } from '@/lib/auth'

/** GET /api/users/[id]/systems — all systems in the workspace, newest first (owner-only). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const guard = await requireOwnedOperator(req, id)
    if (!guard.ok) return guard.res

    const systems = await db.aiSystem.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { records: true } } },
    })
    return jsonOk({ systems })
  })
}
