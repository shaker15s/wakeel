import { describe, expect, it } from 'vitest';
import { createMoney } from '@/server/accounting/money';
import { validateJournalDraft } from '@/server/accounting/journal-entry';
import { createDraftJournalEntryProposal } from '@/server/runtime/workflows/create-draft-journal-entry';

describe('journal entry draft', () => {
  const accounts = [{ id: 'cash' }, { id: 'sales' }];
  const line = (accountId: string, debit: string, credit: string) => ({
    accountId, debit: createMoney(debit, 'USD'), credit: createMoney(credit, 'USD'),
  });
  it('accepts exact, balanced lines and returns reproducible totals', () => {
    const result = validateJournalDraft({ date: '2026-10-01', currency: 'USD', description: 'Sale', lines: [line('cash', '10.01', '0'), line('sales', '0', '10.01')] }, accounts);
    expect(result.status).toBe('draft');
    expect(result.totals.debit.amount).toBe('10.01');
    expect(result.totals.credit.amount).toBe('10.01');
  });
  it('rejects imbalance, one-sided violations, and unconfigured accounts', () => {
    expect(() => validateJournalDraft({ date: '2026-10-01', currency: 'USD', description: 'Bad', lines: [line('cash', '1', '0'), line('sales', '0', '2')] }, accounts)).toThrow(/balance/i);
    expect(() => validateJournalDraft({ date: '2026-10-01', currency: 'USD', description: 'Bad', lines: [line('cash', '1', '1'), line('sales', '0', '0')] }, accounts)).toThrow(/either debit or credit/i);
    expect(() => validateJournalDraft({ date: '2026-10-01', currency: 'USD', description: 'Bad', lines: [line('unconfigured', '1', '0'), line('sales', '0', '1')] }, accounts)).toThrow(/configured account/i);
  });
  it('rejects foreign currency, negative values, and invalid dates', () => {
    expect(() => validateJournalDraft({ date: '2026-10-01', currency: 'USD', description: 'Bad', lines: [line('cash', '1', '0'), { ...line('sales', '0', '1'), credit: createMoney('1', 'EUR') }] }, accounts)).toThrow(/currency/i);
    expect(() => validateJournalDraft({ date: '2026-10-01', currency: 'USD', description: 'Bad', lines: [line('cash', '-1', '0'), line('sales', '0', '-1')] }, accounts)).toThrow(/nonnegative/i);
    expect(() => validateJournalDraft({ date: 'not-date', currency: 'USD', description: 'Bad', lines: [line('cash', '1', '0'), line('sales', '0', '1')] }, accounts)).toThrow(/date/i);
  });
  it('returns an approval-gated proposal and never posts', () => {
    const result = createDraftJournalEntryProposal({ date: '2026-10-01', currency: 'USD', description: 'Sale', lines: [line('cash', '10.01', '0'), line('sales', '0', '10.01')] }, accounts);
    expect(result.status).toBe('proposal');
    if (result.status === 'proposal') expect(result.approvalRequiredBeforeAnyERPWrite).toBe(true);
  });
});
