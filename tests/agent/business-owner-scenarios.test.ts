import { describe, expect, it } from 'vitest';
import { createMoney } from '@/server/accounting/money';
import { validateJournalDraft } from '@/server/accounting/journal-entry';
import { proposeBankMatches } from '@/server/accounting/reconciliation';
import { assessExpense } from '@/server/accounting/expenses';
import { calculateAssetSchedule } from '@/server/accounting/fixed-assets';
import { buildPeriodCloseChecklist, calculateBudgetVariance } from '@/server/accounting/budgets';

const accounts = [{ id: 'cash' }, { id: 'sales' }];
const journalLine = (accountId: string, debit: string, credit: string) => ({ accountId, debit: createMoney(debit, 'USD'), credit: createMoney(credit, 'USD') });
const journal = (lines = [journalLine('cash', '100.00', '0'), journalLine('sales', '0', '100.00')]) => ({ date: '2026-10-01', currency: 'USD', description: 'October transaction', lines });
const statement = (id: string, amount = '100.00', reference: string | null = 'REF-1', date = '2026-10-01') => ({ id, date, amount: createMoney(amount, 'USD'), description: 'Supplier payment', reference });
const ledger = (id: string, amount = '100.00', reference: string | null = 'REF-1', date = '2026-10-01') => ({ id, date, amount: createMoney(amount, 'USD'), description: 'Supplier payment', reference });
const reconPolicy = { maxDateDifferenceDays: 3, nearAmountTolerance: createMoney('0.02', 'USD'), minimumScore: 70 };
const expensePolicy = { allowedCategories: ['travel', 'software'], receiptRequired: true, maxAmount: createMoney('500.00', 'USD'), openPeriod: { dateFrom: '2026-10-01', dateTo: '2026-10-31' }, taxConfigured: true, taxRuleId: 'company-standard-expense-tax' };
const expense = { date: '2026-10-14', amount: createMoney('100.00', 'USD'), description: 'Client travel', category: 'travel', receiptPresent: true };
const asset = { assetId: 'laptop-1', inServiceDate: '2026-01-31', cost: createMoney('100.00', 'USD'), residualValue: createMoney('0.00', 'USD'), usefulLifeMonths: 3, method: 'straight_line' as const };
const assetPolicy = { method: 'straight_line' as const, maxUsefulLifeMonths: 120, configured: true as const };

