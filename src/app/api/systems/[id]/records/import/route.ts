import { z } from 'zod'
import { db } from '@/lib/db'
import { coerce, extractFields } from '@/lib/wakeel/fields'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'
import { requireOwnedSystem } from '@/lib/auth'
import { LIMITS, rateLimit, tooManyRequests } from '@/lib/rate-limit'

/**
 * POST /api/systems/[id]/records/import — bulk-import records from a CSV the
 * operator mapped client-side (CSV IMPORT dialog).
 *
 * The client sends the MAPPED rows (csv column → blueprint field). The server
 * re-coerces every value against the blueprint's typed fields, drops unknown
 * keys, skips fully-empty rows, persists everything in one createMany, and
 * logs a RECORD ledger entry. Hard ceiling: 500 rows per call.
 */

const MAX_ROWS = 500
const MAX_KEY = 40
const MAX_VALUE = 500

const cellSchema = z.union([z.string().max(MAX_VALUE), z.number(), z.boolean(), z.null()])

const importSchema = z.object({
  rows: z
    .array(
      z.record(z.string().max(MAX_KEY), cellSchema)
    )
    .min(1)
    .max(MAX_ROWS),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const guard = await requireOwnedSystem(req, id)
    if (!guard.ok) return guard.res
    const rl = rateLimit(`csv:${guard.account.id}`, LIMITS.importCsv)
    if (!rl.ok) return tooManyRequests(rl, 'Import rate limit reached — try again shortly.')

    const body: unknown = await req.json().catch(() => null)
    const parsed = importSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, `Invalid input: rows must be a non-empty array of objects (max ${MAX_ROWS} rows).`)
    }

    const system = guard.system

    const fields = extractFields(system.blueprint)
    if (fields.length === 0) {
      return jsonError(400, 'This system blueprint has no typed fields to map CSV columns onto.')
    }
    const fieldKeys = new Set(fields.map((f) => f.key))

    // re-coerce every cell against the blueprint's typed fields; keep only
    // known keys; skip rows that end up with no meaningful content at all.
    const cleaned: Record<string, unknown>[] = []
    for (const row of parsed.data.rows) {
      const rec: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(row)) {
        if (!fieldKeys.has(key)) continue
        const field = fields.find((f) => f.key === key)
        if (field) rec[key] = coerce(field, value)
      }
      const meaningful = Object.values(rec).some(
        (v) => v !== '' && v !== null && v !== undefined && v !== false
      )
      if (meaningful) cleaned.push(rec)
    }
    if (cleaned.length === 0) {
      return jsonError(400, 'No usable rows survived type coercion — check the column mapping.')
    }

    await db.systemRecord.createMany({
      data: cleaned.map((r) => ({ systemId: system.id, data: JSON.stringify(r) })),
    })

    const usedFields = fields.filter((f) => cleaned.some((r) => f.key in r))

    await db.activity.create({
      data: {
        userId: system.userId,
        type: 'RECORD',
        title: `Imported ${cleaned.length} record${cleaned.length === 1 ? '' : 's'} into ${system.name} from CSV`,
        detail: `Fields: ${usedFields.slice(0, 6).map((f) => f.label).join(', ')}`,
        status: 'DONE',
      },
    })

    return jsonOk({ imported: cleaned.length, skipped: parsed.data.rows.length - cleaned.length }, 201)
  })
}
