import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'
import { requireOwnedOperator } from '@/lib/auth'
import { LIMITS, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { AgentRuntime } from '@/server/agent/runtime'
import { Odoo19Connector } from '@/server/erp/odoo-connector'

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

    // Last 10 messages (ascending) become the conversation so far.
    const history = await db.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    history.reverse()

    // NOTE (milestone-0 fix, 2026-10-04): this route previously failed to parse —
    // a partial edit had pasted the ERP-connector-loading block below *inside* the
    // array literal for an old, now-superseded inline system-prompt string. That
    // dead inline prompt (and the systems/activity "grounding" text it built) has
    // been removed rather than guessed back into existence; AgentRuntime.run()
    // builds its own system prompt today and does not yet receive the operator's
    // full systems/activity list. Restoring richer workspace grounding inside
    // AgentRuntime is a real, tracked gap — see docs/implementation/00-repo-audit.md
    // — not a silent regression introduced by this fix.

    // Load active Odoo connection if available
    const erpSystem = await db.aiSystem.findFirst({
      where: { userId: guard.user.id, category: 'ERP', status: 'ACTIVE' },
    });

    let connector: Odoo19Connector | null = null;
    if (erpSystem) {
      try {
        const config = JSON.parse(erpSystem.blueprint);
        if (config.url && config.db && config.username) {
          connector = new Odoo19Connector({
            url: config.url,
            db: config.db,
            username: config.username,
            apiKeyOrPassword: config.apiKeyOrPassword,
            operatorId: guard.user.id,
          });
        }
      } catch {
        // Fallback gracefully
      }
    }

    // Save the user's message
    await db.chatMessage.create({ data: { userId, role: 'USER', content: message } });

    // Execute through AgentRuntime
    const runtimeResult = await AgentRuntime.run(
      message,
      history.map((m) => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content,
      })),
      {
        operatorId: guard.user.id,
        operatorName: user.name,
        workspaceName: user.workspace,
        lang: sessionLang,
        connector,
      }
    );

    const agentMessage = await db.chatMessage.create({
      data: {
        userId,
        role: 'AGENT',
        content: runtimeResult.reply || AGENT_FALLBACK_REPLY,
      },
    });

    await db.activity.create({
      data: {
        userId,
        type: 'CHAT',
        title: `Wakeel handled request for ${user.name}`,
        detail: message.slice(0, 200),
        status: 'DONE',
      },
    });

    const messages = await db.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    messages.reverse();

    return jsonOk(
      {
        reply: agentMessage.content,
        messageId: agentMessage.id,
        messages,
        approvalCard: runtimeResult.approvalCard,
      },
      201
    );
  });
}
