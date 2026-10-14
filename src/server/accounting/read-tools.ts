import { createMoney, Money, MoneyMath } from './money';

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export interface ChartAccount { id: string; code: string; name: string; type: AccountType; currency: string; }
export interface LedgerLine { id: string; journalId: string; accountId: string; date: string; debit: Money; credit: Money; reference: string | null; }
export interface OpenBalance { id: string; kind: 'payable' | 'receivable'; partner: string; dueDate: string; amount: Money; }
export interface ReadEvidence { sourceSystem: string; sourceRef?: string; readAt: string; period: { dateFrom?: string; dateTo: string }; currency: string; calculationVersion: string; warnings: string[]; }
export interface AccountingDataset { accounts: ChartAccount[]; lines: LedgerLine[]; openBalances: OpenBalance[]; sourceSystem: string; }

const VERSION = 'wakeel-accounting-v1';
function evidence(sourceSystem: string, dateTo: string, currency: string, dateFrom?: string): ReadEvidence {
  return { sourceSystem, readAt: new Date().toISOString(), period: { ...(dateFrom ? { dateFrom } : {}), dateTo }, currency, calculationVersion: VERSION, warnings: [] };
}
function zero(currency: string): Money { return createMoney('0', currency); }
function inPeriod(line: LedgerLine, from: string | undefined, to: string): boolean {
  return line.date <= to && (!from || line.date >= from);
}
function validatePeriod(from: string | undefined, to: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || (from && !/^\d{4}-\d{2}-\d{2}$/.test(from))) throw new Error('Report dates must use YYYY-MM-DD.');
  if (from && from > to) throw new Error('dateFrom must be on or before dateTo.');
}
function validateLines(accounts: ChartAccount[], lines: LedgerLine[], currency: string): void {
  const accountIds = new Set(accounts.map((account) => account.id));
  for (const line of lines) {
    if (!accountIds.has(line.accountId)) throw new Error(`Ledger line ${line.id} references an unconfigured account.`);
    if (line.debit.currency !== currency || line.credit.currency !== currency) throw new Error('Mixed currencies require separate report runs.');
  }
}

export function readChartOfAccounts(dataset: AccountingDataset) {
  return { evidence: evidence(dataset.sourceSystem, new Date().toISOString().slice(0, 10), 'MULTI'), accounts: dataset.accounts };
}

export function calculateTrialBalance(dataset: AccountingDataset, input: { dateFrom?: string; dateTo: string; currency: string }) {
  validatePeriod(input.dateFrom, input.dateTo);
  const accounts = dataset.accounts.filter((account) => account.currency === input.currency);
  const lines = dataset.lines.filter((line) => inPeriod(line, input.dateFrom, input.dateTo));
  validateLines(accounts, lines, input.currency);
  const rows = accounts.map((account) => {
    let debit = zero(input.currency); let credit = zero(input.currency);
    for (const line of lines.filter((item) => item.accountId === account.id)) {
      debit = MoneyMath.add(debit, line.debit); credit = MoneyMath.add(credit, line.credit);
    }
    return { accountId: account.id, code: account.code, name: account.name, type: account.type, debit, credit };
  });
  let debitTotal = zero(input.currency); let creditTotal = zero(input.currency);
  for (const row of rows) { debitTotal = MoneyMath.add(debitTotal, row.debit); creditTotal = MoneyMath.add(creditTotal, row.credit); }
  const balanced = MoneyMath.compare(debitTotal, creditTotal) === 0;
  return { evidence: { ...evidence(dataset.sourceSystem, input.dateTo, input.currency, input.dateFrom), warnings: balanced ? [] : ['debits_and_credits_do_not_balance'] }, rows, totals: { debit: debitTotal, credit: creditTotal, balanced } };
}

