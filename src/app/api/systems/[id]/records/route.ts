import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'

const createRecordSchema = z.object({
  data: z.record(z.string(), z.unknown()),
})

/** POST /api/systems/[id]/records — add a data row to a system. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const body: unknown = await req.json().catch(() => null)
    const parsed = createRecordSchema.safeParse(body)
    if (!parsed.success || Object.keys(parsed.data.data).length === 0) {
      return jsonError(400, 'Invalid input: data must be a non-empty object.')
    }

    const system = await db.aiSystem.findUnique({
      where: { id },
      select: { id: true, name: true, userId: true },
    })
    if (!system) return jsonError(404, 'System not found.')

    const record = await db.systemRecord.create({
      data: { systemId: id, data: JSON.stringify(parsed.data.data) },
    })

    await db.activity.create({
      data: {
        userId: system.userId,
        type: 'RECORD',
        title: `New record added to ${system.name}`,
        detail: `Fields: ${Object.keys(parsed.data.data).slice(0, 6).join(', ')}`,
        status: 'DONE',
      },
    })

    return jsonOk({ record }, 201)
  })
}
