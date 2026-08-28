import { z } from 'zod'
import { db } from '@/lib/db'
import { chatJSON } from '@/lib/wakeel/ai'
import { extractFields } from '@/lib/wakeel/fields'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'

/**
 * POST /api/systems/[id]/automations/suggest — AUTOMATION LAB.
 *
 * Wakeel studies the system (blueprint fields, existing automations, a sample
 * of live records) and proposes up to 3 NEW workflows that are not already in
 * the blueprint. Every proposal is structured {title, trigger, action, why}.
 * If the LLM is unreachable, a deterministic field-type-driven synthesizer
 * proposes from the same signals so the lab NEVER dead-ends. Nothing is
 * persisted here — wiring a proposal happens via POST /api/systems/[id]/automations.
 */

const suggestSchema = z.object({
  lang: z.enum(['en', 'ar']).optional(),
})

interface Proposal {
  title: string
  trigger: string
  action: string
  why: string
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Deterministic proposals from typed fields — the never-dead-end fallback. */
function fallbackProposals(
  systemName: string,
  fields: ReturnType<typeof extractFields>,
  existing: string[]
): Proposal[] {
  const existingSet = new Set(existing.map(normalize))
  const out: Proposal[] = []
  const push = (p: Proposal) => {
    if (out.length < 3 && !existingSet.has(normalize(p.title))) out.push(p)
  }

  for (const f of fields) {
    if (out.length >= 3) break
    if (f.type === 'date') {
      push({
        title: `Remind owners 2 days before ${f.label}`,
        trigger: `A record's ${f.label} is 2 days away`,
        action: `Send a reminder to the record owner`,
        why: `${f.label} is a tracked date — early nudges prevent missed deadlines in ${systemName}.`,
      })
    } else if (f.type === 'select' && f.options && f.options.length > 1) {
      const last = f.options[f.options.length - 1]
      push({
        title: `Escalate when ${f.label} becomes “${last}”`,
        trigger: `A record's ${f.label} changes to ${last}`,
        action: `Notify the workspace and mark the record urgent`,
        why: `“${last}” is the terminal state of ${f.label} — escalation keeps stuck records visible.`,
      })
    } else if (f.type === 'boolean') {
      push({
        title: `Alert the team when ${f.label} flips to TRUE`,
        trigger: `A record's ${f.label} is set to TRUE`,
        action: `Post an alert to the operations channel`,
        why: `${f.label} is a binary signal — instant alerts turn it into a tripwire.`,
      })
    } else if (f.type === 'number') {
      push({
        title: `Flag records where ${f.label} spikes`,
        trigger: `A record's ${f.label} exceeds twice the current average`,
        action: `Flag the record and notify the owner`,
        why: `Outlier detection on ${f.label} surfaces anomalies before they compound.`,
      })
    }
  }
  if (out.length === 0) {
    push({
      title: `Weekly digest of new activity in ${systemName}`,
      trigger: `Every Monday at 09:00`,
      action: `Summarize the week's new records and send to the workspace`,
      why: `A standing digest keeps the whole team aligned on ${systemName} without checking in.`,
    })
  }
  return out.slice(0, 3)
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const { id } = await ctx.params
    const body: unknown = await req.json().catch(() => ({}))
    const parsed = suggestSchema.safeParse(body ?? {})
    const lang = parsed.success && parsed.data.lang === 'ar' ? 'ar' as const : 'en' as const

    const system = await db.aiSystem.findUnique({
      where: { id },
      select: { id: true, name: true, category: true, description: true, blueprint: true },
    })
    if (!system) return jsonError(404, 'System not found.')

    let blueprint: Record<string, unknown> = {}
    try {
      const p: unknown = JSON.parse(system.blueprint)
      if (p && typeof p === 'object' && !Array.isArray(p)) blueprint = p as Record<string, unknown>
    } catch {
      blueprint = {}
    }
    const existing: string[] = Array.isArray(blueprint.automations)
      ? (blueprint.automations as unknown[]).filter((a): a is string => typeof a === 'string')
      : []
    const fields = extractFields(system.blueprint)

    const recent = await db.systemRecord.findMany({
      where: { systemId: system.id },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { data: true },
    })
    const recentRows = recent
      .map((r) => {
        try {
          return JSON.parse(r.data) as Record<string, unknown>
        } catch {
          return {}
        }
      })
      .slice(0, 3)

    const fieldSpec = fields.length
      ? fields.map((f) => `- ${f.key} (${f.type}${f.options ? `; one of: ${f.options.join(' | ')}` : ''}) — ${f.label}`).join('\n')
      : '(no typed fields)'
    const sampleSpec = recentRows.length
      ? recentRows.map((r, i) => `Row ${i + 1}: ${JSON.stringify(r).slice(0, 300)}`).join('\n')
      : '(no records yet)'

    const raw = await chatJSON(
      `You are an operations-automation architect. You study a mini-app system and propose NEW workflow automations that meaningfully extend it. Reply with STRICT JSON ONLY — no prose, no markdown fences. Shape: {"proposals":[{"title","trigger","action","why"}]}. Rules: each proposal's "title" is one imperative sentence (max 90 chars) suitable as the automation's canonical name; "trigger" states the event (max 90 chars); "action" states the effect (max 90 chars); "why" is one short rationale sentence (max 140 chars). Propose EXACTLY 3, each fundamentally DIFFERENT from the existing automations listed below and from each other. Ground them in the system's real fields and sample records — never invent fields that are not listed.${
        lang === 'ar'
          ? ' LANGUAGE DIRECTIVE: the operator runs the Arabic UI — write title/trigger/action/why in fluent Modern Standard Arabic. Field keys and select option values stay exactly as given.'
          : ''
      }`,
      `System: "${system.name}" — ${system.description}\nCategory: ${system.category}\n\nEXISTING AUTOMATIONS (do NOT repeat these):\n${existing.map((a) => `- ${a}`).join('\n') || '(none)'}\n\nTYPED FIELDS:\n${fieldSpec}\n\nSAMPLE OF LIVE RECORDS:\n${sampleSpec}\n\nSTRICT JSON only.`,
    )

    let source: 'llm' | 'fallback' = 'fallback'
    let proposals: Proposal[] = []
    if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).proposals)) {
      for (const item of (raw as { proposals: unknown[] }).proposals.slice(0, 3)) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue
        const p = item as Record<string, unknown>
        const title = typeof p.title === 'string' ? p.title.trim().slice(0, 140) : ''
        if (!title) continue
        if (existing.some((a) => normalize(a) === normalize(title))) continue
        proposals.push({
          title,
          trigger: typeof p.trigger === 'string' ? p.trigger.trim().slice(0, 140) : '',
          action: typeof p.action === 'string' ? p.action.trim().slice(0, 140) : '',
          why: typeof p.why === 'string' ? p.why.trim().slice(0, 200) : '',
        })
      }
      if (proposals.length > 0) source = 'llm'
    }
    if (proposals.length === 0) {
      proposals = fallbackProposals(system.name, fields, existing)
    }

    return jsonOk({ proposals, source })
  })
}
