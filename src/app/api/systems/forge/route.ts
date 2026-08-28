import { z } from 'zod'
import { db } from '@/lib/db'
import { chatJSON } from '@/lib/wakeel/ai'
import {
  safeCategory,
  safeColor,
  safeIcon,
  SYSTEM_CATEGORIES,
  SYSTEM_COLORS,
  SYSTEM_ICONS,
} from '@/lib/wakeel/constants'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'

const forgeSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
  prompt: z.string().trim().min(3, 'prompt is too short').max(1000),
})

const ARCHITECT_SYSTEM_PROMPT = `You are an elite systems architect for Wakeel, an AI-employee operations platform. Given an operator's request, you design a complete, immediately-working mini-app blueprint: one entity, typed fields, and realistic sample data.

Reply with STRICT JSON ONLY — no prose, no markdown fences. Shape:
{
  "name": string,            // product-grade system name, e.g. "Pharmacy Inventory"
  "description": string,     // one sentence: what this system does for THIS operator
  "category": string,        // one of: ${SYSTEM_CATEGORIES.join(', ')}
  "icon": string,            // exactly one lucide name from: ${SYSTEM_ICONS.join(', ')}
  "color": string,           // exactly one of: ${SYSTEM_COLORS.join(', ')}
  "capabilities": string[],  // 3-5 short capability phrases, e.g. "Low-stock alerts"
  "entity": {
    "name": string,          // singular entity name, e.g. "item"
    "plural": string,        // plural entity name, e.g. "items"
    "fields": [              // 3 to 8 fields
      { "key": string, "label": string, "type": "text" | "number" | "date" | "select" | "boolean", "options": string[] }
    ],
    "sampleRecords": [ {...}, {...}, {...} ]  // exactly 3 objects, keyed by field key
  }
}
Rules: field keys must be unique camelCase strings; include "options" ONLY for select fields (3-6 options). Sample record values MUST match field types — numbers as JSON numbers, booleans as JSON booleans, dates as "YYYY-MM-DD" strings, selects chosen from the field's own options. Never use blue or indigo colors.`

const FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const
type FieldType = (typeof FIELD_TYPES)[number]

interface BlueprintField {
  key: string
  label: string
  type: FieldType
  options?: string[]
}

interface BlueprintEntity {
  name: string
  plural: string
  fields: BlueprintField[]
  sampleRecords: Record<string, unknown>[]
}

interface ForgeResult {
  name: string
  description: string
  category: string
  icon: string
  color: string
  capabilities: string[]
  entity: BlueprintEntity
  fallback: boolean
}

function normalizeFields(rawFields: unknown): BlueprintField[] {
  if (!Array.isArray(rawFields)) return []
  const seen = new Set<string>()
  const fields: BlueprintField[] = []
  for (const item of rawFields.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue
    const f = item as Record<string, unknown>
    const key = typeof f.key === 'string' ? f.key.trim().slice(0, 40) : ''
    if (!key || seen.has(key)) continue
    seen.add(key)
    const label = typeof f.label === 'string' && f.label.trim() ? f.label.trim().slice(0, 60) : key
    const rawType = typeof f.type === 'string' ? f.type : ''
    const type: FieldType = (FIELD_TYPES as readonly string[]).includes(rawType) ? (rawType as FieldType) : 'text'
    if (type === 'select') {
      const options = Array.isArray(f.options)
        ? f.options.filter((o): o is string => typeof o === 'string' && o.trim() !== '').slice(0, 8)
        : []
      if (options.length === 0) {
        fields.push({ key, label, type: 'text' })
        continue
      }
      fields.push({ key, label, type, options })
      continue
    }
    fields.push({ key, label, type })
  }
  return fields
}

function coerceValue(field: BlueprintField, value: unknown): unknown {
  switch (field.type) {
    case 'number': {
      const n =
        typeof value === 'number'
          ? value
          : typeof value === 'string' && value.trim() !== ''
            ? Number(value)
            : NaN
      return Number.isFinite(n) ? n : 0
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : value === 'true'
    case 'select': {
      const str = typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)
      return field.options && field.options.includes(str) ? str : field.options?.[0] ?? ''
    }
    case 'date':
      return typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 40) : ''
    default:
      return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)
  }
}

function synthesizeRecords(fields: BlueprintField[], count = 3): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = []
  for (let i = 1; i <= count; i++) {
    const rec: Record<string, unknown> = {}
    for (const f of fields) {
      switch (f.type) {
        case 'number':
          rec[f.key] = i
          break
        case 'boolean':
          rec[f.key] = i % 2 === 0
          break
        case 'date':
          rec[f.key] = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10)
          break
        case 'select':
          rec[f.key] = f.options ? f.options[(i - 1) % f.options.length] : ''
          break
        default:
          rec[f.key] = `${f.label} ${i}`
      }
    }
    records.push(rec)
  }
  return records
}

