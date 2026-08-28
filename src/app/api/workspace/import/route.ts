import { z } from 'zod'
import { db } from '@/lib/db'
import { safeCategory, safeColor, safeIcon } from '@/lib/wakeel/constants'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'

/**
 * POST /api/workspace/import — restore a `wakeel.workspace/v1` export file
 * into a BRAND-NEW operator workspace (systems + records + a ledger entry).
 *
 * The payload is the exact shape `handleExport` in status-bar.tsx writes:
 * { format, exportedAt, operator, systems[] }. Everything is defensively
 * normalized server-side so a hand-edited or partial file can never poison
 * the registry.
 */

const IMPORT_FORMAT = 'wakeel.workspace/v1'

const importedSystemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).optional(),
  category: z.string().trim().max(40).optional(),
  icon: z.string().trim().max(40).optional(),
  color: z.string().trim().max(24).optional(),
  origin: z.string().trim().max(12).optional(),
  status: z.string().trim().max(10).optional(),
  health: z.number().int().min(0).max(100).optional(),
  confidence: z.number().int().min(0).max(100).nullable().optional(),
  source: z.string().max(300).nullable().optional(),
  // blueprint arrives as the PARSED object (export used parseBlueprint);
  // keep it loose here — normalized below
  blueprint: z.unknown().optional(),
  capabilities: z.array(z.string().max(120)).max(10).optional(),
  records: z.array(z.object({
    data: z.record(z.string(), z.unknown()),
    createdAt: z.string().max(40).optional(),
  })).max(500).optional(),
})

const importSchema = z.object({
  format: z.literal(IMPORT_FORMAT),
  operator: z.object({
    name: z.string().trim().min(1).max(80),
    workspace: z.string().trim().min(1).max(80),
    role: z.string().trim().max(80).nullable().optional(),
  }),
  systems: z.array(importedSystemSchema).max(60),
})

const FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const
type FieldType = (typeof FIELD_TYPES)[number]

interface NormField {
  key: string
  label: string
  type: FieldType
  options?: string[]
}

/** Coerce arbitrary blueprint shapes into the canonical stored blueprint. */
function normalizeBlueprint(raw: unknown): string {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}

  // fields may live at .fields, .entity.fields, .entities[0].fields
  const candidates: unknown[] = [
    obj.fields,
    (obj.entity && typeof obj.entity === 'object'
      ? (obj.entity as Record<string, unknown>).fields
      : undefined),
    Array.isArray(obj.entities) && obj.entities[0] && typeof obj.entities[0] === 'object'
      ? (obj.entities[0] as Record<string, unknown>).fields
      : undefined,
  ]
  const rawFields = candidates.find((c) => Array.isArray(c) && c.length > 0) as unknown[] | undefined

  const seen = new Set<string>()
  const fields: NormField[] = []
  for (const item of (rawFields ?? []).slice(0, 8)) {
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
      fields.push(options.length > 0
        ? { key, label, type: 'select', options }
        : { key, label, type: 'text' })
      continue
    }
    const type: FieldType = (FIELD_TYPES as readonly string[]).includes(rawType)
      ? (rawType as FieldType)
      : 'text'
    fields.push({ key, label, type })
  }
  if (fields.length === 0) {
    fields.push(
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['OPEN', 'IN_PROGRESS', 'CLOSED'] },
      { key: 'notes', label: 'Notes', type: 'text' },
    )
  }

  // sample records: keep those that survive field coercion (max 3, like forge)
  const sampleSrc = [obj.sampleRecords, obj.sample_data, obj.samples]
    .find((c): c is unknown[] => Array.isArray(c)) ?? []
  const sampleRecords: Record<string, unknown>[] = []
  for (const item of sampleSrc.slice(0, 3)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const src = item as Record<string, unknown>
    const rec: Record<string, unknown> = {}
    for (const f of fields) {
      const v = src[f.key]
      rec[f.key] =
        f.type === 'number' ? (typeof v === 'number' ? v : Number(v) || 0)
        : f.type === 'boolean' ? typeof v === 'boolean' ? v : v === 'true'
        : f.type === 'select' ? (typeof v === 'string' && f.options?.includes(v) ? v : f.options?.[0] ?? '')
        : typeof v === 'string' ? v : v == null ? '' : String(v)
    }
    sampleRecords.push(rec)
  }

  const toStrings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim().slice(0, 140)).slice(0, 6)
      : []

  const entityRaw = obj.entity && typeof obj.entity === 'object'
    ? (obj.entity as Record<string, unknown>)
    : {}
  const entityName = typeof entityRaw.name === 'string' && entityRaw.name.trim()
    ? entityRaw.name.trim().slice(0, 40)
    : 'record'

  return JSON.stringify({
    entity: {
      name: entityName,
      plural: typeof entityRaw.plural === 'string' && entityRaw.plural.trim()
        ? entityRaw.plural.trim().slice(0, 40)
        : `${entityName}s`,
      fields,
      sampleRecords,
    },
    automations: toStrings(obj.automations),
    views: toStrings(obj.views),
    summary: typeof obj.summary === 'string' ? obj.summary.slice(0, 500) : '',
    importedAt: new Date().toISOString(),
  })
}