export function readAccountActivity(dataset: AccountingDataset, input: { accountId: string; dateFrom: string; dateTo: string; currency: string }) {
  validatePeriod(input.dateFrom, input.dateTo);
  const account = dataset.accounts.find((item) => item.id === input.accountId && item.currency === input.currency);
  if (!account) throw new Error('Account is missing or not configured for this currency.');
  const lines = dataset.lines.filter((line) => line.accountId === account.id && inPeriod(line, input.dateFrom, input.dateTo));
  validateLines(dataset.accounts, lines, input.currency);
  let debit = zero(input.currency); let credit = zero(input.currency);
  for (const line of lines) { debit = MoneyMath.add(debit, line.debit); credit = MoneyMath.add(credit, line.credit); }
  return { evidence: evidence(dataset.sourceSystem, input.dateTo, input.currency, input.dateFrom), account, lines, totals: { debit, credit } };
}

function dayDifference(later: string, earlier: string): number {
  return Math.floor((Date.parse(`${later}T00:00:00.000Z`) - Date.parse(`${earlier}T00:00:00.000Z`)) / 86_400_000);
}

export function calculateAgedBalances(dataset: AccountingDataset, input: { kind: 'payable' | 'receivable'; asOf: string; currency: string }) {
  validatePeriod(undefined, input.asOf);
  const relevant = dataset.openBalances.filter((item) => item.kind === input.kind && item.amount.currency === input.currency);
  const buckets = { current: zero(input.currency), days1to30: zero(input.currency), days31to60: zero(input.currency), days61to90: zero(input.currency), over90: zero(input.currency) };
  const rows = relevant.map((item) => {
    const daysPastDue = Math.max(0, dayDifference(input.asOf, item.dueDate));
    const bucket = daysPastDue === 0 ? 'current' : daysPastDue <= 30 ? 'days1to30' : daysPastDue <= 60 ? 'days31to60' : daysPastDue <= 90 ? 'days61to90' : 'over90';
    buckets[bucket] = MoneyMath.add(buckets[bucket], item.amount);
    return { ...item, daysPastDue, bucket };
  });
  return { evidence: evidence(dataset.sourceSystem, input.asOf, input.currency), rows, buckets };
}

export function calculateFinancialStatement(dataset: AccountingDataset, input: { kind: 'profit_and_loss' | 'balance_sheet' | 'cash_flow'; dateFrom: string; dateTo: string; currency: string }) {
  validatePeriod(input.dateFrom, input.dateTo);
  if (input.kind === 'cash_flow') throw new Error('Cash flow mapping is not configured for this workspace.');
  const accounts = dataset.accounts.filter((account) => account.currency === input.currency);
  const lines = dataset.lines.filter((line) => line.date <= input.dateTo && (input.kind === 'balance_sheet' || line.date >= input.dateFrom));
  validateLines(accounts, lines, input.currency);
  const rows = accounts.filter((account) => input.kind === 'balance_sheet' ? ['asset', 'liability', 'equity'].includes(account.type) : ['income', 'expense'].includes(account.type)).map((account) => {
    let debit = zero(input.currency); let credit = zero(input.currency);
    for (const line of lines.filter((item) => item.accountId === account.id)) { debit = MoneyMath.add(debit, line.debit); credit = MoneyMath.add(credit, line.credit); }
    const creditNormal = account.type === 'income' || account.type === 'liability' || account.type === 'equity';
    const balance = creditNormal ? MoneyMath.subtract(credit, debit) : MoneyMath.subtract(debit, credit);
    return { accountId: account.id, code: account.code, name: account.name, type: account.type, balance };
  });
  let total = zero(input.currency);
  for (const row of rows) {
    const signedBalance = input.kind === 'profit_and_loss' && row.type === 'expense'
      ? MoneyMath.subtract(zero(input.currency), row.balance)
      : row.balance;
    total = MoneyMath.add(total, signedBalance);
  }
  const evidenceRecord = evidence(dataset.sourceSystem, input.dateTo, input.currency, input.dateFrom);
  if (input.kind === 'balance_sheet') evidenceRecord.warnings.push('balance_sheet_rollup_requires_company_specific_retained_earnings_mapping');
  return { evidence: evidenceRecord, rows, total };
}
