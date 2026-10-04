import { beforeEach, describe, expect, it, vi } from 'vitest';

// src/lib/auth.ts imports `db` at module scope; mock it so this file doesn't
// need a generated Prisma client (unavailable in this sandbox — see
// docs/implementation/00-repo-audit.md §4.5/§6.1). These tests never touch
// the database.
vi.mock('@/lib/db', () => ({
  db: {
    account: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  },
}));

import { createSessionToken, verifySessionToken } from '@/lib/auth';

/**
 * Regression test: sessionSecret() used to call randomBytes() fresh on every
 * invocation when AUTH_SECRET was unset, instead of caching one secret for
 * the process lifetime. That meant createSessionToken() and a later
 * verifySessionToken() call signed/verified with two different random
 * secrets, so a freshly issued session token NEVER verified successfully —
 * every authenticated request silently looked unauthenticated.
 * See docs/implementation/00-repo-audit.md.
 */
describe('session token sign/verify roundtrip without AUTH_SECRET set', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('AUTH_SECRET', '');
    vi.stubEnv('NODE_ENV', 'test'); // not "production" — exercises the dev fallback secret
  });

  it('a token created in this process verifies successfully in the same process', () => {
    const account = { id: 'acct-1', email: 'a@example.com', name: 'A' };
    const token = createSessionToken(account);
    const payload = verifySessionToken(token);

    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('acct-1');
  });

  it('two tokens created back-to-back both verify (secret is stable per process, not per call)', () => {
    const account = { id: 'acct-2', email: 'b@example.com', name: 'B' };
    const tokenOne = createSessionToken(account);
    const tokenTwo = createSessionToken(account);

    expect(verifySessionToken(tokenOne)).not.toBeNull();
    expect(verifySessionToken(tokenTwo)).not.toBeNull();
  });
});
