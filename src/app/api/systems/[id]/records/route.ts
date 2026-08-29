import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'
import { requireOwnedSystem } from '@/lib/auth'
import { LIMITS, rateLimit, tooManyRequests } from '@/lib/rate-limit'

const createRecordSchema = z.object({
  data: z.record(z.string(), z.unknown()),
})

/** Hard ceiling on any single record payload (guards DB bloat + abuse). */
const MAX_RECORD_JSON = 20_000
/** Cap per system so one workspace can't grow unbounded. */
const MAX_RECORDS_PER_SYSTEM = 5_000

/** POST /api/systems/[id]/records — add a data row to a system (owner-only). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const guard = await requireOwnedSystem(req, id)
    if (!guard.ok) return guard.res

    const rl = rateLimit(`record:${guard.account.id}`, LIMITS.recordWrite)
    if (!rl.ok) return tooManyRequests(rl)

    const body: unknown = await req.json().catch(() => null)
    const parsed = createRecordSchema.safeParse(body)
    if (!parsed.success || Object.keys(parsed.data.data).length === 0) {
      return jsonError(400, 'Invalid input: data must be a non-empty object.')
    }
    if (JSON.stringify(parsed.data.data).length > MAX_RECORD_JSON) {
      return jsonError(413, 'Record payload too large (20KB max).')
    }

    const count = await db.systemRecord.count({ where: { systemId: id } })
    if (count >= MAX_RECORDS_PER_SYSTEM) {
      return jsonError(409, 'This system reached the 5,000-record cap. Archive or delete rows first.')
    }

    const record = await db.systemRecord.create({
      data: { systemId: id, data: JSON.stringify(parsed.data.data) },
    })

    await db.activity.create({
      data: {
        userId: guard.system.userId,
        type: 'RECORD',
        title: `New record added to ${guard.system.name}`,
        detail: `Fields: ${Object.keys(parsed.data.data).slice(0, 6).join(', ')}`,
        status: 'DONE',
      },
    })

    return jsonOk({ record }, 201)
  })
}
