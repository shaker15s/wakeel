import { z } from 'zod';
import { db } from '@/lib/db';
import { requireOwnedOperator } from '@/lib/auth';
import { handleRoute, jsonError, jsonOk } from '@/lib/wakeel/http';
import { LIMITS, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { memoryCategorySchema, memoryInputSchema, PrismaMemoryStore } from '@/server/agent/memory-store';

const store = new PrismaMemoryStore(db);

async function authorize(req: Request, userId: string | null | undefined) {
  if (!userId) return { ok: false as const, response: jsonError(400, 'userId is required.') };
  const guard = await requireOwnedOperator(req, userId);
  if (!guard.ok) return { ok: false as const, response: guard.res };
  const limit = rateLimit(`memory:${guard.account.id}`, LIMITS.llmChat);
  if (!limit.ok) return { ok: false as const, response: tooManyRequests(limit, 'Memory update limit reached.') };
  return { ok: true as const, guard };
}

const bodyBase = z.object({ userId: z.string().trim().min(1) }).strict();
const rememberSchema = bodyBase.extend(memoryInputSchema.shape).strict();
const patchSchema = bodyBase.extend({
  memoryId: z.string().trim().min(1),
  key: memoryInputSchema.shape.key.optional(),
  value: memoryInputSchema.shape.value.optional(),
  category: memoryCategorySchema.optional(),
}).strict().refine(
  ({ key, value, category }) => key !== undefined || value !== undefined || category !== undefined,
  'At least one memory field is required.',
);
const forgetSchema = bodyBase.extend({ memoryId: z.string().trim().min(1) }).strict();

/** GET /api/agent/memory?userId= — operator-confirmed notes only. */
export async function GET(req: Request) {
  return handleRoute(async () => {
    const userId = new URL(req.url).searchParams.get('userId');
    const auth = await authorize(req, userId);
    if (!auth.ok) return auth.response;
    const items = await store.list(auth.guard.account.id, auth.guard.user.id);
    return jsonOk({ items });
  });
}

/** POST /api/agent/memory — explicit save/update; model output cannot call this route. */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const body: unknown = await req.json().catch(() => null);
    const parsed = rememberSchema.safeParse(body);
    if (!parsed.success) return jsonError(400, 'Provide a valid key, value, and memory category.');
    const auth = await authorize(req, parsed.data.userId);
    if (!auth.ok) return auth.response;
    const saved = await store.remember(auth.guard.account.id, auth.guard.user.id, {
      key: parsed.data.key, value: parsed.data.value, category: parsed.data.category,
    });
    return jsonOk({ item: saved }, 201);
  });
}

/** PATCH /api/agent/memory — edit one operator-owned item. */
export async function PATCH(req: Request) {
  return handleRoute(async () => {
    const body: unknown = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return jsonError(400, 'Provide a memoryId and at least one valid memory field.');
    const auth = await authorize(req, parsed.data.userId);
    if (!auth.ok) return auth.response;
    const memoryId = parsed.data.memoryId;
    try {
      return jsonOk({ item: await store.update(auth.guard.account.id, auth.guard.user.id, memoryId, {
        ...(parsed.data.key === undefined ? {} : { key: parsed.data.key }),
        ...(parsed.data.value === undefined ? {} : { value: parsed.data.value }),
        ...(parsed.data.category === undefined ? {} : { category: parsed.data.category }),
      }) });
    } catch {
      return jsonError(404, 'Memory item not found in this workspace.');
    }
  });
}

/** DELETE /api/agent/memory — forget one operator-owned item. */
export async function DELETE(req: Request) {
  return handleRoute(async () => {
    const body: unknown = await req.json().catch(() => null);
    const parsed = forgetSchema.safeParse(body);
    if (!parsed.success) return jsonError(400, 'Provide a valid memoryId.');
    const auth = await authorize(req, parsed.data.userId);
    if (!auth.ok) return auth.response;
    await store.forget(auth.guard.account.id, auth.guard.user.id, parsed.data.memoryId);
    return jsonOk({ ok: true });
  });
}
