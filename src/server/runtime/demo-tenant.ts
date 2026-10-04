export const DEMO_TENANT_HEADER = 'x-demo-tenant-id';

/**
 * Resolves the anonymous demo tenant id from a request header, NOT a
 * cookie. This is deliberate: Arena's live preview renders this app inside
 * a third-party iframe (a different top-level site than the one serving
 * it), and browsers increasingly block or partition cookies set by
 * documents running in a third-party iframe context (Safari ITP, Firefox
 * ETP, Chrome's third-party cookie deprecation) — which silently breaks any
 * cookie-based session the moment it's embedded that way. A header set
 * explicitly by client-side JS has no such restriction: it isn't "storage"
 * the browser can partition or block, it's just a value the page already
 * holds in memory.
 *
 * This is NOT the real app's auth system (`src/lib/auth.ts`) and must never
 * be used for anything beyond `/api/demo/*` — the client fully controls
 * this value, which is fine here (no real data, no real credentials) but
 * would never be an acceptable trust boundary for the authenticated app.
 */
export function readDemoTenantId(req: Request): string | null {
  const header = req.headers.get(DEMO_TENANT_HEADER);
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed || trimmed.length > 100) return null;
  return trimmed;
}
