import { z } from 'zod'
import { db } from '@/lib/db'
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http'
import { requireSession } from '@/lib/auth'

const createUserSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(80),
  workspace: z.string().trim().min(1, 'workspace is required').max(80),
  role: z.string().trim().max(80).optional(),
})

/** POST /api/users — create an operator profile owned by the session account. */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const guard = await requireSession(req)
    if (!guard.ok) return guard.res

    const body: unknown = await req.json().catch(() => null)
    const parsed = createUserSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, 'Invalid input: name and workspace are required (max 80 chars each).')
    }
    const user = await db.user.create({
      data: {
        accountId: guard.account.id,
        name: parsed.data.name,
        workspace: parsed.data.workspace,
        role: parsed.data.role ?? null,
      },
    })
    return jsonOk({ user }, 201)
  })
}
