import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'
import { requireSession } from '@/lib/auth'
import { LIMITS, rateLimit, tooManyRequests } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
})

/**
 * POST /api/records/bulk-delete — delete many records at once.
 * OWNERSHIP IS ENFORCED: only records whose parent system belongs to the
 * session account are selected (foreign ids are silently ignored, and the
 * response never reveals whether they existed).
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const guard = await requireSession(req)
    if (!guard.ok) return guard.res

    const rl = rateLimit(`bulkdelete:${guard.account.id}`, LIMITS.recordWrite)
    if (!rl.ok) return tooManyRequests(rl)

    const body: unknown = await req.json().catch(() => null)
    const parsed = bulkDeleteSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'Invalid input: ids must be a non-empty array.')
    }
    const ids = [...new Set(parsed.data.ids)]

    // restrict to records owned by this account (via system → operator → account)
    const records = await db.systemRecord.findMany({
      where: { id: { in: ids }, system: { user: { accountId: guard.account.id } } },
      select: { id: true, systemId: true, system: { select: { id: true, name: true, userId: true } } },
    })
    if (records.length === 0) return jsonError(404, 'No matching records found.')

    const result = await db.systemRecord.deleteMany({
      where: { id: { in: records.map((r) => r.id) } },
    })

    // group per system name for a single readable ledger entry per system
    const bySystem = new Map<string, { name: string; userId: string; count: number }>()
    for (const r of records) {
      const entry = bySystem.get(r.systemId) ?? {
        name: r.system.name,
        userId: r.system.userId,
        count: 0,
      }
      entry.count += 1
      bySystem.set(r.systemId, entry)
    }

    await db.activity.createMany({
      data: [...bySystem.values()].map((s) => ({
        userId: s.userId,
        type: 'DELETE',
        title: `Bulk deleted ${s.count} record${s.count === 1 ? '' : 's'} from ${s.name}`,
        detail: `Selection removed via records console`,
        status: 'DONE',
      })),
    })

    return jsonOk({ ok: true, deleted: result.count })
  })
}
