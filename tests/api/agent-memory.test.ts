import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { agentMemory: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() } } }));
vi.mock('@/lib/auth', () => ({ requireOwnedOperator: vi.fn() }));

import { db } from '@/lib/db';
import { requireOwnedOperator } from '@/lib/auth';
import { DELETE, GET, PATCH, POST } from '@/app/api/agent/memory/route';

const actor = { id: 'operator-a', name: 'Owner', workspace: 'Company', role: null, accountId: 'account-a' };
const account = { id: 'account-a', email: 'owner@example.com', name: 'Owner' };

describe('/api/agent/memory', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireOwnedOperator as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, user: actor, account });
  });

  it('lists only after the ownership guard and scopes both dimensions', async () => {
    (db.agentMemory.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const response = await GET(new Request('http://localhost/api/agent/memory?userId=operator-a'));
    expect(response.status).toBe(200);
    expect(db.agentMemory.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'account-a', actorId: 'operator-a' } }));
  });

  it('stores only user-confirmed memory in an allowed category', async () => {
    (db.agentMemory.upsert as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'memory-1', key: 'language' });
    const response = await POST(new Request('http://localhost/api/agent/memory', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'operator-a', key: 'language', value: 'Arabic', category: 'preference' }),
    }));
    expect(response.status).toBe(201);
    expect(db.agentMemory.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_actorId_key: { tenantId: 'account-a', actorId: 'operator-a', key: 'language' } },
      create: expect.objectContaining({ tenantId: 'account-a', actorId: 'operator-a', confirmedBy: 'operator-a' }),
    }));
  });

  it('rejects policy-like categories and never calls persistence', async () => {
    const response = await POST(new Request('http://localhost/api/agent/memory', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'operator-a', key: 'tax_rate', value: '15%', category: 'approved_rule' }),
    }));
    expect(response.status).toBe(400);
    expect(db.agentMemory.upsert).not.toHaveBeenCalled();
  });

  it('does not query memory for a workspace rejected by the ownership guard', async () => {
    (requireOwnedOperator as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, res: new Response(null, { status: 403 }) });
    const response = await GET(new Request('http://localhost/api/agent/memory?userId=operator-b'));
    expect(response.status).toBe(403);
    expect(db.agentMemory.findMany).not.toHaveBeenCalled();
  });

  it('updates and forgets only the owner-scoped item id', async () => {
    (db.agentMemory.updateMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (db.agentMemory.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'memory-1', key: 'language', value: 'English' });
    const patched = await PATCH(new Request('http://localhost/api/agent/memory', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'operator-a', memoryId: 'memory-1', value: 'English' }),
    }));
    expect(patched.status).toBe(200);
    expect(db.agentMemory.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'memory-1', tenantId: 'account-a', actorId: 'operator-a' } }));

    (db.agentMemory.deleteMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    const deleted = await DELETE(new Request('http://localhost/api/agent/memory', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'operator-a', memoryId: 'memory-1' }),
    }));
    expect(deleted.status).toBe(200);
    expect(db.agentMemory.deleteMany).toHaveBeenCalledWith({ where: { id: 'memory-1', tenantId: 'account-a', actorId: 'operator-a' } });
  });

  it('rejects an empty memory patch before persistence', async () => {
    const response = await PATCH(new Request('http://localhost/api/agent/memory', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'operator-a', memoryId: 'memory-1' }),
    }));
    expect(response.status).toBe(400);
    expect(db.agentMemory.updateMany).not.toHaveBeenCalled();
  });
});
