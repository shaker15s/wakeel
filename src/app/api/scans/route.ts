import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'

/** GET /api/scans?userId= — scan history for a workspace, newest first. */
export async function GET(req: Request) {
  return handleRoute(async () => {
    const userId = new URL(req.url).searchParams.get('userId')
    if (!userId) return jsonError(400, 'userId query parameter is required.')

    const scans = await db.scanSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    return jsonOk({ scans })
  })
}
