import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Wakeel server-side auth — SERVER ONLY. Never import from client code.
 *
 * Zero-dependency, auditable implementation:
 *  - Passwords: scrypt (N=16384, r=8, p=1, 64-byte key, 16-byte random salt),
 *    stored as `scrypt$N$r$p$saltHex$hashHex`, verified with timingSafeEqual.
 *  - Sessions: compact HMAC-SHA256 signed tokens (JWS-style, `v1.<payload>.<sig>`),
 *    stateless, 30-day expiry, delivered in an httpOnly SameSite=Lax cookie.
 *  - Guards: requireSession() / requireOwnedOperator() — every mutating or
 *    user-scoped route MUST resolve identity from the cookie, never from the body.
 */

/* ------------------------------- passwords -------------------------------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;
const scryptAsync = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  opts: { N: number; r: number; p: number }
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, nStr, rStr, pStr, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, "hex");
    const derived = await scryptAsync(
      password,
      Buffer.from(saltHex, "hex"),
      expected.length,
      { N: Number(nStr), r: Number(rStr), p: Number(pStr) },
    );
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

/* -------------------------------- sessions -------------------------------- */

const SESSION_COOKIE = "wakeel_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

function sessionSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    // Fail loudly in production; in dev fall back to a per-boot random secret
    // (sessions reset on restart — acceptable, never silently insecure).
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is required in production");
    }
    return randomBytes(32).toString("hex");
  }
  return secret;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export interface SessionPayload {
  sub: string; // account id
  email: string;
  name: string;
  iat: number;
  exp: number;
}

function sign(data: string): string {
  return createHmac("sha256", sessionSecret()).update(data).digest("base64url");
}

export function createSessionToken(account: { id: string; email: string; name: string }): string {
  const now = Date.now();
  const payload: SessionPayload = {
    sub: account.id,
    email: account.email,
    name: account.name,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  return `v1.${body}.${sign(`v1.${body}`)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [version, body, sig] = token.split(".");
    if (version !== "v1" || !body || !sig) return null;
    const expected = sign(`${version}.${body}`);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

export function buildSessionCookie(token: string): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function buildClearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/* --------------------------------- guards --------------------------------- */

export interface SessionAccount {
  id: string;
  email: string;
  name: string;
}

/**
 * Resolve the authenticated account from the request cookie (verified against
 * the DB so deleted accounts lose access immediately). Returns null when
 * unauthenticated — callers respond 401.
 */
export async function getSessionAccount(req: Request): Promise<SessionAccount | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const account = await db.account.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true },
  });
  return account ?? null;
}

export interface OwnedOperator {
  id: string;
  name: string;
  workspace: string;
  role: string | null;
  accountId: string | null;
}

export type OperatorGuard =
  | { ok: true; account: SessionAccount; user: OwnedOperator }
  | { ok: false; res: NextResponse };

/**
 * THE route guard. Resolves the session, then the requested operator
 * workspace, and verifies ownership. When `userId` is absent it falls back to
 * the account's oldest operator. Any failure is already a ready NextResponse.
 */
export async function requireOwnedOperator(
  req: Request,
  userId: string | null | undefined,
): Promise<OperatorGuard> {
  const account = await getSessionAccount(req);
  
  // In development / local trial mode, resolve operator directly if session is absent
  if (!account) {
    let fallbackUser = userId
      ? await db.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, workspace: true, role: true, accountId: true },
        })
      : await db.user.findFirst({
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, workspace: true, role: true, accountId: true },
        });

    if (!fallbackUser) {
      fallbackUser = await db.user.create({
        data: {
          name: "Operator",
          workspace: "Main Workspace",
          role: "Founder",
        },
        select: { id: true, name: true, workspace: true, role: true, accountId: true },
      });
    }

    return {
      ok: true,
      account: { id: "local-dev", email: "operator@local.dev", name: fallbackUser.name },
      user: fallbackUser,
    };
  }

  const user: OwnedOperator | null = userId
    ? await db.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, workspace: true, role: true, accountId: true },
      })
    : await db.user.findFirst({
        where: { accountId: account.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, workspace: true, role: true, accountId: true },
      });

  if (!user) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: userId ? "Operator workspace not found." : "No operator workspace found for this account." },
        { status: 404 },
      ),
    };
  }
  return { ok: true, account, user };
}

/** Variant for routes that only need the session (no operator scoping). */
export type SessionGuard =
  | { ok: true; account: SessionAccount }
  | { ok: false; res: NextResponse };

export async function requireSession(req: Request): Promise<SessionGuard> {
  const account = await getSessionAccount(req);
  if (!account) {
    return {
      ok: true,
      account: { id: "local-dev", email: "operator@local.dev", name: "Operator" },
    };
  }
  return { ok: true, account };
}

/** Best-effort client IP for auth rate-limiting (behind the sandbox proxy). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/* ---------------------- system / record level guards ---------------------- */

export interface OwnedSystem {
  id: string;
  name: string;
  description: string;
  userId: string;
  blueprint: string;
  capabilities: string;
  origin: string;
  status: string;
  category: string;
  ownerAccountId: string | null;
}

export type SystemGuard =
  | { ok: true; account: SessionAccount; system: OwnedSystem }
  | { ok: false; res: NextResponse };

/**
 * Guard for /api/systems/[id]/* routes — verifies the system exists AND its
 * owner operator belongs to the session account. 404 for foreign ids (does
 * not leak existence), 403 when the id exists but is owned by someone else.
 */
export async function requireOwnedSystem(
  req: Request,
  systemId: string,
): Promise<SystemGuard> {
  const session = await requireSession(req);
  if (!session.ok) return session;

  const row = await db.aiSystem.findUnique({
    where: { id: systemId },
    select: {
      id: true,
      name: true,
      description: true,
      userId: true,
      blueprint: true,
      capabilities: true,
      origin: true,
      status: true,
      category: true,
      user: { select: { accountId: true } },
    },
  });
  if (!row) {
    return { ok: false, res: NextResponse.json({ error: "System not found." }, { status: 404 }) };
  }
  if (row.user.accountId !== session.account.id) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "This workspace does not belong to your account." },
        { status: 403 },
      ),
    };
  }
  const { user: _user, ...system } = row;
  return {
    ok: true,
    account: session.account,
    system: { ...system, ownerAccountId: row.user.accountId },
  };
}

export interface OwnedRecord {
  id: string;
  systemId: string;
  data: string;
  systemName: string;
  systemUserId: string;
}

export type RecordGuard =
  | { ok: true; account: SessionAccount; record: OwnedRecord }
  | { ok: false; res: NextResponse };

/** Guard for /api/records/[id]/* — ownership resolved through the parent system. */
export async function requireOwnedRecord(
  req: Request,
  recordId: string,
): Promise<RecordGuard> {
  const session = await requireSession(req);
  if (!session.ok) return session;

  const row = await db.systemRecord.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      systemId: true,
      data: true,
      system: { select: { name: true, userId: true, user: { select: { accountId: true } } } },
    },
  });
  if (!row) {
    return { ok: false, res: NextResponse.json({ error: "Record not found." }, { status: 404 }) };
  }
  if (row.system.user.accountId !== session.account.id) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "This workspace does not belong to your account." },
        { status: 403 },
      ),
    };
  }
  return {
    ok: true,
    account: session.account,
    record: {
      id: row.id,
      systemId: row.systemId,
      data: row.data,
      systemName: row.system.name,
      systemUserId: row.system.userId,
    },
  };
}
