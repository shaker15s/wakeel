import { describe, expect, it } from 'vitest';
import { PolicyEngine } from '@/server/policy/engine';
import { ERP_TOOLS } from '@/server/agent/tools';

describe('Prompt Injection Boundaries', () => {
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
