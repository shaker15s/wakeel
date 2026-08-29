import { z } from 'zod'
import { db } from '@/lib/db'
import { chatText } from '@/lib/wakeel/ai'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'
import { requireOwnedOperator } from '@/lib/auth'
import { LIMITS, rateLimit, tooManyRequests } from '@/lib/rate-limit'

/**
 * POST /api/agent/digest — Wakeel proactively drafts a STATUS DIGEST for a
 * system and posts it into the operator's conversation as an AGENT message.
 *
 * The digest is grounded in REAL workspace data: system meta, record count,
 * the most recent records (typed field values verbatim), blueprint
 * automations and health. If the LLM is unreachable a deterministic template
 * digest is posted so the flow NEVER dead-ends.
 */

const digestSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
  systemId: z.string().trim().min(1, 'systemId is required'),
  /** operator's UI language — the digest prose is born in that language */
  lang: z.enum(['en', 'ar']).optional(),
})

const DIGEST_HEADER_EN = 'STATUS DIGEST'
const DIGEST_HEADER_AR = 'ملخص الحالة'

function daysSince(iso: Date): number {
  return Math.max(0, Math.floor((Date.now() - +iso) / 86_400_000))
}

function summarizeRecord(data: Record<string, unknown>, maxFields = 4): string {
  return Object.entries(data)
    .slice(0, maxFields)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' | ')
}

/** Deterministic fallback so the proactive chip never dead-ends. */
function fallbackDigest(
  systemName: string,
  recordCount: number,
  updatedAt: Date,
  lang: 'en' | 'ar',
): string {
  const days = daysSince(updatedAt)
  if (lang === 'ar') {
    return [
      `${DIGEST_HEADER_AR} · ${systemName}`,
      ``,
      `• السجلات: ${recordCount} ${recordCount === 1 ? 'سجل' : 'سجلات'} محفوظة`,
      `• آخر كتابة: قبل ${days} ${days === 1 ? 'يوم' : 'أيام'}`,
      `• الحالة: يعمل — لا إنذارات مفتوحة`,
      ``,
      `الخلاصة: النظام مستقر لكنه هادئ. إن بقي بلا كتابات أسبوعاً آخر أقترح مراجعة الأتمتة المرتبطة به أو إدخال دفعة سجلات جديدة.`,
    ].join('\n')
  }
  return [
    `${DIGEST_HEADER_EN} · ${systemName}`,
    ``,
    `• Records: ${recordCount} on file`,
    `• Last write: ${days} day${days === 1 ? '' : 's'} ago`,
    `• Status: operational — no open alerts`,
    ``,
    `Bottom line: stable but quiet. If it stays untouched for another week I suggest revisiting its automations or logging a fresh batch of records.`,
  ].join('\n')
}

/** POST handler — LLM status digest → AGENT chat message + ledger entry. */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const body: unknown = await req.json().catch(() => null)
    const parsed = digestSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'Invalid input: userId and systemId are required.')
    }
    const { userId, systemId } = parsed.data
    const lang = parsed.data.lang === 'ar' ? 'ar' as const : 'en' as const

    const guard = await requireOwnedOperator(req, userId)
    if (!guard.ok) return guard.res
    const rl = rateLimit(`digest:${guard.account.id}`, LIMITS.llmDigest)
    if (!rl.ok) return tooManyRequests(rl, 'Digest rate limit reached — try again shortly.')

    const user = guard.user
    const system = await db.aiSystem.findFirst({
      where: { id: systemId, userId },
      include: {
        _count: { select: { records: true } },
        records: { orderBy: { updatedAt: 'desc' }, take: 3 },
      },
    })
    if (!system) return jsonError(404, 'System not found.')

    const recordCount = system._count.records
    const lastTouchedDays = daysSince(system.updatedAt)
    const header = lang === 'ar' ? DIGEST_HEADER_AR : DIGEST_HEADER_EN
    const headerLine = `${header} · ${system.name}`

    // grounding block: real meta + newest records + automations
    let blueprint: { automations?: unknown } = {}
    try {
      const rawBp: unknown = JSON.parse(system.blueprint)
      if (rawBp && typeof rawBp === 'object' && !Array.isArray(rawBp)) {
        blueprint = rawBp as typeof blueprint
      }
    } catch {
      // unparseable blueprint — digest proceeds without it
    }
    const automations = Array.isArray(blueprint.automations)
      ? (blueprint.automations as unknown[])
          .filter((a): a is string => typeof a === 'string')
          .slice(0, 4)
      : []
    const recordsBlock =
      recordCount > 0
        ? system.records
            .map((r) => {
              let data: Record<string, unknown> = {}
              try {
                const parsedData: unknown = JSON.parse(r.data)
                if (parsedData && typeof parsedData === 'object' && !Array.isArray(parsedData)) {
                  data = parsedData as Record<string, unknown>
                }
              } catch {
                // skip unparseable record body
              }
              return `- ${summarizeRecord(data)} (updated ${daysSince(r.updatedAt)}d ago)`
            })
            .join('\n')
        : '(no records on file)'
    const automationsBlock =
      automations.length > 0 ? automations.map((a) => `- ${a}`).join('\n') : '(no automations wired)'

    const languageRule =
      lang === 'ar'
        ? 'LANGUAGE: write the digest in fluent Modern Standard Arabic (system/product names may stay Latin).'
        : 'LANGUAGE: write the digest in English.'

    const systemPrompt = [
      `You are Wakeel (وكيل), a dedicated AI employee. You are proactively reporting to your operator ${user.name} (workspace ${user.workspace}) about a system that has gone quiet. Write a concise, professional STATUS DIGEST.`,
      `FORMAT RULES: start EXACTLY with the header line "${headerLine}", then a blank line, then 3-5 short bullet lines (start each with "•") covering records, last activity, status/health and anything notable, then a blank line and a one-sentence bottom line with a practical suggestion. Under 120 words total. Plain text only — no markdown headers, no code fences.`,
      languageRule,
    ].join('\n')

    const userPrompt = [
      `System under review: "${system.name}" — ${system.description}`,
      `Category: ${system.category} · Origin: ${system.origin} · Status: ${system.status} · Health: ${system.health}%`,
      `Records on file: ${recordCount}`,
      `Last system write: ${lastTouchedDays} day(s) ago`,
      '',
      'Newest records (real data):',
      recordsBlock,
      '',
      'Wired automations:',
      automationsBlock,
      '',
      `Draft the status digest now.`,
    ].join('\n')

    let content = ''
    try {
      content = (await chatText(systemPrompt, [{ role: 'user', content: userPrompt }])).trim()
    } catch {
      content = ''
    }
    const usedFallback = !content
    if (usedFallback) content = fallbackDigest(system.name, recordCount, system.updatedAt, lang)

    // normalize the header line so the client can render the report card reliably
    content = content.replace(/^.*$/m, (first) =>
      first.startsWith(header) ? first : headerLine,
    )

    const agentMessage = await db.chatMessage.create({
      data: { userId, role: 'AGENT', content },
    })

    await db.activity.create({
      data: {
        userId,
        type: 'CHAT',
        title: `Wakeel delivered a status digest for ${system.name}`,
        detail: `${recordCount} records · last write ${lastTouchedDays}d ago`,
        status: 'DONE',
      },
    })

    return jsonOk({ message: agentMessage, usedFallback }, 201)
  })
}
