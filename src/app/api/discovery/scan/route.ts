import { z } from 'zod'
import { db } from '@/lib/db'
import { chatJSON, runWebSearch, type WebSearchResult } from '@/lib/wakeel/ai'
import {
  clampInt,
  safeCategory,
  safeColor,
  safeIcon,
  SYSTEM_CATEGORIES,
  SYSTEM_COLORS,
  SYSTEM_ICONS,
} from '@/lib/wakeel/constants'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'

const scanSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
  target: z.string().trim().min(1, 'target is required').max(200),
  notes: z.string().trim().max(1000).optional(),
  /** operator's UI language — LLM prose is born in that language */
  lang: z.enum(['en', 'ar']).optional(),
})

/** Language directive appended to the auditor prompt when the operator runs Arabic. */
const AR_LANG_DIRECTIVE = `LANGUAGE DIRECTIVE: the operator runs the Arabic UI. Write EVERY human-language string (summary, description, source, capabilities) in fluent, business-appropriate Modern Standard Arabic. Keep real product names (e.g. "SAP", "Odoo") in Latin script. The category, icon and color fields MUST remain exactly as their English enum keys — only prose is Arabic. Capabilities like "إدارة جهات الاتصال" read naturally in Arabic.`

const AUDITOR_SYSTEM_PROMPT = `You are a senior systems auditor performing a digital footprint analysis for Wakeel, an AI-employee operations platform. Given a company target and live web-search evidence, you identify every software system the company likely runs (CRM, ERP, finance, HR, email, storage, support...).

You reply with STRICT JSON ONLY — no prose, no markdown fences. Shape:
{
  "summary": string,               // 1-2 sentence audit verdict for this target
  "systems": [                     // 3 to 7 items, most confident first
    {
      "name": string,              // real product name when evidence supports it, otherwise "<Target> <Category>" e.g. "Acme CRM"
      "description": string,       // one sentence, what it does for THIS company specifically
      "category": string,          // one of: ${SYSTEM_CATEGORIES.join(', ')}
      "icon": string,              // one lucide icon name, exactly one of: ${SYSTEM_ICONS.join(', ')}
      "color": string,             // exactly one of: ${SYSTEM_COLORS.join(', ')}
      "confidence": number,        // 0-100, how sure you are this system is actually in use (cap at 60 if evidence is thin)
      "health": number,            // 0-100, estimated operational health of that system
      "source": string,            // short evidence note, e.g. "careers page mentions" or "inferred from industry norms"
      "capabilities": string[]     // 2-5 concrete detected/likely capabilities, short phrases
    }
  ]
}
Rules: never invent a category or icon outside the allowed lists. Never use blue/indigo colors. If evidence is weak, still return 3 systems but keep confidence <= 60 and be honest in "source".`

interface DiscoveredSystemInput {
  name: string
  description: string
  category: string
  icon: string
  color: string
  confidence: number
  health: number
  source: string
  capabilities: string[]
}

function normalizeDiscovery(raw: unknown): { summary: string; systems: DiscoveredSystemInput[] } {
  if (!raw || typeof raw !== 'object') return { summary: '', systems: [] }
  const obj = raw as Record<string, unknown>
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : ''

  const list = Array.isArray(obj.systems) ? obj.systems : []
  const systems: DiscoveredSystemInput[] = []
  for (const item of list.slice(0, 7)) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    const name = typeof s.name === 'string' ? s.name.trim() : ''
    if (!name) continue
    systems.push({
      name: name.slice(0, 80),
      description: typeof s.description === 'string' ? s.description.trim().slice(0, 500) : '',
      category: safeCategory(s.category),
      icon: safeIcon(s.icon),
      color: safeColor(s.color),
      confidence: clampInt(s.confidence, 0, 100, 55),
      health: clampInt(s.health, 0, 100, 80),
      source: typeof s.source === 'string' && s.source.trim() ? s.source.trim().slice(0, 200) : 'web research',
      capabilities: Array.isArray(s.capabilities)
        ? s.capabilities.filter((c): c is string => typeof c === 'string' && c.trim() !== '').slice(0, 8)
        : [],
    })
  }
  return { summary, systems }
}

