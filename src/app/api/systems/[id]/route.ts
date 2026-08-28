import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'

/** GET /api/systems/[id] — one system + its records (newest first). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const system = await db.aiSystem.findUnique({ where: { id } })
    if (!system) return jsonError(404, 'System not found.')

    const records = await db.systemRecord.findMany({
      where: { systemId: id },
      orderBy: { createdAt: 'desc' },
    })
    return jsonOk({ system, records })
  })
}

const patchSystemSchema = z.object({
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
})

/** PATCH /api/systems/[id] — update metadata/status + log activity. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
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

/** DELETE /api/systems/[id] — cascade delete records + log activity. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
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
