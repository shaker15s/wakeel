import { describe, expect, it } from 'vitest';
import { createMoney } from '@/server/accounting/money';
import { proposeBankMatches } from '@/server/accounting/reconciliation';

const statement = (id: string, amount: string, reference: string | null = 'INV-1', date = '2026-10-01') => ({ id, date, amount: createMoney(amount, 'USD'), description: 'Invoice payment', reference });
const ledger = (id: string, amount: string, reference: string | null = 'INV-1', date = '2026-10-01') => ({ id, date, amount: createMoney(amount, 'USD'), description: 'Invoice payment', reference });
const policy = { maxDateDifferenceDays: 3, nearAmountTolerance: createMoney('0.02', 'USD'), minimumScore: 70 };

describe('bank reconciliation proposals', () => {
  it('ranks an exact reference, amount, and date match with evidence factors', () => {
    const [proposal] = proposeBankMatches([statement('s1', '100.00')], [ledger('l1', '100.00')], policy);
    expect(proposal.status).toBe('proposed');
    expect(proposal.candidateRecordId).toBe('l1');
    expect(proposal.scoreFactors).toEqual(expect.arrayContaining(['exact_amount', 'exact_reference', 'same_date']));
  });
  it('allows bounded near matches only as review-required and rejects foreign currency', () => {
    const [near] = proposeBankMatches([statement('s1', '100.00')], [ledger('l1', '100.01')], policy);
    expect(near.status).toBe('review_required');
    expect(near.scoreFactors).toContain('near_amount');
    const [currency] = proposeBankMatches([statement('s1', '100.00')], [{ ...ledger('l1', '100.00'), amount: createMoney('100.00', 'EUR') }], policy);
    expect(currency.status).toBe('review_required');
    expect(currency.scoreFactors).toContain('currency_mismatch');
  });
  it('routes ties and duplicate statement lines to review without consuming a ledger row', () => {
    const result = proposeBankMatches([statement('s1', '100.00'), statement('s2', '100.00')], [ledger('l1', '100.00')], policy);
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.status === 'review_required')).toBe(true);
  });
  it('does not propose candidates outside the date/tolerance policy and handles calendar boundaries', () => {
    const result = proposeBankMatches([statement('s1', '100.00', null, '2026-01-01')], [ledger('l1', '100.00', null, '2025-12-20')], policy);
    expect(result[0].status).toBe('review_required');
    expect(result[0].scoreFactors).toContain('date_outside_policy');
  });
});
