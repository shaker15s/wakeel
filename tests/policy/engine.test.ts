import { describe, expect, it } from 'vitest';
import { PolicyEngine } from '@/server/policy/engine';

const request = (overrides: Partial<Parameters<typeof PolicyEngine.evaluate>[0]> = {}) => ({
  toolName: 'get_sales_summary',
  category: 'READ' as const,
  parameters: {},
  operatorId: 'operator-1',
  ...overrides,
});

describe('PolicyEngine deny-by-default decisions', () => {
  it('allows only a known read tool without approval', () => {
    expect(PolicyEngine.evaluate(request())).toMatchObject({ allowed: true, requiresApproval: false, riskLevel: 'LOW' });
  });

  it('denies unknown read and write tools', () => {
    for (const category of ['READ', 'DRAFT_WRITE'] as const) {
      expect(PolicyEngine.evaluate(request({ toolName: 'unregistered_tool', category })).allowed).toBe(false);
    }
  });

  it('denies a known tool when the requested risk category does not match its registration', () => {
    expect(PolicyEngine.evaluate(request({ toolName: 'get_sales_summary', category: 'DRAFT_WRITE' })).allowed).toBe(false);
  });

  it('requires approval for registered draft writes and always blocks destructive actions', () => {
    expect(PolicyEngine.evaluate(request({ toolName: 'create_draft_invoice', category: 'DRAFT_WRITE' })).requiresApproval).toBe(true);
    expect(PolicyEngine.evaluate(request({ toolName: 'delete_invoice', category: 'DESTRUCTIVE' })).allowed).toBe(false);
  });
});
