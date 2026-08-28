import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'
import { requireOwnedRecord } from '@/lib/auth'

const updateRecordSchema = z.object({
  data: z.record(z.string(), z.unknown()),
})

/** Hard ceiling on any single record payload (guards DB bloat + abuse). */
const MAX_RECORD_JSON = 20_000

/** PATCH /api/records/[id] — replace a record's data payload (owner-only). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const guard = await requireOwnedRecord(req, id)
    if (!guard.ok) return guard.res

    const body: unknown = await req.json().catch(() => null)
    const parsed = updateRecordSchema.safeParse(body)
    if (!parsed.success || Object.keys(parsed.data.data).length === 0) {
      return jsonError(400, 'Invalid input: data must be a non-empty object.')
    }
    if (JSON.stringify(parsed.data.data).length > MAX_RECORD_JSON) {
      return jsonError(413, 'Record payload too large (20KB max).')
    }

    const record = await db.systemRecord.update({
      where: { id },
      data: { data: JSON.stringify(parsed.data.data) },
    })
    return jsonOk({ record })
  })
}

/** DELETE /api/records/[id] — remove a data row (owner-only). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const guard = await requireOwnedRecord(req, id)
    if (!guard.ok) return guard.res

    await db.systemRecord.delete({ where: { id } })
    return jsonOk({ ok: true })
  })
}