/** POST handler — import + restore in one shot. */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const body: unknown = await req.json().catch(() => null)
    if (
      body && typeof body === 'object' && 'format' in body &&
      (body as Record<string, unknown>).format !== IMPORT_FORMAT
    ) {
      return jsonError(400, `Unsupported file: expected format "${IMPORT_FORMAT}".`)
    }
    const parsed = importSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'Invalid workspace file: operator (name + workspace) and a systems array are required.')
    }
    const { operator, systems: rawSystems } = parsed.data

    const recordTotal = rawSystems.reduce((n, s) => n + (s.records?.length ?? 0), 0)

    const user = await db.user.create({
      data: {
        name: operator.name,
        workspace: operator.workspace,
        role: operator.role ?? null,
      },
    })

    let importedRecords = 0
    for (const s of rawSystems) {
      const system = await db.aiSystem.create({
        data: {
          userId: user.id,
          name: s.name,
          description: s.description?.slice(0, 500) ?? '',
          category: safeCategory(s.category),
          icon: safeIcon(s.icon),
          color: safeColor(s.color),
          origin: s.origin === 'DISCOVERED' ? 'DISCOVERED' : 'CREATED',
          status: s.status === 'DRAFT' || s.status === 'ARCHIVED' ? s.status : 'ACTIVE',
          health: typeof s.health === 'number' ? s.health : 90,
          confidence: s.confidence ?? null,
          source: s.source ?? null,
          blueprint: normalizeBlueprint(s.blueprint),
          capabilities: JSON.stringify(s.capabilities ?? []),
        },
      })
      if (s.records && s.records.length > 0) {
        await db.systemRecord.createMany({
          data: s.records.slice(0, 500).map((r) => ({
            systemId: system.id,
            data: JSON.stringify(r.data),
            ...(r.createdAt && !Number.isNaN(+new Date(r.createdAt))
              ? { createdAt: new Date(r.createdAt), updatedAt: new Date(r.createdAt) }
              : {}),
          })),
        })
        importedRecords += Math.min(s.records.length, 500)
      }
    }

    await db.activity.create({
      data: {
        userId: user.id,
        type: 'IMPORT',
        title: `Imported ${rawSystems.length} system${rawSystems.length === 1 ? '' : 's'} for ${user.name}`,
        detail: `Restored from a workspace file · ${rawSystems.length} systems · ${recordTotal} records`,
        status: 'DONE',
      },
    })

    return jsonOk(
      { user, systems: rawSystems.length, records: importedRecords },
      201,
    )
  })
}
