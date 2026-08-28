import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'
import { requireOwnedSystem } from '@/lib/auth'
import { LIMITS, rateLimit, tooManyRequests } from '@/lib/rate-limit'

/** GET /api/systems/[id] — one system + its records, newest first (owner-only, capped). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const guard = await requireOwnedSystem(req, id)
    if (!guard.ok) return guard.res

    const records = await db.systemRecord.findMany({
      where: { systemId: id },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    // hydrate the full system row for the client (guard carried only a subset)
    const system = await db.aiSystem.findUnique({ where: { id } })
    return jsonOk({ system, records })
  })
}

const patchSystemSchema = z.object({
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
})

/** PATCH /api/systems/[id] — update metadata/status + log activity (owner-only). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const guard = await requireOwnedSystem(req, id)
    if (!guard.ok) return guard.res

    const body: unknown = await req.json().catch(() => null)
    const parsed = patchSystemSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'Invalid input: status must be ACTIVE|DRAFT|ARCHIVED; name/description must be valid strings.')
    }
    const { status, name, description } = parsed.data

    const data: { status?: string; name?: string; description?: string } = {}
    if (status !== undefined) data.status = status
    if (name !== undefined) data.name = name
    if (description !== undefined) data.description = description
    if (Object.keys(data).length === 0) {
      return jsonError(400, 'Nothing to update: provide status, name or description.')
    }

    const system = await db.aiSystem.update({ where: { id }, data })

    let type = 'STATUS'
    let title = `Updated ${system.name}`
    if (status === 'ARCHIVED') {
      type = 'ARCHIVE'
      title = `Archived ${system.name}`
    } else if (status === 'ACTIVE') {
      type = 'RESTORE'
      title = `Restored ${system.name}`
    } else if (status === 'DRAFT') {
      type = 'STATUS'
      title = `Moved ${system.name} to DRAFT`
    }

    await db.activity.create({
      data: { userId: system.userId, type, title, detail: description ?? null, status: 'DONE' },
    })

    return jsonOk({ system })
  })
}

/** DELETE /api/systems/[id] — cascade delete records + log activity (owner-only). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const guard = await requireOwnedSystem(req, id)
    if (!guard.ok) return guard.res

    const rl = rateLimit(`sysdelete:${guard.account.id}`, LIMITS.recordWrite)
    if (!rl.ok) return tooManyRequests(rl)

    const system = await db.aiSystem.findUnique({ where: { id } })
    if (!system) return jsonError(404, 'System not found.')

    await db.aiSystem.delete({ where: { id } })
    await db.activity.create({
      data: {
        userId: system.userId,
        type: 'DELETE',
        title: `Deleted ${system.name}`,
        detail: `Removed system and all of its records`,
        status: 'DONE',
      },
    })
    return jsonOk({ ok: true })
  })
}
