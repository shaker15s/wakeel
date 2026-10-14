import { describe, expect, it } from 'vitest';
import { ERP_TOOLS } from '@/server/agent/tools';
import { PolicyEngine } from '@/server/policy/engine';

describe('Finance Tool Registry - Tool Definitions', () => {
  it('every registered tool has a unique name', () => {
    const names = ERP_TOOLS.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('every registered tool has a parameters schema object', () => {
    expect(ERP_TOOLS).toBeDefined();
    expect(ERP_TOOLS.length).toBeGreaterThan(0);
    ERP_TOOLS.forEach((t) => {
      expect(t.parametersSchema).toBeDefined();
      expect(typeof t.parametersSchema).toBe('object');
    });
  });

  it('every registered tool has a risk class (category)', () => {
    ERP_TOOLS.forEach((t) => {
      expect(t.category).toBeDefined();
      expect(['READ', 'DRAFT_WRITE', 'FINANCIAL_COMMIT', 'DESTRUCTIVE']).toContain(
        t.category,
      );
    });
  });
});

describe('Finance Tool Registry - Deny-by-Default Dispatch', () => {
  it('unknown tool names are denied by PolicyEngine', () => {
    const decision = PolicyEngine.evaluate({
      toolName: 'nonexistent_tool_nobody_recognized',
      category: 'DRAFT_WRITE' as const,
      parameters: {},
      operatorId: 'test-operator',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.requiresApproval).toBe(false);
    expect(decision.riskLevel).toBe('LOW');
    // Denial reason explains the tool is not recognized
    expect(decision.reason).toContain('not recognized');
  });

  it('READ tools are allowed without approval', () => {
    const decision = PolicyEngine.evaluate({
      toolName: 'get_sales_summary',
      category: 'READ',
      parameters: {},
      operatorId: 'test-operator',
    });
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(false);
    expect(decision.riskLevel).toBe('LOW');
  });

  it('DRAFT_WRITE tools require approval (amount under threshold)', () => {
    const decision = PolicyEngine.evaluate({
      toolName: 'create_draft_invoice',
      category: 'DRAFT_WRITE',
      parameters: {
        customerId: 12,
        lines: [{ description: 'Consulting services', quantity: 1, unitPrice: 1000 }],
      },
      operatorId: 'test-operator',
    });
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.riskLevel).toBe('MEDIUM');
  });

  it('DESTRUCTIVE tools are never allowed', () => {
    const decision = PolicyEngine.evaluate({
      toolName: 'delete_invoice',
      category: 'DESTRUCTIVE',
      parameters: { invoiceId: 44 },
      operatorId: 'test-operator',
    });
    expect(decision.allowed).toBe(false);
  });
});