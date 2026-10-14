import { Money, MoneyMath, createMoney } from './money';

export interface BankStatementLine { id: string; date: string; amount: Money; description: string; reference: string | null; }
export interface AccountingMatchCandidate { id: string; date: string; amount: Money; description: string; reference: string | null; }
export interface ReconciliationPolicy { maxDateDifferenceDays: number; nearAmountTolerance: Money; minimumScore: number; }
export interface MatchProposal { statementLineId: string; candidateRecordId: string | null; score: number; scoreFactors: string[]; amountDifference: Money | null; status: 'proposed' | 'review_required'; }

function dateDiffDays(a: string, b: string): number {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid(a) || !valid(b)) throw new Error('Reconciliation dates must be valid YYYY-MM-DD calendar dates.');
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

function absoluteDifference(a: Money, b: Money): Money {
  const difference = MoneyMath.subtract(a, b);
  return createMoney(difference.amount.startsWith('-') ? difference.amount.slice(1) : difference.amount, difference.currency, difference.scale);
}

export function proposeBankMatches(
  statementLines: BankStatementLine[], ledgerItems: AccountingMatchCandidate[], policy: ReconciliationPolicy,
): MatchProposal[] {
  if (!Number.isInteger(policy.maxDateDifferenceDays) || policy.maxDateDifferenceDays < 0 || policy.maxDateDifferenceDays > 365) throw new Error('Date matching policy is invalid.');
  if (!Number.isInteger(policy.minimumScore) || policy.minimumScore < 0 || policy.minimumScore > 100) throw new Error('Match score threshold is invalid.');
  const statementCounts = new Map<string, number>();
  for (const row of statementLines) statementCounts.set(`${row.date}|${row.amount.currency}|${row.amount.amount}|${row.reference ?? ''}`, (statementCounts.get(`${row.date}|${row.amount.currency}|${row.amount.amount}|${row.reference ?? ''}`) ?? 0) + 1);
  const ranked = statementLines.map((line) => {
    const choices = ledgerItems.map((candidate) => {
      const factors: string[] = [];
      let score = 0;
      let difference: Money | null = null;
      if (candidate.amount.currency !== line.amount.currency || candidate.amount.scale !== line.amount.scale) {
        factors.push('currency_mismatch');
      } else {
        difference = absoluteDifference(line.amount, candidate.amount);
        if (MoneyMath.compare(difference, createMoney('0', line.amount.currency)) === 0) { score += 45; factors.push('exact_amount'); }
        else if (MoneyMath.compare(difference, policy.nearAmountTolerance) <= 0) { score += 20; factors.push('near_amount'); }
        else factors.push('amount_outside_tolerance');
      }
      const referenceMatches = !!line.reference && !!candidate.reference && line.reference.trim().toLowerCase() === candidate.reference.trim().toLowerCase();
      if (referenceMatches) { score += 35; factors.push('exact_reference'); }
      const days = dateDiffDays(line.date, candidate.date);
      if (days === 0) { score += 20; factors.push('same_date'); }
      else if (days <= policy.maxDateDifferenceDays) { score += 10; factors.push('date_within_policy'); }
      else factors.push('date_outside_policy');
      if (line.description.trim().toLowerCase() === candidate.description.trim().toLowerCase()) { score += 10; factors.push('description_match'); }
      return { candidate, score, factors, difference, days };
    }).sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));
    return { line, choices };
  });
  const bestCounts = new Map<string, number>();
  for (const entry of ranked) {
    const best = entry.choices[0];
    if (best && best.score > 0) bestCounts.set(best.candidate.id, (bestCounts.get(best.candidate.id) ?? 0) + 1);
  }
  return ranked.map(({ line, choices }) => {
    const best = choices[0];
    if (!best || best.score === 0) return { statementLineId: line.id, candidateRecordId: null, score: 0, scoreFactors: ['no_candidate'], amountDifference: null, status: 'review_required' as const };
    const tie = choices[1]?.score === best.score;
    const duplicateStatement = (statementCounts.get(`${line.date}|${line.amount.currency}|${line.amount.amount}|${line.reference ?? ''}`) ?? 0) > 1;
    const exactEvidence = best.factors.includes('exact_amount') && best.factors.includes('exact_reference') && !best.factors.includes('date_outside_policy');
    const unambiguous = !tie && !duplicateStatement && bestCounts.get(best.candidate.id) === 1;
    const status = exactEvidence && unambiguous && best.score >= policy.minimumScore ? 'proposed' : 'review_required';
    const factors = [...best.factors];
    if (tie) factors.push('ambiguous_candidate_tie');
    if (duplicateStatement) factors.push('duplicate_statement_line');
    if (!unambiguous && !tie && !duplicateStatement) factors.push('candidate_also_matches_another_line');
    return { statementLineId: line.id, candidateRecordId: best.candidate.id, score: best.score, scoreFactors: factors, amountDifference: best.difference, status };
  });
}
