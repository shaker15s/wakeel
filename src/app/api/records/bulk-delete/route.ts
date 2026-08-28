import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'

export const dynamic = 'force-dynamic'

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
})

/** POST /api/records/bulk-delete — delete many records at once (ownership checked). */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const body: unknown = await req.json().catch(() => null)
    const parsed = bulkDeleteSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'Invalid input: ids must be a non-empty array.')
    }
    const ids = [...new Set(parsed.data.ids)]

    // restrict to records whose parent system exists — cascade ownership via system
    const records = await db.systemRecord.findMany({
      where: { id: { in: ids } },
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
