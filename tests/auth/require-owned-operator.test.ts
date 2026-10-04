import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for docs/implementation/00-repo-audit.md §5.1 and §5.2.
 *
 * §5.1 — requireOwnedOperator() fetched a client-supplied `userId` by id with
 *        no check that it belonged to the authenticated account whenever a
 *        session was present. Any authenticated account could read/mutate
 *        any other account's operator workspace by passing its id.
 * §5.2 — the "no session" fallback silently impersonated an arbitrary
 *        pre-existing operator with no environment gate at all.
 *
 * `@/lib/db` is mocked because Prisma's query-engine binary cannot be
 * downloaded in this sandbox (see docs/implementation/00-repo-audit.md §4.5/
 * §6.1) — these are deterministic unit tests of the guard's decision logic,
 * not an integration test against a real database.
 */

vi.mock('@/lib/db', () => ({
  db: {
    account: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  },
}));

import { db } from '@/lib/db';
import { createSessionToken, requireOwnedOperator, requireSession } from '@/lib/auth';

const ACCOUNT_A = { id: 'acct-a', email: 'alice@example.com', name: 'Alice' };
const ACCOUNT_B = { id: 'acct-b', email: 'bob@example.com', name: 'Bob' };

function requestWithSessionFor(account: { id: string; email: string; name: string }): Request {
  const token = createSessionToken(account);
  return new Request('http://localhost/api/activity', {
    headers: { cookie: `wakeel_session=${token}` },
  });
}

describe('requireOwnedOperator — cross-tenant isolation (§5.1)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects a userId that belongs to a different account with 403, not silent access', async () => {
    (db.account.findUnique as any).mockResolvedValue(ACCOUNT_A);
    (db.user.findUnique as any).mockResolvedValue({
      id: 'user-b-workspace',
      name: 'Bob Workspace',
      workspace: 'Bob Co',
      role: null,
      accountId: ACCOUNT_B.id, // <-- owned by a different account than the caller
    });

    const req = requestWithSessionFor(ACCOUNT_A);
    const guard = await requireOwnedOperator(req, 'user-b-workspace');

    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.res.status).toBe(403);
    }
  });

  it('allows a userId that belongs to the authenticated account', async () => {
    (db.account.findUnique as any).mockResolvedValue(ACCOUNT_A);
    (db.user.findUnique as any).mockResolvedValue({
      id: 'user-a-workspace',
      name: 'Alice Workspace',
      workspace: 'Alice Co',
      role: null,
      accountId: ACCOUNT_A.id,
    });

    const req = requestWithSessionFor(ACCOUNT_A);
    const guard = await requireOwnedOperator(req, 'user-a-workspace');

    expect(guard.ok).toBe(true);
    if (guard.ok) {
      expect(guard.user.id).toBe('user-a-workspace');
      expect(guard.account.id).toBe(ACCOUNT_A.id);
    }
  });

  it('still 404s for a userId that does not exist at all (distinct from the 403 case)', async () => {
    (db.account.findUnique as any).mockResolvedValue(ACCOUNT_A);
    (db.user.findUnique as any).mockResolvedValue(null);

    const req = requestWithSessionFor(ACCOUNT_A);
    const guard = await requireOwnedOperator(req, 'does-not-exist');

    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.res.status).toBe(404);
    }
  });
});

describe('unauthenticated fallback gating (§5.2)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects with 401 in production when the trial flag is not set (no silent impersonation)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    (db.account.findUnique as any).mockResolvedValue(null);

    const req = new Request('http://localhost/api/activity'); // no cookie at all
    const guard = await requireOwnedOperator(req, 'some-user-id');

    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.res.status).toBe(401);
    // and the db must never have been asked to fabricate/find an operator
    expect((db.user.findUnique as any)).not.toHaveBeenCalled();
    expect((db.user.create as any)).not.toHaveBeenCalled();
  });

  it('requireSession also rejects with 401 in production when the trial flag is not set', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    (db.account.findUnique as any).mockResolvedValue(null);

    const req = new Request('http://localhost/api/systems/abc');
    const guard = await requireSession(req);

    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.res.status).toBe(401);
  });

  it('still allows the trial fallback in production when explicitly opted in', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WAKEEL_ALLOW_UNAUTHENTICATED_TRIAL', 'true');
    (db.account.findUnique as any).mockResolvedValue(null);
    (db.user.findFirst as any).mockResolvedValue({
      id: 'trial-user',
      name: 'Trial Operator',
      workspace: 'Trial Co',
      role: null,
      accountId: null,
    });

    const req = new Request('http://localhost/api/activity');
    const guard = await requireOwnedOperator(req, undefined);

    expect(guard.ok).toBe(true);
  });
});
