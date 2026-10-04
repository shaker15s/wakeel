import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { DEMO_TENANT_COOKIE } from './demo-store';

/**
 * Resolves an anonymous, cookie-scoped tenant id for the no-login demo
 * surface. This is NOT the real app's auth system (`src/lib/auth.ts`) and
 * must never be used for anything beyond `/api/demo/*` — it exists purely so
 * the demo can show the runtime's real tenant-isolation behavior (one
 * browser's demo tasks are invisible to another) without requiring a
 * database-backed account.
 */
export function readDemoTenantId(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${DEMO_TENANT_COOKIE}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.slice(DEMO_TENANT_COOKIE.length + 1));
  return value || null;
}

/** Ensures the response carries a demo tenant cookie, minting one if needed. Returns the tenant id used. */
export function ensureDemoTenantCookie(req: Request, res: NextResponse): string {
  const existing = readDemoTenantId(req);
  if (existing) return existing;
  const tenantId = `demo-${randomUUID()}`;
  res.cookies.set(DEMO_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days — a demo session, not a real account
  });
  return tenantId;
}
