import { describe, expect, it } from 'vitest';
import { createMoney } from '@/server/accounting/money';
import { calculateBudgetVariance, buildPeriodCloseChecklist } from '@/server/accounting/budgets';

describe('budget and close assistance', () => {
  it('calculates exact variance and integer basis points', () => {
    const result = calculateBudgetVariance(createMoney('120', 'USD'), createMoney('100', 'USD'), { period: '2026-10', costCenter: 'ops' });
    expect(result.status).toBe('over_budget');
    if (!result.variance) throw new Error('Expected a calculated variance.');
    expect(result.variance.amount).toBe('20.00');
    expect(result.varianceBasisPoints).toBe('2000');
  });
  it('marks zero baseline and currency mismatch for review', () => {
    expect(calculateBudgetVariance(createMoney('5', 'USD'), createMoney('0', 'USD'), { period: '2026-10' }).varianceBasisPoints).toBeNull();
    expect(calculateBudgetVariance(createMoney('5', 'USD'), createMoney('1', 'EUR'), { period: '2026-10' }).status).toBe('review_required');
  });
  it('keeps unverified close controls in review', () => {
    const checklist = buildPeriodCloseChecklist('2026-10', { bankReconciled: true, subledgersReconciled: false, trialBalanceBalanced: true, taxReviewed: null });
    expect(checklist.status).toBe('review_required');
    expect(checklist.items.filter((item) => item.status !== 'complete')).toHaveLength(2);
  });
});
