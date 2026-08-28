import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'
import { requireOwnedSystem } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Share-link management for a system (owner-only).
 *  GET    — current live link (or null)
 *  POST   — create a link (or return the existing live one)
 *  DELETE — revoke the live link
 */

function liveLink(systemId: string) {
  return db.shareLink.findFirst({
    where: { systemId, revoked: false },
    orderBy: { createdAt: 'desc' },
  })
}

function publicView(link: { token: string; views: number; createdAt: Date }) {
  return { token: link.token, url: `/#share=${link.token}`, views: link.views, createdAt: link.createdAt }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const guard = await requireOwnedSystem(req, id)
    if (!guard.ok) return guard.res
    const link = await liveLink(id)
    return jsonOk({ share: link ? publicView(link) : null })
  })
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const guard = await requireOwnedSystem(req, id)
    if (!guard.ok) return guard.res
    const system = guard.system

    const existing = await liveLink(id)
    if (existing) return jsonOk({ share: publicView(existing), created: false })

    const token = randomBytes(18).toString('base64url')
    const link = await db.shareLink.create({ data: { systemId: id, token } })

    await db.activity.create({
      data: {
        userId: system.userId,
        type: 'SHARE',
        title: `Shared "${system.name}"`,
        detail: `Read-only link issued · token ${token.slice(0, 6)}…`,
        status: 'DONE',
      },
    })

    return jsonOk({ share: publicView(link), created: true }, 201)
  })
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const guard = await requireOwnedSystem(req, id)
    if (!guard.ok) return guard.res
    const system = guard.system

    const link = await liveLink(id)
    if (!link) return jsonError(404, 'No live share link for this system.')

    await db.shareLink.update({ where: { id: link.id }, data: { revoked: true } })
    await db.activity.create({
      data: {
        userId: system.userId,
        type: 'SHARE',
        title: `Share link revoked for "${system.name}"`,
        detail: `Token ${link.token.slice(0, 6)}… can no longer be opened.`,
        status: 'DONE',
      },
    })

    return jsonOk({ ok: true })
  })
}