const scenarios: Array<{ id: string; expected: string; run: () => string }> = [
  { id: 'journal-balanced-minor-units', expected: 'draft:100.00:100.00', run: () => { const r = validateJournalDraft(journal(), accounts); return `${r.status}:${r.totals.debit.amount}:${r.totals.credit.amount}`; } },
  { id: 'journal-unbalanced', expected: 'blocked', run: () => { try { validateJournalDraft(journal([journalLine('cash', '100', '0'), journalLine('sales', '0', '99')]), accounts); return 'allowed'; } catch { return 'blocked'; } } },
  { id: 'journal-unconfigured-account', expected: 'blocked', run: () => { try { validateJournalDraft(journal([journalLine('fake', '100', '0'), journalLine('sales', '0', '100')]), accounts); return 'allowed'; } catch { return 'blocked'; } } },
  { id: 'journal-both-sides-on-line', expected: 'blocked', run: () => { try { validateJournalDraft(journal([journalLine('cash', '1', '1'), journalLine('sales', '0', '0')]), accounts); return 'allowed'; } catch { return 'blocked'; } } },
  { id: 'journal-empty-side', expected: 'blocked', run: () => { try { validateJournalDraft(journal([journalLine('cash', '1', '0'), journalLine('sales', '0', '0')]), accounts); return 'allowed'; } catch { return 'blocked'; } } },
  { id: 'journal-negative-amount', expected: 'blocked', run: () => { try { validateJournalDraft(journal([journalLine('cash', '-1', '0'), journalLine('sales', '0', '-1')]), accounts); return 'allowed'; } catch { return 'blocked'; } } },
  { id: 'journal-invalid-calendar-date', expected: 'blocked', run: () => { try { validateJournalDraft({ ...journal(), date: '2026-02-30' }, accounts); return 'allowed'; } catch { return 'blocked'; } } },
  { id: 'journal-mixed-currencies', expected: 'blocked', run: () => { try { validateJournalDraft(journal([journalLine('cash', '1', '0'), { ...journalLine('sales', '0', '1'), credit: createMoney('1', 'EUR') }]), accounts); return 'allowed'; } catch { return 'blocked'; } } },
  { id: 'journal-explicitly-unposted', expected: 'false', run: () => String(validateJournalDraft(journal(), accounts).posted) },
  { id: 'reconciliation-exact', expected: 'proposed', run: () => proposeBankMatches([statement('s1')], [ledger('l1')], reconPolicy)[0].status },
  { id: 'reconciliation-near-amount', expected: 'review_required', run: () => proposeBankMatches([statement('s1')], [ledger('l1', '100.01')], reconPolicy)[0].status },
  { id: 'reconciliation-no-reference', expected: 'review_required', run: () => proposeBankMatches([statement('s1', '100', null)], [ledger('l1', '100', null)], reconPolicy)[0].status },
  { id: 'reconciliation-duplicate-statement', expected: 'review_required,review_required', run: () => proposeBankMatches([statement('s1'), statement('s2')], [ledger('l1')], reconPolicy).map(x => x.status).join(',') },
  { id: 'reconciliation-ambiguous-ledger-candidates', expected: 'review_required', run: () => proposeBankMatches([statement('s1')], [ledger('l1'), ledger('l2')], reconPolicy)[0].status },
  { id: 'reconciliation-currency-mismatch', expected: 'review_required', run: () => proposeBankMatches([statement('s1')], [{ ...ledger('l1'), amount: createMoney('100', 'EUR') }], reconPolicy)[0].status },
  { id: 'reconciliation-date-outside-policy', expected: 'review_required', run: () => proposeBankMatches([statement('s1')], [ledger('l1', '100', 'REF-1', '2026-09-01')], reconPolicy)[0].status },
  { id: 'reconciliation-amount-outside-tolerance', expected: 'review_required', run: () => proposeBankMatches([statement('s1')], [ledger('l1', '120')], reconPolicy)[0].status },
  { id: 'reconciliation-exact-evidence', expected: 'exact_amount,exact_reference,same_date,description_match', run: () => proposeBankMatches([statement('s1')], [ledger('l1')], reconPolicy)[0].scoreFactors.join(',') },
  { id: 'reconciliation-no-candidate', expected: 'review_required', run: () => proposeBankMatches([statement('s1')], [], reconPolicy)[0].status },
  { id: 'expense-configured-policy', expected: 'draft_eligible', run: () => assessExpense(expense, expensePolicy).status },
  { id: 'expense-no-policy', expected: 'review_required', run: () => assessExpense(expense, null).status },
  { id: 'expense-missing-receipt', expected: 'review_required', run: () => assessExpense({ ...expense, receiptPresent: false }, expensePolicy).status },
  { id: 'expense-over-policy-limit', expected: 'review_required', run: () => assessExpense({ ...expense, amount: createMoney('501', 'USD') }, expensePolicy).status },
  { id: 'expense-closed-period', expected: 'review_required', run: () => assessExpense({ ...expense, date: '2026-11-01' }, expensePolicy).status },
  { id: 'expense-invalid-date', expected: 'review_required', run: () => assessExpense({ ...expense, date: '2026-02-30' }, expensePolicy).status },
  { id: 'expense-unknown-category', expected: 'review_required', run: () => assessExpense({ ...expense, category: 'misc' }, expensePolicy).status },
  { id: 'expense-tax-unconfigured', expected: 'review_required', run: () => assessExpense(expense, { ...expensePolicy, taxConfigured: false }).status },
  { id: 'expense-currency-mismatch', expected: 'review_required', run: () => assessExpense({ ...expense, amount: createMoney('100', 'EUR') }, expensePolicy).status },
  { id: 'expense-nonpositive-amount', expected: 'review_required', run: () => assessExpense({ ...expense, amount: createMoney('0', 'USD') }, expensePolicy).status },
  { id: 'asset-straight-line-total', expected: '100.00', run: () => { const r = calculateAssetSchedule(asset, assetPolicy); return r.status === 'calculated' ? r.totalDepreciation.amount : r.reason; } },
  { id: 'asset-month-end-calendar', expected: '2026-01-31,2026-02-28,2026-03-31', run: () => { const r = calculateAssetSchedule(asset, assetPolicy); return r.status === 'calculated' ? r.periods.map(x => x.date).join(',') : r.reason; } },
  { id: 'asset-unknown-policy', expected: 'review_required', run: () => calculateAssetSchedule(asset, null).status },
  { id: 'asset-unsupported-method', expected: 'review_required', run: () => calculateAssetSchedule({ ...asset, method: 'declining_balance' as 'straight_line' }, assetPolicy).status },
  { id: 'asset-life-exceeds-policy', expected: 'review_required', run: () => calculateAssetSchedule({ ...asset, usefulLifeMonths: 121 }, assetPolicy).status },
  { id: 'asset-residual-above-cost', expected: 'review_required', run: () => calculateAssetSchedule({ ...asset, residualValue: createMoney('101', 'USD') }, assetPolicy).status },
  { id: 'asset-currency-mismatch', expected: 'review_required', run: () => calculateAssetSchedule({ ...asset, residualValue: createMoney('1', 'EUR') }, assetPolicy).status },
  { id: 'budget-over', expected: 'over_budget:20.00:2000', run: () => { const r = calculateBudgetVariance(createMoney('120', 'USD'), createMoney('100', 'USD'), { period: '2026-10' }); return `${r.status}:${r.variance?.amount}:${r.varianceBasisPoints}`; } },
  { id: 'budget-under', expected: 'under_budget:-20.00:-2000', run: () => { const r = calculateBudgetVariance(createMoney('80', 'USD'), createMoney('100', 'USD'), { period: '2026-10' }); return `${r.status}:${r.variance?.amount}:${r.varianceBasisPoints}`; } },
  { id: 'budget-on-plan', expected: 'on_budget:0.00:0', run: () => { const r = calculateBudgetVariance(createMoney('100', 'USD'), createMoney('100', 'USD'), { period: '2026-10' }); return `${r.status}:${r.variance?.amount}:${r.varianceBasisPoints}`; } },
  { id: 'budget-zero-baseline', expected: 'review_required:null', run: () => { const r = calculateBudgetVariance(createMoney('5', 'USD'), createMoney('0', 'USD'), { period: '2026-10' }); return `${r.status}:${r.varianceBasisPoints}`; } },
  { id: 'budget-currency-mismatch', expected: 'review_required', run: () => calculateBudgetVariance(createMoney('5', 'USD'), createMoney('1', 'EUR'), { period: '2026-10' }).status },
  { id: 'budget-negative-baseline', expected: 'review_required', run: () => calculateBudgetVariance(createMoney('5', 'USD'), createMoney('-1', 'USD'), { period: '2026-10' }).status },
  { id: 'budget-invalid-period', expected: 'review_required', run: () => calculateBudgetVariance(createMoney('5', 'USD'), createMoney('1', 'USD'), { period: '2026-13' }).status },
  { id: 'close-all-controls-complete', expected: 'ready_for_human_close_review', run: () => buildPeriodCloseChecklist('2026-10', { bankReconciled: true, subledgersReconciled: true, trialBalanceBalanced: true, taxReviewed: true }).status },
  { id: 'close-blocked-reconciliation', expected: 'review_required', run: () => buildPeriodCloseChecklist('2026-10', { bankReconciled: false, subledgersReconciled: true, trialBalanceBalanced: true, taxReviewed: true }).status },
  { id: 'close-unknown-tax-review', expected: 'review_required', run: () => buildPeriodCloseChecklist('2026-10', { bankReconciled: true, subledgersReconciled: true, trialBalanceBalanced: true, taxReviewed: null }).status },
  { id: 'close-invalid-period', expected: 'review_required', run: () => buildPeriodCloseChecklist('2026-13', { bankReconciled: true, subledgersReconciled: true, trialBalanceBalanced: true, taxReviewed: true }).status },
];

describe(`accountant business-owner scenarios (${scenarios.length})`, () => {
  expect(scenarios.length).toBeGreaterThanOrEqual(30);
  for (const scenario of scenarios) {
    it(`${scenario.id}: expected ${scenario.expected}`, () => {
      expect(scenario.run()).toBe(scenario.expected);
    });
  }
});
