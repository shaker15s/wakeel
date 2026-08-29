import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'
import { requireOwnedOperator } from '@/lib/auth'

/** GET /api/activity?userId= — ops-ledger feed, newest first (owner-only). */
export async function GET(req: Request) {
  return handleRoute(async () => {
    const userId = new URL(req.url).searchParams.get('userId')
    if (!userId) return jsonError(400, 'userId query parameter is required.')

    const guard = await requireOwnedOperator(req, userId)
    if (!guard.ok) return guard.res

    const activities = await db.activity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return jsonOk({ activities })
  })
}
