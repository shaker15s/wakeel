import { describe, expect, it } from 'vitest';
import { createMoney } from '@/server/accounting/money';
import { assessExpense } from '@/server/accounting/expenses';

describe('expense assessment', () => {
  const policy = { allowedCategories: ['travel', 'software'], receiptRequired: true, maxAmount: createMoney('500.00', 'USD'), openPeriod: { dateFrom: '2026-10-01', dateTo: '2026-10-31' }, taxConfigured: false };
  const input = { date: '2026-10-14', amount: createMoney('100.00', 'USD'), description: 'Taxi to client', category: 'travel', receiptPresent: true };
  it('routes missing tax setup for human review without inferring treatment', () => {
    const result = assessExpense(input, policy);
    expect(result.status).toBe('review_required');
    expect(result.taxTreatment.status).toBe('review_required');
    expect(result.reasons).toContain('tax_treatment_not_configured');
  });
  it('marks a receipt-backed expense eligible only under explicit company policy', () => {
    const result = assessExpense(input, { ...policy, taxConfigured: true, taxRuleId: 'company-standard-expense-tax' });
    expect(result.status).toBe('draft_eligible');
    expect(result.taxTreatment).toEqual({ status: 'configured', ruleId: 'company-standard-expense-tax' });
  });
  it('routes missing receipt, invalid period, category, threshold and currency to review', () => {
    expect(assessExpense({ ...input, receiptPresent: false }, policy).status).toBe('review_required');
    expect(assessExpense({ ...input, date: '2026-11-01' }, policy).status).toBe('review_required');
    expect(assessExpense({ ...input, date: '2026-02-30' }, policy).status).toBe('review_required');
    expect(assessExpense({ ...input, category: 'other' }, policy).status).toBe('review_required');
    expect(assessExpense({ ...input, amount: createMoney('501', 'USD') }, policy).status).toBe('review_required');
    expect(assessExpense({ ...input, amount: createMoney('100', 'EUR') }, policy).status).toBe('review_required');
  });
  it('fails closed when policy is absent', () => {
    const result = assessExpense(input, null);
    expect(result.status).toBe('review_required');
    expect(result.taxTreatment.status).toBe('review_required');
  });
});
