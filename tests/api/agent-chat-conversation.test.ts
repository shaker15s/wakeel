import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    agentConversation: { upsert: vi.fn() },
    agentMemory: { findMany: vi.fn() },
    chatMessage: { findMany: vi.fn(), create: vi.fn() },
    aiSystem: { findFirst: vi.fn() },
    activity: { create: vi.fn() },
  },
}));
vi.mock('@/lib/auth', () => ({ requireOwnedOperator: vi.fn() }));
vi.mock('@/server/agent/runtime', () => ({ AgentRuntime: { run: vi.fn() } }));

import { db } from '@/lib/db';
import { requireOwnedOperator } from '@/lib/auth';
import { AgentRuntime } from '@/server/agent/runtime';
import { GET, POST } from '@/app/api/agent/chat/route';

const account = { id: 'tenant-a', name: 'Owner', email: 'owner@example.test' };
const user = { id: 'operator-a', accountId: 'tenant-a', name: 'Owner', workspace: 'Company', role: null };
const conversation = { id: 'conversation-a' };

describe('/api/agent/chat conversation persistence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (requireOwnedOperator as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, account, user });
    (db.agentConversation.upsert as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(conversation);
    (db.agentMemory.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'm1', key: 'report_language', value: 'Arabic', category: 'preference' }]);
    (db.aiSystem.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.activity.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (AgentRuntime.run as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      reply: 'Verified response.', executedTools: [], status: 'answered', taskIds: [], evidence: [],
    });
  });

  it('returns this operator conversation and includes only that actor legacy history', async () => {
    (db.chatMessage.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'old-message', role: 'USER', userId: user.id }]);
    const response = await GET(new Request('http://localhost/api/agent/chat?userId=operator-a'));
    const body = await response.json();

    expect(body.conversationId).toBe(conversation.id);
    expect(db.agentConversation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_actorId: { tenantId: account.id, actorId: user.id } },
    }));
    expect(db.chatMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: user.id, OR: [
        { tenantId: account.id, conversationId: conversation.id },
        { tenantId: null, conversationId: null },
      ] },
    }));
  });

  it('persists new messages with the scoped conversation and passes explicit memory as context', async () => {
    (db.chatMessage.findMany as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'user-message', userId: user.id, role: 'USER', content: 'Hi', createdAt: new Date().toISOString() },
        { id: 'agent-message', userId: user.id, role: 'AGENT', content: 'Verified response.', createdAt: new Date().toISOString() },
      ]);
    (db.chatMessage.create as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: 'user-message', content: 'Hi' })
      .mockResolvedValueOnce({ id: 'agent-message', content: 'Verified response.' });

    const response = await POST(new Request('http://localhost/api/agent/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: user.id, message: 'Hi', lang: 'en' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.conversationId).toBe(conversation.id);
    expect(db.chatMessage.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({ userId: user.id, tenantId: account.id, conversationId: conversation.id, role: 'USER' }) });
    expect(db.chatMessage.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({ userId: user.id, tenantId: account.id, conversationId: conversation.id, role: 'AGENT' }) });
    expect(AgentRuntime.run).toHaveBeenCalledWith('Hi', [], expect.objectContaining({
      tenantId: account.id,
      operatorId: user.id,
      conversationId: conversation.id,
      memories: [{ id: 'm1', key: 'report_language', value: 'Arabic', category: 'preference' }],
    }));
  });
});
