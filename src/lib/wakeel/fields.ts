/**
 * Shared typed-field helpers for blueprint-driven routes (seed, csv import).
 *
 * Blueprints can store fields at `.fields`, `.entity.fields` or
 * `.entities[0].fields` — this module normalizes them into a flat list of
 * typed fields and coerces arbitrary values against those types.
 */

export const FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export interface TypedField {
  key: string
  label: string
  type: FieldType
  options?: string[]
}

/** Parse a stored blueprint JSON string into normalized typed fields (max 8). */
export function extractFields(blueprintRaw: string): TypedField[] {
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
  const fields: TypedField[] = []
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

/** Coerce an arbitrary value against a typed field. Never throws. */
export function coerce(field: TypedField, value: unknown): unknown {
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
