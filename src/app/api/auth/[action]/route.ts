import { z } from "zod";
import { db } from "@/lib/db";
import { handleRoute, jsonError, jsonOk } from "@/lib/wakeel/http";
import {
  buildSessionCookie,
  buildClearSessionCookie,
  clientIp,
  createSessionToken,
  getSessionAccount,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Wakeel credential auth surface.
 *   POST /api/auth/register — create an account (email+password) + session
 *   POST /api/auth/login    — verify credentials + session
 *   POST /api/auth/logout   — clear the session cookie
 *   GET  /api/auth/me       — current account + its operator workspaces
 *
 * Both mutations are IP-rate-limited (brute-force guard) and normalize errors
 * so they never leak whether an email exists.
 */

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("valid email required").max(254),
  password: z.string().min(8, "password must be at least 8 characters").max(128),
  name: z.string().trim().min(1, "name is required").max(80),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("valid email required").max(254),
  password: z.string().min(1, "password is required").max(128),
});

const GENERIC_LOGIN_ERROR =
  "Incorrect email or password. Please try again.";

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  return handleRoute(async () => {
    const { action } = await ctx.params;

    if (action === "register") {
      const rl = rateLimit(`register:${clientIp(req)}`, LIMITS.authRegister);
      if (!rl.ok) return tooManyRequests(rl, "Too many sign-up attempts. Try again later.");

      const body: unknown = await req.json().catch(() => null);
      const parsed = registerSchema.safeParse(body);
      if (!parsed.success) {
        return jsonError(400, "Invalid input: name, a valid email and a password of at least 8 characters are required.");
      }
      const { email, password, name } = parsed.data;

      const existing = await db.account.findUnique({ where: { email }, select: { id: true } });
      if (existing) {
        return jsonError(409, "An account with this email already exists. Try signing in instead.");
      }

      const account = await db.account.create({
        data: { email, name, passwordHash: await hashPassword(password) },
      });

      const res = jsonOk(
        { account: { id: account.id, email: account.email, name: account.name } },
        201,
      );
      res.headers.append("Set-Cookie", buildSessionCookie(createSessionToken(account)));
      return res;
    }

    if (action === "login") {
      const rl = rateLimit(`login:${clientIp(req)}`, LIMITS.authLogin);
      if (!rl.ok) return tooManyRequests(rl, "Too many sign-in attempts. Try again in a few minutes.");

      const body: unknown = await req.json().catch(() => null);
      const parsed = loginSchema.safeParse(body);
      if (!parsed.success) return jsonError(400, GENERIC_LOGIN_ERROR);
      const { email, password } = parsed.data;

      const account = await db.account.findUnique({ where: { email } });
      // Constant-shape verification path: always run a hash comparison,
      // whether or not the account exists (no user-enumeration timing leak).
      const ok = account
        ? await verifyPassword(password, account.passwordHash)
        : await verifyPassword(password, "scrypt$16384$8$1$00$00");
      if (!account || !ok) return jsonError(401, GENERIC_LOGIN_ERROR);

      await db.account.update({
        where: { id: account.id },
        data: { lastLoginAt: new Date() },
      });

      const res = jsonOk({
        account: { id: account.id, email: account.email, name: account.name },
      });
      res.headers.append("Set-Cookie", buildSessionCookie(createSessionToken(account)));
      return res;
    }

    if (action === "logout") {
      const res = jsonOk({ ok: true });
      res.headers.append("Set-Cookie", buildClearSessionCookie());
      return res;
    }

    return jsonError(404, "Unknown auth action.");
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ action: string }> }) {
  return handleRoute(async () => {
    const { action } = await ctx.params;
    if (action !== "me") return jsonError(404, "Unknown auth action.");

    const account = await getSessionAccount(req);
    if (!account) return jsonError(401, "Not signed in.");

    const operators = await db.user.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, workspace: true, role: true, createdAt: true },
    });

    return jsonOk({ account, operators });
  });
}
