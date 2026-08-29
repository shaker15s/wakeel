import { z } from 'zod'
import { db } from '@/lib/db'
import { chatText, type ChatTurn } from '@/lib/wakeel/ai'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'
import { requireOwnedOperator } from '@/lib/auth'
import { LIMITS, rateLimit, tooManyRequests } from '@/lib/rate-limit'

const chatSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
  message: z.string().trim().min(1, 'message is required').max(2000),
  /** operator's UI language — the tiebreaker when the message language is ambiguous */
  lang: z.enum(['en', 'ar']).optional(),
})

const AGENT_FALLBACK_REPLY =
  'Apologies — my reasoning core flickered out mid-thought. Give me a moment and ask again; in the meantime, all your systems remain under watch.'

/** GET /api/agent/chat?userId= — conversation history, last 50, ascending (owner-only). */
export async function GET(req: Request) {
  return handleRoute(async () => {
    const userId = new URL(req.url).searchParams.get('userId')
    if (!userId) return jsonError(400, 'userId query parameter is required.')

    const guard = await requireOwnedOperator(req, userId)
    if (!guard.ok) return guard.res

    const messages = await db.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    messages.reverse() // ascending for chat rendering
    return jsonOk({ messages })
  })
}

/** POST /api/agent/chat — Wakeel answers with live workspace context. */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const body: unknown = await req.json().catch(() => null)
    const parsed = chatSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'Invalid input: userId and message are required (message max 2000 chars).')
    }
    const { userId, message } = parsed.data
    const sessionLang = parsed.data.lang === 'ar' ? 'ar' : 'en'

    const guard = await requireOwnedOperator(req, userId)
    if (!guard.ok) return guard.res
    const rl = rateLimit(`chat:${guard.account.id}`, LIMITS.llmChat)
    if (!rl.ok) return tooManyRequests(rl, 'Chat rate limit reached — give Wakeel a moment.')

    const user = guard.user

    // Build live workspace context: systems + last 8 activities.
    const systems = await db.aiSystem.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 12,
      select: {
        name: true,
        category: true,
        status: true,
        _count: { select: { records: true } },
      },
    })
    const activities = await db.activity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 8,
    })
    // Last 10 messages (ascending) become the conversation so far.
    const history = await db.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    history.reverse()

    const systemsBlock =
      systems.length > 0
        ? systems
            .map((s) => `- ${s.name} (${s.category}, ${s.status.toLowerCase()}, ${s._count.records} records)`)
            .join('\n')
        : '(no systems yet — the workspace is empty)'
    const activityBlock =
      activities.length > 0
        ? activities.map((a) => `- [${a.type}] ${a.title}`).join('\n')
        : '(no recent activity)'

    const systemPrompt = [
      `You are Wakeel (وكيل), a dedicated AI employee working for ${user.name} in workspace ${user.workspace}. You are professional, proactive, warm, slightly formal, obsessed with operations. You refer to the user's actual systems by name. Keep replies under 120 words. If asked to do something you cannot do with current tools, say exactly what you would need and suggest which system handles it.`,
      `GROUNDING RULE: answer from the LIVE WORKSPACE CONTEXT below whenever it is relevant. If the context does not contain the answer, say plainly that you don't have that information yet and suggest a concrete next step (run a discovery, forge a system, open a record). Never invent system names, numbers or records that are not in the context.`,
      `LANGUAGE RULE (hard requirement, violating it is a defect): reply in the SAME language AND script as the operator's latest message. Arabic message → natural Modern Standard Arabic (system/product names may stay in Latin script). English message → English. If the message is ambiguous or mixed, fall back to the SESSION LANGUAGE: ${sessionLang.toUpperCase()}. NEVER reply in a different script than the operator's message.`,
      '',
      '--- LIVE WORKSPACE CONTEXT ---',
      `Systems you manage for ${user.name}:`,
      systemsBlock,
      '',
      'Recent ops ledger:',
      activityBlock,
    ].join('\n')

    const turns: ChatTurn[] = history.map((m) => ({
      role: m.role === 'USER' ? 'user' : 'assistant',
      content: m.content,
    }))
    turns.push({ role: 'user', content: message })

    // Save the user's message before generating the reply.
    await db.chatMessage.create({ data: { userId, role: 'USER', content: message } })

    const reply = await chatText(systemPrompt, turns)

    const agentMessage = await db.chatMessage.create({
      data: { userId, role: 'AGENT', content: reply || AGENT_FALLBACK_REPLY },
    })

    await db.activity.create({
      data: {
        userId,
        type: 'CHAT',
        title: `Wakeel handled a request for ${user.name}`,
        detail: message.slice(0, 200),
        status: 'DONE',
      },
    })

    const messages = await db.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    messages.reverse()

    return jsonOk({ reply: agentMessage.content, messageId: agentMessage.id, messages }, 201)
  })
}
