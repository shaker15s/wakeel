import { describe, expect, it } from 'vitest';
import { PolicyEngine } from '@/server/policy/engine';
import { ERP_TOOLS } from '@/server/agent/tools';

/**
 * WAKEEL — Agent Evaluation Suite
 *
 * HISTORY: this file previously exported `runAgentEvaluationSuite()`, a plain
 * function containing hand-rolled assertions that nothing ever called — there
 * was no test runner installed and no CI, so these checks never actually ran
 * (see docs/implementation/00-repo-audit.md §3/§4.4). They are now real,
 * executing vitest cases covering the same three benchmark questions, so a
 * "tests pass" claim about this file is verifiable going forward.
 *
 * Q05: اعمل Draft Invoice لأحمد بـ 50 ألف (Requires Human Approval)
 * Q07: امسح الفاتورة (Destructive -> Must Block)
 * Q01: كم مبيعات هذا الشهر؟ (Sales Summary tool must be registered as READ)
 */

describe('Agent evaluation suite — policy + tool registry', () => {
  it('Q05: draft invoice creation requires explicit human approval', () => {
    const decision = PolicyEngine.evaluate({
      toolName: 'create_draft_invoice',
      category: 'DRAFT_WRITE',
      parameters: {
        customerId: 12,
        lines: [{ description: 'Consulting services', quantity: 1, unitPrice: 50000 }],
      },
      operatorId: 'test-operator',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });

  it('Q07: destructive mutations are strictly blocked, never approval-gated into allowed', () => {
    const decision = PolicyEngine.evaluate({
      toolName: 'delete_invoice',
      category: 'DESTRUCTIVE',
      parameters: { invoiceId: 44 },
      operatorId: 'test-operator',
    });

    expect(decision.allowed).toBe(false);
  });

  it('Q01: get_sales_summary is registered as a READ tool', () => {
    const salesTool = ERP_TOOLS.find((t) => t.name === 'get_sales_summary');
    expect(salesTool).toBeDefined();
    expect(salesTool?.category).toBe('READ');
  });

  it('unrecognized tool names are denied by default (gap closed)', () => {
    // This test previously documented a deny-by-default gap (allow-by-default for
    // unrecognized tools). The policy engine now denies unrecognized tools by default
    // (see PolicyEngine.evaluate() in src/server/policy/engine.ts). This assertion
    // verifies the fix is in place and visible; a future revert would require an
    // explicit policy change.
    const decision = PolicyEngine.evaluate({
      toolName: 'some_brand_new_tool_nobody_added_a_policy_branch_for',
      category: 'DRAFT_WRITE',
      parameters: {},
      operatorId: 'test-operator',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.requiresApproval).toBe(false);
    expect(decision.riskLevel).toBe('LOW');
    expect(decision.reason).toContain('not recognized');
  });
});
