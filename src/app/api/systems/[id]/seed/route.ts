import { z } from 'zod'
import { db } from '@/lib/db'
import { chatJSON } from '@/lib/wakeel/ai'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'

/**
 * POST /api/systems/[id]/seed — grow REAL sample records for a system.
 *
 * Reads the system blueprint (typed fields), asks the LLM for a handful of
 * realistic, internally-consistent rows, coerces every value against the
 * field types, and persists them. If the LLM is unreachable a deterministic
 * template fills in so the flow NEVER dead-ends. Every seed lands in the
 * activity ledger.
 */

const seedSchema = z.object({
  count: z.number().int().min(1).max(10).optional(),
})

const FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const
type FieldType = (typeof FIELD_TYPES)[number]

interface SeedField {
  key: string
  label: string
  type: FieldType
  options?: string[]
}

function extractFields(blueprintRaw: string): SeedField[] {
  let bp: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(blueprintRaw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      bp = parsed as Record<string, unknown>
    }
  } catch {
    return []
  }
  const entity = bp.entity && typeof bp.entity === 'object' && !Array.isArray(bp.entity)
    ? (bp.entity as Record<string, unknown>)
    : bp
  const rawFields = Array.isArray(entity.fields) ? entity.fields : []
  const seen = new Set<string>()
  const fields: SeedField[] = []
  for (const item of rawFields.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue
    const f = item as Record<string, unknown>
    const key = typeof f.key === 'string' && f.key.trim() ? f.key.trim().slice(0, 40) : ''
    if (!key || seen.has(key)) continue
    seen.add(key)
    const label = typeof f.label === 'string' && f.label.trim() ? f.label.trim().slice(0, 60) : key
    const rawType = typeof f.type === 'string' ? f.type.toLowerCase() : 'text'
    if (rawType === 'select') {
      const options = Array.isArray(f.options)
        ? f.options.filter((o): o is string => typeof o === 'string' && o.trim() !== '').slice(0, 8)
        : []
      fields.push(options.length > 0 ? { key, label, type: 'select', options } : { key, label, type: 'text' })
      continue
    }
    fields.push({
      key,
      label,
      type: (FIELD_TYPES as readonly string[]).includes(rawType) ? (rawType as FieldType) : 'text',
    })
  }
  return fields
}

function coerce(field: SeedField, value: unknown): unknown {
  switch (field.type) {
    case 'number': {
      const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
      return Number.isFinite(n) ? n : 0
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : value === 'true'
    case 'select': {
      const str = typeof value === 'string' ? value : value == null ? '' : String(value)
      return field.options && field.options.includes(str) ? str : field.options?.[0] ?? ''
    }
    case 'date':
      return typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 40) : ''
    default:
      return typeof value === 'string' ? value : value == null ? '' : String(value)
  }
}

/** Deterministic rows so seeding never fails (matches forge's synthesizer). */
function templateRecords(fields: SeedField[], count: number): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (let i = 1; i <= count; i++) {
    const rec: Record<string, unknown> = {}
    for (const f of fields) {
      switch (f.type) {
        case 'number':
          rec[f.key] = i * 3 + 7
          break
        case 'boolean':
          rec[f.key] = i % 2 === 0
          break
        case 'date':
          rec[f.key] = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
          break
        case 'select':
          rec[f.key] = f.options ? f.options[(i - 1) % f.options.length] : ''
          break
        default:
          rec[f.key] = `${f.label} ${i}`
      }
    }
    out.push(rec)
  }
  return out
}

/** POST handler — LLM seed with template fallback. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const body: unknown = await req.json().catch(() => ({}))
    const parsed = seedSchema.safeParse(body ?? {})
    const count = parsed.success && parsed.data.count ? parsed.data.count : 5

    const system = await db.aiSystem.findUnique({
      where: { id },
      select: { id: true, name: true, category: true, description: true, userId: true, blueprint: true },
    })
    if (!system) return jsonError(404, 'System not found.')

    const fields = extractFields(system.blueprint)
    if (fields.length === 0) {
      return jsonError(400, 'This system blueprint has no typed fields to seed — forge it again or add fields first.')
    }

    const fieldSpec = fields
      .map((f) => `- ${f.key} (${f.type}${f.options ? `; one of: ${f.options.join(' | ')}` : ''}) — ${f.label}`)
      .join('\n')

    const raw = await chatJSON(
      `You generate realistic demo data rows for operational mini-apps. Reply with STRICT JSON ONLY — no prose, no markdown fences. Shape: {"records": [object, object, ...]}. Values MUST match each field's type exactly: numbers as JSON numbers, booleans as JSON booleans, dates as "YYYY-MM-DD", selects chosen ONLY from the field's allowed values. Rows must be internally consistent, varied and believable — like a real small business would enter them. Never repeat the same value twice in one column.`,
      `System: "${system.name}" — ${system.description}\nCategory: ${system.category}\nGenerate exactly ${count} rows for these fields:\n${fieldSpec}\n\nSTRICT JSON only.`,
    )

    let source: 'llm' | 'template' = 'template'
    let rows: Record<string, unknown>[] = []
    if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).records)) {
      const candidates = (raw as { records: unknown[] }).records
      for (const item of candidates.slice(0, count)) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue
        const src = item as Record<string, unknown>
        const rec: Record<string, unknown> = {}
        for (const f of fields) rec[f.key] = coerce(f, src[f.key])
        rows.push(rec)
      }
      if (rows.length > 0) source = 'llm'
    }
    if (rows.length === 0) rows = templateRecords(fields, count)

    await db.systemRecord.createMany({
      data: rows.map((r) => ({ systemId: system.id, data: JSON.stringify(r) })),
    })

    await db.activity.create({
      data: {
        userId: system.userId,
        type: 'RECORD',
        title: `Seeded ${rows.length} sample record${rows.length === 1 ? '' : 's'} into ${system.name}`,
        detail: `Fields: ${fields.slice(0, 6).map((f) => f.label).join(', ')}`,
        status: 'DONE',
      },
    })

    return jsonOk({ seeded: rows.length, source }, 201)
  })
}
