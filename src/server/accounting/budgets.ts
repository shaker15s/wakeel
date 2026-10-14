import { Money, MoneyMath } from './money';

export interface BudgetContext { period: string; costCenter?: string; }

export function calculateBudgetVariance(actual: Money, budget: Money, context: BudgetContext) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(context.period)) return { status: 'review_required' as const, reason: 'budget_period_invalid', variance: null, varianceBasisPoints: null };
  try {
    const variance = MoneyMath.subtract(actual, budget);
    const zero = { ...actual, amount: `0.${'0'.repeat(actual.scale)}` };
    if (MoneyMath.compare(actual, zero) < 0 || MoneyMath.compare(budget, zero) < 0) return { status: 'review_required' as const, reason: 'negative_actual_or_budget', variance: null, varianceBasisPoints: null };
    const budgetMinor = BigInt(budget.amount.replace('.', ''));
    const varianceMinor = BigInt(variance.amount.replace('.', ''));
    const bps = budgetMinor === BigInt(0) ? null : (varianceMinor * BigInt(10_000) / (budgetMinor < BigInt(0) ? -budgetMinor : budgetMinor)).toString();
    return { status: budgetMinor === BigInt(0) && varianceMinor !== BigInt(0) ? 'review_required' as const : varianceMinor > BigInt(0) ? 'over_budget' as const : varianceMinor < BigInt(0) ? 'under_budget' as const : 'on_budget' as const, context, actual, budget, variance, varianceBasisPoints: bps, evidence: { calculationVersion: 'wakeel-budget-v1', warnings: bps === null ? ['percentage_unavailable_for_zero_budget'] : [] } };
  } catch {
    return { status: 'review_required' as const, reason: 'currency_or_scale_mismatch', variance: null, varianceBasisPoints: null };
  }
}

export type CloseControl = 'bankReconciled' | 'subledgersReconciled' | 'trialBalanceBalanced' | 'taxReviewed';
export function buildPeriodCloseChecklist(period: string, controls: Record<CloseControl, boolean | null>) {
  const items = Object.entries(controls).map(([control, passed]) => ({ control, status: passed === true ? 'complete' as const : passed === false ? 'blocked' as const : 'review_required' as const }));
  const validPeriod = /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
  return { period, items, status: !validPeriod || items.some((item) => item.status !== 'complete') ? 'review_required' as const : 'ready_for_human_close_review' as const, postingEnabled: false as const };
}
