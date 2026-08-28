import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'
import { parseBlueprint } from '@/lib/api-client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/share/[token] — PUBLIC read-only payload for a shared system.
 * Deliberately minimal: no owner ids, no emails, no mutation surface.
 * Token must be live (not revoked); every successful fetch counts a view.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handleRoute(async () => {
    const { token } = await ctx.params
    if (!token || token.length < 8 || token.length > 80) {
      return jsonError(400, 'Malformed share token.')
    }

    const link = await db.shareLink.findUnique({
      where: { token },
      include: {
        system: {
          include: { user: { select: { workspace: true } } },
        },
      },
    })
    if (!link || link.revoked) return jsonError(404, 'This share link is no longer available.')

    const records = await db.systemRecord.findMany({
      where: { systemId: link.systemId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    // count the view (fire and forget — never block the payload on it)
    void db.shareLink
      .update({ where: { id: link.id }, data: { views: { increment: 1 } } })
      .catch(() => undefined)

    const sys = link.system
    const blueprint = parseBlueprint(sys.blueprint)

    return jsonOk({
      system: {
        name: sys.name,
        description: sys.description,
        category: sys.category,
        icon: sys.icon,
        color: sys.color,
        origin: sys.origin,
        status: sys.status,
        health: sys.health,
        blueprint: {
        summary: blueprint.summary,
        fields: blueprint.fields,
        automations: blueprint.automations,
        views: blueprint.views,
      },
        createdAt: sys.createdAt,
      },
      workspace: link.system.user.workspace,
      records: records.map((r) => ({ data: r.data, createdAt: r.createdAt })),
      meta: { views: link.views + 1, sharedAt: link.createdAt },
    })
  })
}
