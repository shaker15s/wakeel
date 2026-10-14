import { createMoney, currencyScale, Money, MoneyMath } from './money';

export interface JournalDraftInput {
  date: string;
  currency: string;
  description: string;
  lines: Array<{ accountId: string; debit: Money; credit: Money; description?: string; reference?: string | null }>;
}

export interface JournalDraftPolicyAccount { id: string; }

export function validateJournalDraft(input: JournalDraftInput, configuredAccounts: JournalDraftPolicyAccount[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || new Date(`${input.date}T00:00:00Z`).toISOString().slice(0, 10) !== input.date) {
    throw new Error('Journal date must be a valid calendar date in YYYY-MM-DD format.');
  }
  const currency = input.currency.trim().toUpperCase();
  const scale = currencyScale(currency);
  if (input.lines.length < 2 || input.lines.length > 200) throw new Error('Journal entry requires between 2 and 200 lines.');
  if (!input.description.trim() || input.description.length > 500) throw new Error('Journal description is required and bounded.');
  const accountIds = new Set(configuredAccounts.map((account) => account.id));
  let debit = createMoney('0', currency, scale);
  let credit = createMoney('0', currency, scale);
  for (const line of input.lines) {
    if (!line.accountId || !accountIds.has(line.accountId)) throw new Error('Journal line references an unconfigured account.');
    if (line.debit.currency !== currency || line.credit.currency !== currency || line.debit.scale !== scale || line.credit.scale !== scale) {
      throw new Error('All journal lines must use the configured journal currency and scale.');
    }
    const normalizedDebit = createMoney(line.debit.amount, line.debit.currency, line.debit.scale);
    const normalizedCredit = createMoney(line.credit.amount, line.credit.currency, line.credit.scale);
    if (normalizedDebit.amount !== line.debit.amount || normalizedCredit.amount !== line.credit.amount) throw new Error('Journal amounts must be canonical decimals.');
    if (MoneyMath.compare(line.debit, createMoney('0', currency)) < 0 || MoneyMath.compare(line.credit, createMoney('0', currency)) < 0) {
      throw new Error('Journal amounts must be nonnegative.');
    }
    const hasDebit = MoneyMath.compare(line.debit, createMoney('0', currency)) > 0;
    const hasCredit = MoneyMath.compare(line.credit, createMoney('0', currency)) > 0;
    if (hasDebit === hasCredit) throw new Error('Each journal line must have either debit or credit, never both or neither.');
    debit = MoneyMath.add(debit, line.debit);
    credit = MoneyMath.add(credit, line.credit);
  }
  if (MoneyMath.compare(debit, credit) !== 0) throw new Error('Journal debits and credits must balance exactly.');
  return {
    status: 'draft' as const,
    posted: false as const,
    date: input.date,
    currency,
    description: input.description.trim(),
    lines: input.lines.map((line) => ({ ...line, debit: createMoney(line.debit.amount, currency, scale), credit: createMoney(line.credit.amount, currency, scale) })),
    totals: { debit, credit },
    evidence: { calculationVersion: 'wakeel-journal-v1', checks: ['configured_accounts', 'single_sided_lines', 'exact_debit_credit_balance'], warnings: [] as string[] },
  };
}
