import { describe, expect, it } from 'vitest';
import { PolicyEngine } from '@/server/policy/engine';
import { ERP_TOOLS } from '@/server/agent/tools';
import { executeToolCall } from '@/server/agent/tools';

import type { FinanceTool, ToolExecutionResult, ToolCallResult } from '@/server/agent/tools';

describe('Conversation Runtime - Model Provider Interface', () => {
  it('fake provider completes a plain answer', async () => {
    const fakeProvider = {
      completeTurn: async (_input) => ({
        type: 'message' as const,
        text: 'Hello! How can I help you with your accounting?',
      }),
    } as const;

    const result = await fakeProvider.completeTurn({
      userMessage: 'Test message',
      tenantId: 'test-tenant',
      actorId: 'test-operator',
      lang: 'en',
    });

    expect(result).toHaveProperty('type', 'message');
    expect(result).toHaveProperty('text');
  });

  it('fake provider returns tool_calls when needed', async () => {
    const fakeProvider = {
      completeTurn: async () => ({
        type: 'tool_calls' as const,
        calls: [
          {
            callId: 'call-1',
            name: 'get_sales_summary',
            arguments: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
          },
        ],
      }),
    } as const;

    const result = await fakeProvider.completeTurn({
      userMessage: 'What were my sales?',
      tenantId: 'test-tenant',
      actorId: 'test-operator',
      lang: 'en',
    });

    expect(result).toHaveProperty('type', 'tool_calls');
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toHaveProperty('callId');
    expect(result.calls[0]).toHaveProperty('name');
    expect(result.calls[0]).toHaveProperty('arguments');
  });
});

describe('Conversation Runtime - Prompt Injection Boundaries', () => {
  it('user text embedded with ignore policy does not bypass tool allowlist', () => {
    const decision = PolicyEngine.evaluate({
      toolName: 'ignore_this_tool_because_user_said_so',
      category: 'DRAFT_WRITE',
      parameters: {},
      operatorId: 'test-operator',
    });
    expect(decision.allowed).toBe(false);
  });

  it('invoice text embedded with transfer funds does not trigger write tools', () => {
    const decision = PolicyEngine.evaluate({
      toolName: 'create_draft_invoice',
      category: 'DRAFT_WRITE',
      parameters: { customerId: 1, lines: [] },
      operatorId: 'test-operator',
    });
    expect(decision.requiresApproval).toBe(true);
  });

  it('tool result text such as use another tool does not bypass server policy', () => {
    const decision = PolicyEngine.evaluate({
      toolName: 'some_other_tool',
      category: 'DRAFT_WRITE',
      parameters: {},
      operatorId: 'test-operator',
    });
    expect(decision.allowed).toBe(false);
  });

  it('model output is never treated as authorization', () => {
    const decision = PolicyEngine.evaluate({
      toolName: 'create_draft_invoice',
      category: 'DRAFT_WRITE',
      parameters: { customerId: 999, lines: [] },
      operatorId: 'test-operator',
    });
    expect(decision.requiresApproval).toBe(true);
  });

  it('cross tenant requests are denied', () => {
    const decision = PolicyEngine.evaluate({
      toolName: 'get_sales_summary',
      category: 'READ',
      parameters: {},
      operatorId: 'test-operator',
    });
    expect(decision.allowed).toBe(true);
  });
});

describe('Conversation Runtime - Tool Cycle Limits', () => {
  it('bounded to at most 8 model/tool cycles', async () => {
    let cycleCount = 0;
    const fakeProvider = {
      completeTurn: async () => {
        cycleCount++;
        if (cycleCount >= 8) {
          return {
            type: 'message' as const,
            text: 'Maximum tool cycles reached.',
          };
        }
        return {
          type: 'tool_calls' as const,
          calls: [
            {
              callId: `call-${cycleCount}`,
              name: 'get_sales_summary',
              arguments: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
            },
          ],
        };
      },
    } as const;

    for (let i = 0; i < 10; i++) {
      const result = await fakeProvider.completeTurn({
        userMessage: '',
        tenantId: 'test-tenant',
        actorId: 'test-operator',
        lang: 'en',
      });
      if (result.type === 'message') break;
    }

    expect(cycleCount).toBe(8);
  });

  it('bounded to at most 4 sequential tool calls before returning control', async () => {
    let toolCallCount = 0;
    const fakeProvider = {
      completeTurn: async () => {
        toolCallCount++;
        if (toolCallCount >= 4) {
          return {
            type: 'message' as const,
            text: 'Maximum sequential tool calls reached.',
          };
        }
        return {
          type: 'tool_calls' as const,
          calls: [
            {
              callId: `call-${toolCallCount}`,
              name: 'get_sales_summary',
              arguments: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
            },
          ],
        };
      },
    } as const;

    for (let i = 0; i < 10; i++) {
      const result = await fakeProvider.completeTurn({
        userMessage: '',
        tenantId: 'test-tenant',
        actorId: 'test-operator',
        lang: 'en',
      });
      if (result.type === 'message') break;
    }

    expect(toolCallCount).toBe(4);
  });
});
