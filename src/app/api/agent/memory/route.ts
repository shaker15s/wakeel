import { z } from 'zod'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'
import { requireOwnedOperator } from '@/lib/auth'
import { LIMITS, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { MemoryStore } from '@/server/agent/memory-store'

const memorySchema = z.object({
  action: z.enum(['remember', 'forget', 'list', 'update']),
  userId: z.string().trim().min(1, 'userId is required'),
  actorId: z.string().trim().min(1, 'actorId is required').optional(),
  key: z.string().trim().min(1, 'key is required').optional(),
  value: z.string().optional(),
  category: z.enum(['preference', 'confirmed_work_context']).optional(),
})

/** GET /api/agent/memory?userId= — list memory items for a tenant. */
export async function GET(req: Request) {
  return handleRoute(async () => {
    const userId = new URL(req.url).searchParams.get('userId')
    if (!userId) return jsonError(400, 'userId query parameter is required.')

    const guard = await requireOwnedOperator(req, userId)
    if (!guard.ok) return guard.res

    const rl = rateLimit(`memory:${guard.account.id}`, LIMITS.llmChat)
    if (!rl.ok) return tooManyRequests(rl, 'Memory rate limit reached.')

    const actorId = guard.user.id
    const store = new MemoryStore('/tmp/wakeel-memory.db')
    const items = await store.list(guard.user.id, actorId)

    return jsonOk({ items })
  })
}

/** POST /api/agent/memory — remember/update/forget memory items. */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const body = await req.json()
    const parsed = memorySchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'Invalid input: action, userId, and key are required.')
    }

    const { action, userId, actorId, key, value, category } = parsed.data
    const guard = await requireOwnedOperator(req, userId)
    if (!guard.ok) return guard.res

    const rl = rateLimit(`memory:${guard.account.id}`, LIMITS.llmChat)
    if (!rl.ok) return tooManyRequests(rl, 'Memory rate limit reached.')

    const actorIdValue = actorId || guard.user.id
    const store = new MemoryStore('/tmp/wakeel-memory.db')

    switch (action) {
      case 'remember': {
        if (!key) return jsonError(400, 'key is required for remember action.')
        const item = await store.remember(guard.user.id, actorIdValue, {
          key,
          value: value || '',
          category: category || 'preference',
        })
        return jsonOk(item, 201)
      }

      case 'update': {
        if (!key || !memoryId) {
          return jsonError(400, 'key and memoryId are required for update action.')
        }
        const item = await store.update(guard.user.id, actorIdValue, memoryId, {
          value,
          category,
        })
        return jsonOk(item)
      }

      case 'forget': {
        if (!key && !memoryId) {
          return jsonError(400, 'key or memoryId is required for forget action.')
        }
        await store.forget(guard.user.id, actorIdValue, key || memoryId)
        return jsonOk({ success: true })
      }

      case 'list': {
        const items = await store.list(guard.user.id, actorIdValue)
        return jsonOk({ items })
      }

      default:
        return jsonError(400, `Unknown action: ${action}`)
    }
  })
}