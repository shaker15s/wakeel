import { createMoney, Money, MoneyMath } from './money';

export interface ExpenseInput { date: string; amount: Money; description: string; category: string; receiptPresent: boolean; }
export interface ExpensePolicy { allowedCategories: string[]; receiptRequired: boolean; maxAmount: Money; openPeriod: { dateFrom: string; dateTo: string }; taxConfigured: boolean; taxRuleId?: string; }

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try { return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value; } catch { return false; }
}

export function assessExpense(input: ExpenseInput, policy: ExpensePolicy | null) {
  const reasons: string[] = [];
  if (!policy) return { status: 'review_required' as const, reasons: ['expense_policy_missing'], taxTreatment: { status: 'review_required' as const } };
  if (!validDate(input.date) || !validDate(policy.openPeriod.dateFrom) || !validDate(policy.openPeriod.dateTo) || policy.openPeriod.dateFrom > policy.openPeriod.dateTo || input.date < policy.openPeriod.dateFrom || input.date > policy.openPeriod.dateTo) reasons.push('date_outside_open_period');
  if (!input.description.trim() || input.description.length > 500) reasons.push('description_missing_or_invalid');
  if (!policy.allowedCategories.includes(input.category)) reasons.push('category_not_configured');
  if (policy.receiptRequired && !input.receiptPresent) reasons.push('receipt_missing');
  try {
    if (MoneyMath.compare(input.amount, createMoney('0', input.amount.currency)) <= 0) reasons.push('amount_must_be_positive');
    if (MoneyMath.compare(input.amount, policy.maxAmount) > 0) reasons.push('amount_exceeds_policy_limit');
  } catch { reasons.push('currency_or_amount_policy_mismatch'); }
  if (!policy.taxConfigured || !policy.taxRuleId?.trim()) reasons.push('tax_treatment_not_configured');
  return {
    status: reasons.length === 0 ? 'draft_eligible' as const : 'review_required' as const,
    reasons,
    taxTreatment: policy.taxConfigured && policy.taxRuleId?.trim() ? { status: 'configured' as const, ruleId: policy.taxRuleId.trim() } : { status: 'review_required' as const },
  };
}
