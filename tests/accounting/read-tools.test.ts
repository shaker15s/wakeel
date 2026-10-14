import { describe, expect, it } from 'vitest';
import { calculateAgedBalances, calculateFinancialStatement, calculateTrialBalance, readAccountActivity, type AccountingDataset } from '@/server/accounting/read-tools';
import { createMoney } from '@/server/accounting/money';

const egp = (amount: string) => createMoney(amount, 'EGP');
const fixture: AccountingDataset = {
  sourceSystem: 'fake-erp-fixture-v1',
  accounts: [
    { id: 'cash', code: '1000', name: 'Cash', type: 'asset', currency: 'EGP' },
    { id: 'receivable', code: '1100', name: 'Accounts receivable', type: 'asset', currency: 'EGP' },
    { id: 'payable', code: '2000', name: 'Accounts payable', type: 'liability', currency: 'EGP' },
    { id: 'equity', code: '3000', name: 'Equity', type: 'equity', currency: 'EGP' },
    { id: 'revenue', code: '4000', name: 'Revenue', type: 'income', currency: 'EGP' },
    { id: 'expense', code: '5000', name: 'Expense', type: 'expense', currency: 'EGP' },
    { id: 'usd-cash', code: '1010', name: 'USD cash', type: 'asset', currency: 'USD' },
  ],
  lines: [
    { id: 'l1', journalId: 'j1', accountId: 'cash', date: '2026-01-01', debit: egp('50'), credit: egp('0'), reference: 'opening' },
    { id: 'l2', journalId: 'j1', accountId: 'equity', date: '2026-01-01', debit: egp('0'), credit: egp('50'), reference: 'opening' },
    { id: 'l3', journalId: 'j2', accountId: 'receivable', date: '2026-01-15', debit: egp('100'), credit: egp('0'), reference: 'INV-1' },
    { id: 'l4', journalId: 'j2', accountId: 'revenue', date: '2026-01-15', debit: egp('0'), credit: egp('100'), reference: 'INV-1' },
    { id: 'l5', journalId: 'j3', accountId: 'expense', date: '2026-02-01', debit: egp('20'), credit: egp('0'), reference: 'EXP-1' },
    { id: 'l6', journalId: 'j3', accountId: 'cash', date: '2026-02-01', debit: egp('0'), credit: egp('20'), reference: 'EXP-1' },
  ],
  openBalances: [
    { id: 'ap-current', kind: 'payable', partner: 'Supplier A', dueDate: '2026-02-20', amount: egp('10') },
    { id: 'ap-15', kind: 'payable', partner: 'Supplier B', dueDate: '2026-02-01', amount: egp('15') },
    { id: 'ap-45', kind: 'payable', partner: 'Supplier C', dueDate: '2026-01-02', amount: egp('25') },
    { id: 'ar-100', kind: 'receivable', partner: 'Customer A', dueDate: '2025-11-01', amount: egp('100') },
  ],
};

describe('evidence-backed accounting reads', () => {
  it('calculates a balanced trial balance for the requested dates and currency', () => {
    const result = calculateTrialBalance(fixture, { dateFrom: '2026-01-01', dateTo: '2026-02-28', currency: 'EGP' });
    expect(result.totals).toMatchObject({ debit: egp('170'), credit: egp('170'), balanced: true });
    expect(result.evidence.period).toEqual({ dateFrom: '2026-01-01', dateTo: '2026-02-28' });
    expect(result.rows.some((row) => row.accountId === 'usd-cash')).toBe(false);
  });

  it('returns account activity with exact period totals', () => {
    const result = readAccountActivity(fixture, { accountId: 'cash', dateFrom: '2026-02-01', dateTo: '2026-02-28', currency: 'EGP' });
    expect(result.lines).toHaveLength(1);
    expect(result.totals.credit).toEqual(egp('20'));
  });

  it('rolls up profit and loss and balance-sheet accounts deterministically', () => {
    const pnl = calculateFinancialStatement(fixture, { kind: 'profit_and_loss', dateFrom: '2026-01-01', dateTo: '2026-02-28', currency: 'EGP' });
    expect(pnl.total).toEqual(egp('80'));
    expect(pnl.rows.map((row) => [row.type, row.balance.amount])).toEqual([['income', '100.00'], ['expense', '20.00']]);
    const balance = calculateFinancialStatement(fixture, { kind: 'balance_sheet', dateFrom: '2026-01-01', dateTo: '2026-02-28', currency: 'EGP' });
    expect(balance.rows.map((row) => row.accountId)).toEqual(['cash', 'receivable', 'payable', 'equity']);
    expect(balance.evidence.warnings).toContain('balance_sheet_rollup_requires_company_specific_retained_earnings_mapping');
  });

  it('ages payable and receivable balances independently into deterministic buckets', () => {
    const ap = calculateAgedBalances(fixture, { kind: 'payable', asOf: '2026-02-20', currency: 'EGP' });
    expect(ap.buckets).toMatchObject({ current: egp('10'), days1to30: egp('15'), days31to60: egp('25'), over90: egp('0') });
    const ar = calculateAgedBalances(fixture, { kind: 'receivable', asOf: '2026-02-20', currency: 'EGP' });
    expect(ar.buckets.over90).toEqual(egp('100'));
  });

  it('rejects invalid periods, unknown accounts, and unsupported cash-flow mapping', () => {
    expect(() => calculateTrialBalance(fixture, { dateFrom: '2026-03-01', dateTo: '2026-02-01', currency: 'EGP' })).toThrow();
    expect(() => readAccountActivity(fixture, { accountId: 'missing', dateFrom: '2026-01-01', dateTo: '2026-02-01', currency: 'EGP' })).toThrow();
    expect(() => calculateFinancialStatement(fixture, { kind: 'cash_flow', dateFrom: '2026-01-01', dateTo: '2026-02-01', currency: 'EGP' })).toThrow('Cash flow mapping is not configured');
  });
});
