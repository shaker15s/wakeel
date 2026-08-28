import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'

const updateRecordSchema = z.object({
  data: z.record(z.string(), z.unknown()),
})

/** PATCH /api/records/[id] — replace a record's data payload. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const body: unknown = await req.json().catch(() => null)
    const parsed = updateRecordSchema.safeParse(body)
    if (!parsed.success || Object.keys(parsed.data.data).length === 0) {
      return jsonError(400, 'Invalid input: data must be a non-empty object.')
    }

    const existing = await db.systemRecord.findUnique({ where: { id } })
    if (!existing) return jsonError(404, 'Record not found.')

    const record = await db.systemRecord.update({
      where: { id },
      data: { data: JSON.stringify(parsed.data.data) },
    })
    return jsonOk({ record })
  })
}

/** DELETE /api/records/[id] — remove a data row. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const existing = await db.systemRecord.findUnique({ where: { id } })
    if (!existing) return jsonError(404, 'Record not found.')

    await db.systemRecord.delete({ where: { id } })
    return jsonOk({ ok: true })
  })
}
