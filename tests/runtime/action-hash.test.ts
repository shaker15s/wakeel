import { describe, expect, it } from 'vitest';
import { computeActionHash } from '@/server/runtime/action-hash';

describe('computeActionHash', () => {
  const base = {
    toolName: 'create_draft_invoice',
    normalizedParams: { customerId: 'cust-1', lines: [{ description: 'A', quantity: 1, unitPrice: 10 }] },
    policyVersion: 'policy-engine-v0.1',
    resourceRef: 'customer:cust-1',
  };

  it('is deterministic for identical input', () => {
    expect(computeActionHash(base)).toBe(computeActionHash(base));
  });

  it('is insensitive to object key order (canonicalization)', () => {
    const reordered = {
      resourceRef: base.resourceRef,
      policyVersion: base.policyVersion,
      normalizedParams: { lines: base.normalizedParams.lines, customerId: base.normalizedParams.customerId },
      toolName: base.toolName,
    };
    expect(computeActionHash(reordered)).toBe(computeActionHash(base));
  });

  it('changes when toolName changes', () => {
    expect(computeActionHash({ ...base, toolName: 'create_draft_purchase_order' })).not.toBe(computeActionHash(base));
  });

  it('changes when any parameter value changes (e.g. unit price)', () => {
    const tampered = {
      ...base,
      normalizedParams: { ...base.normalizedParams, lines: [{ description: 'A', quantity: 1, unitPrice: 999 }] },
    };
    expect(computeActionHash(tampered)).not.toBe(computeActionHash(base));
  });

  it('changes when the policy version changes', () => {
    expect(computeActionHash({ ...base, policyVersion: 'policy-engine-v0.2' })).not.toBe(computeActionHash(base));
  });

  it('changes when the resource reference changes', () => {
    expect(computeActionHash({ ...base, resourceRef: 'customer:cust-2' })).not.toBe(computeActionHash(base));
  });
});
