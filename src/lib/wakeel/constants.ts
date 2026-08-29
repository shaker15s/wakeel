/**
 * Wakeel domain constants — validation guards for LLM-produced fields.
 * Everything here maps 1:1 to the OPS DECK design system (NO blue/indigo).
 */

export const SYSTEM_CATEGORIES = [
  'CRM',
  'ERP',
  'FINANCE',
  'HR',
  'COMMUNICATION',
  'STORAGE',
  'MARKETING',
  'SUPPORT',
  'OPERATIONS',
  'CUSTOM',
] as const

export const SYSTEM_ICONS = [
  'Database',
  'Globe',
  'Mail',
  'Users',
  'Calendar',
  'FileText',
  'MessageSquare',
  'CreditCard',
  'BarChart3',
  'Boxes',
  'Phone',
  'HardDrive',
  'ShoppingCart',
  'Settings',
  'Workflow',
  'ClipboardList',
  'ShieldCheck',
  'Truck',
] as const

/** OPS DECK palette only — gold / success / danger / neutrals. */
export const SYSTEM_COLORS = ['#E8B44A', '#3ECF8E', '#E5533D', '#B4832A', '#F2D492', '#9A9184'] as const

export type SystemCategory = (typeof SYSTEM_CATEGORIES)[number]
export type SystemIcon = (typeof SYSTEM_ICONS)[number]

export function safeCategory(value: unknown): SystemCategory {
  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase()
    if ((SYSTEM_CATEGORIES as readonly string[]).includes(upper)) {
      return upper as SystemCategory
    }
  }
  return 'CUSTOM'
}

export function safeIcon(value: unknown): SystemIcon {
  if (typeof value === 'string' && (SYSTEM_ICONS as readonly string[]).includes(value.trim())) {
    return value.trim() as SystemIcon
  }
  return 'Boxes'
}

export function safeColor(value: unknown): string {
  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase()
    if ((SYSTEM_COLORS as readonly string[]).includes(upper)) return upper
  }
  return '#E8B44A'
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}