function normalizeSampleRecords(rawRecords: unknown, fields: BlueprintField[]): Record<string, unknown>[] {
  if (!Array.isArray(rawRecords)) return synthesizeRecords(fields)
  const out: Record<string, unknown>[] = []
  for (const item of rawRecords.slice(0, 3)) {
    if (!item || typeof item !== 'object') continue
    const src = item as Record<string, unknown>
    const rec: Record<string, unknown> = {}
    for (const f of fields) rec[f.key] = coerceValue(f, src[f.key])
    out.push(rec)
  }
  if (out.length < 3) {
    const synthesized = synthesizeRecords(fields, 3)
    while (out.length < 3) out.push(synthesized[out.length])
  }
  return out
}

function normalizeForge(raw: unknown, prompt: string): ForgeResult | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 80) : ''
  if (!name) return null

  const entityRaw = (obj.entity && typeof obj.entity === 'object' ? obj.entity : {}) as Record<string, unknown>
  let fields = normalizeFields(entityRaw.fields)
  const defaults: BlueprintField[] = [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: ['OPEN', 'IN_PROGRESS', 'CLOSED'] },
    { key: 'notes', label: 'Notes', type: 'text' },
  ]
  for (const d of defaults) {
    if (fields.length >= 3) break
    if (!fields.some((f) => f.key === d.key)) fields.push(d)
  }

  const entityName =
    typeof entityRaw.name === 'string' && entityRaw.name.trim() ? entityRaw.name.trim().slice(0, 40) : 'record'
  const entityPlural =
    typeof entityRaw.plural === 'string' && entityRaw.plural.trim()
      ? entityRaw.plural.trim().slice(0, 40)
      : `${entityName}s`

  const capabilities = Array.isArray(obj.capabilities)
    ? obj.capabilities.filter((c): c is string => typeof c === 'string' && c.trim() !== '').slice(0, 6)
    : []

  return {
    name,
    description:
      typeof obj.description === 'string' && obj.description.trim()
        ? obj.description.trim().slice(0, 500)
        : `Forged from request: "${prompt.slice(0, 140)}"`,
    category: safeCategory(obj.category),
    icon: safeIcon(obj.icon),
    color: safeColor(obj.color),
    capabilities: capabilities.length > 0 ? capabilities : ['Record keeping', 'Search & filter', 'Status tracking'],
    entity: {
      name: entityName,
      plural: entityPlural,
      fields,
      sampleRecords: normalizeSampleRecords(entityRaw.sampleRecords, fields),
    },
    fallback: false,
  }
}

/** Fallback template so a failed LLM call never dead-ends the forge. */
function fallbackForge(prompt: string): ForgeResult {
  const fields: BlueprintField[] = [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: ['OPEN', 'IN_PROGRESS', 'CLOSED'] },
    { key: 'owner', label: 'Owner', type: 'text' },
    { key: 'dueDate', label: 'Due date', type: 'date' },
    { key: 'priority', label: 'Priority', type: 'number' },
  ]
  return {
    name: 'Custom Ops Tracker',
    description: `Fallback template forged for request: "${prompt.slice(0, 140)}". Live generation was unavailable — the system is fully editable.`,
    category: 'CUSTOM',
    icon: 'Boxes',
    color: '#E8B44A',
    capabilities: ['Record keeping', 'Search & filter', 'Status tracking'],
    entity: { name: 'record', plural: 'records', fields, sampleRecords: synthesizeRecords(fields) },
    fallback: true,
  }
}

/**
 * POST /api/systems/forge — LLM blueprint → CREATED system + sample records + activity.
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const body: unknown = await req.json().catch(() => null)
    const parsed = forgeSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'Invalid input: userId and prompt (3-1000 chars) are required.')
    }
    const { userId, prompt } = parsed.data

    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) return jsonError(404, 'User not found.')

    const userPrompt = `Operator request: "${prompt}"\n\nDesign the system blueprint now. STRICT JSON only.`

    const raw = await chatJSON(ARCHITECT_SYSTEM_PROMPT, userPrompt)
    const forge = normalizeForge(raw, prompt) ?? fallbackForge(prompt)

    const blueprint = {
      entity: forge.entity,
      prompt,
      generatedAt: new Date().toISOString(),
      fallback: forge.fallback,
    }

    const system = await db.aiSystem.create({
      data: {
        userId,
        name: forge.name,
        description: forge.description,
        category: forge.category,
        icon: forge.icon,
        color: forge.color,
        origin: 'CREATED',
        status: 'ACTIVE',
        health: 95,
        confidence: null,
        source: null,
        blueprint: JSON.stringify(blueprint),
        capabilities: JSON.stringify(forge.capabilities),
      },
    })

    await db.systemRecord.createMany({
      data: forge.entity.sampleRecords.map((r) => ({ systemId: system.id, data: JSON.stringify(r) })),
    })

    await db.activity.create({
      data: {
        userId,
        type: 'FORGE',
        title: `Forged ${forge.name}`,
        detail: forge.description,
        status: 'DONE',
      },
    })

    return jsonOk({ system }, 201)
  })
}