/** Last-resort plausible stack so the UX never dead-ends. All confidence <= 60. */
function fallbackSystems(target: string, lang: 'en' | 'ar'): DiscoveredSystemInput[] {
  if (lang === 'ar') {
    return [
      {
        name: `${target} CRM`,
        description: `منصة إدارة علاقات العملاء المفترضة لدى ${target}؛ لإدارة جهات الاتصال وخط المبيعات.`,
        category: 'CRM',
        icon: 'Users',
        color: '#E8B44A',
        confidence: 50,
        health: 72,
        source: 'استُنتج من أعراف القطاع (أدلة محدودة)',
        capabilities: ['إدارة جهات الاتصال', 'تتبع صفقات المبيعات', 'جدولة المتابعات'],
      },
      {
        name: `${target} Finance`,
        description: `نظام فوترة وحسابات مفترض لدى ${target}.`,
        category: 'FINANCE',
        icon: 'CreditCard',
        color: '#B4832A',
        confidence: 45,
        health: 70,
        source: 'استُنتج من أعراف القطاع (أدلة محدودة)',
        capabilities: ['إصدار الفواتير', 'تتبع المصروفات', 'التسويات الشهرية'],
      },
      {
        name: `${target} Drive`,
        description: `مساحة تخزين مستندات مشتركة وتعاون مفترضة لدى ${target}.`,
        category: 'STORAGE',
        icon: 'HardDrive',
        color: '#9A9184',
        confidence: 40,
        health: 68,
        source: 'استُنتج من أعراف القطاع (أدلة محدودة)',
        capabilities: ['تخزين المستندات', 'مشاركة الفريق', 'صلاحيات الوصول'],
      },
    ]
  }
  return [
    {
      name: `${target} CRM`,
      description: `Customer relationship platform presumed in use at ${target}; contact and pipeline management.`,
      category: 'CRM',
      icon: 'Users',
      color: '#E8B44A',
      confidence: 50,
      health: 72,
      source: 'inferred from business norms (limited evidence)',
      capabilities: ['Contact management', 'Pipeline tracking', 'Follow-up scheduling'],
    },
    {
      name: `${target} Finance`,
      description: `Invoicing and bookkeeping system presumed at ${target}.`,
      category: 'FINANCE',
      icon: 'CreditCard',
      color: '#B4832A',
      confidence: 45,
      health: 70,
      source: 'inferred from business norms (limited evidence)',
      capabilities: ['Invoicing', 'Expense tracking', 'Monthly reconciliation'],
    },
    {
      name: `${target} Drive`,
      description: `Shared document storage and collaboration presumed at ${target}.`,
      category: 'STORAGE',
      icon: 'HardDrive',
      color: '#9A9184',
      confidence: 40,
      health: 68,
      source: 'inferred from business norms (limited evidence)',
      capabilities: ['Document storage', 'Team sharing', 'Access permissions'],
    },
  ]
}

/**
 * POST /api/discovery/scan — THE CORE FEATURE.
 * Real web research + LLM classification → DISCOVERED systems + COMPLETE scan + activity.
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const body: unknown = await req.json().catch(() => null)
    const parsed = scanSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'Invalid input: userId and target are required.')
    }
    const { userId, target, notes } = parsed.data
    const lang = parsed.data.lang === 'ar' ? 'ar' as const : 'en' as const

    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) return jsonError(404, 'User not found.')

    // a. open the scan session (everything else happens before we report COMPLETE)
    const scan = await db.scanSession.create({
      data: { userId, target, notes: notes ?? null, status: 'RUNNING' },
    })

    // b. three parallel web searches → deduped evidence list (top ~12)
    const queries = [
      `${target} company software systems tools stack`,
      `${target} CRM ERP integrations technology`,
      notes ? `${notes} systems software` : `${target} internal tools platforms`,
    ]
    const batches = await Promise.all(queries.map((q) => runWebSearch(q, 6)))
    const seen = new Set<string>()
    const evidence: WebSearchResult[] = []
    for (const batch of batches) {
      for (const item of batch) {
        const key = item.url || item.name
        if (!key || seen.has(key)) continue
        seen.add(key)
        evidence.push(item)
        if (evidence.length >= 12) break
      }
      if (evidence.length >= 12) break
    }

    // c. LLM classification over the evidence
    const evidenceBlock =
      evidence.length > 0
        ? evidence
            .map((e, i) => `${i + 1}. [${e.host_name || 'web'}] ${e.name}\n   ${e.snippet}`)
            .join('\n')
        : '(no live search results were available — rely on general knowledge, keep confidence low)'

    const userPrompt = [
      `Audit target: ${target}`,
      notes ? `Operator notes: ${notes}` : null,
      `Live web evidence (${evidence.length} items):`,
      evidenceBlock,
      '',
      'Return the STRICT JSON audit now.',
    ]
      .filter((line): line is string => line !== null)
      .join('\n')

    const raw = await chatJSON(
      lang === 'ar' ? `${AUDITOR_SYSTEM_PROMPT}\n\n${AR_LANG_DIRECTIVE}` : AUDITOR_SYSTEM_PROMPT,
      userPrompt,
    )
    const normalized = normalizeDiscovery(raw)

    // d. fallback so the scan never dead-ends
    const usedFallback = normalized.systems.length === 0
    const systemsInput = usedFallback ? fallbackSystems(target, lang) : normalized.systems

    const summary =
      normalized.summary ||
      (usedFallback
        ? lang === 'ar'
          ? `أُنجز تدقيق استنتاجي لـ ${target} — الأدلة الحية كانت محدودة، لذا النتائج منخفضة الثقة.`
          : `Completed an inferred audit of ${target} — live evidence was limited, so results are low-confidence.`
        : lang === 'ar'
          ? `أُنجز تدقيق أنظمة ${target}.`
          : `Completed an audit of ${target}.`)

    // e. persist systems, close scan, log activity
    const created = await db.$transaction(
      systemsInput.map((s) =>
        db.aiSystem.create({
          data: {
            userId,
            name: s.name,
            description: s.description,
            category: s.category,
            icon: s.icon,
            color: s.color,
            confidence: s.confidence,
            health: s.health,
            origin: 'DISCOVERED',
            status: 'ACTIVE',
            source: target,
            blueprint: '{}',
            capabilities: JSON.stringify(s.capabilities),
          },
        })
      )
    )

    const result = {
      summary,
      searchedAt: new Date().toISOString(),
      queryCount: queries.length,
    }
    const completeScan = await db.scanSession.update({
      where: { id: scan.id },
      data: { status: 'COMPLETE', systemsFound: created.length, result: JSON.stringify(result) },
    })

    await db.activity.create({
      data: {
        userId,
        type: 'SCAN',
        title: `Discovered ${created.length} systems for ${target}`,
        detail: summary,
        status: 'DONE',
      },
    })

    return jsonOk({ scan: completeScan, systems: created, summary }, 201)
  })
}
