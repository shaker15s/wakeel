import { createMoney, currencyScale, Money, MoneyMath } from './money';

export interface AssetInput { assetId: string; inServiceDate: string; cost: Money; residualValue: Money; usefulLifeMonths: number; method: 'straight_line' | 'declining_balance'; }
export interface AssetPolicy { method: 'straight_line'; maxUsefulLifeMonths: number; configured: true; }

function monthEndDate(start: string, offset: number): string {
  const [year, month, day] = start.split('-').map(Number);
  const absoluteMonth = year * 12 + month - 1 + offset;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = absoluteMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function minorUnits(value: Money): bigint {
  return BigInt(value.amount.replace('.', ''));
}

export function calculateAssetSchedule(input: AssetInput, policy: AssetPolicy | null) {
  const review = (reason: string) => ({ status: 'review_required' as const, reason });
  try {
    if (!policy?.configured) return review('depreciation_policy_missing');
    if (policy.method !== input.method || input.method !== 'straight_line') return review('depreciation_method_not_configured');
    if (!Number.isInteger(input.usefulLifeMonths) || input.usefulLifeMonths < 1 || input.usefulLifeMonths > policy.maxUsefulLifeMonths) return review('useful_life_outside_policy');
    if (!input.assetId.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.inServiceDate) || new Date(`${input.inServiceDate}T00:00:00Z`).toISOString().slice(0, 10) !== input.inServiceDate) return review('asset_identity_or_date_invalid');
    const scale = currencyScale(input.cost.currency);
    if (input.cost.scale !== scale || input.residualValue.currency !== input.cost.currency || input.residualValue.scale !== scale) return review('asset_currency_or_scale_mismatch');
    const zero = createMoney('0', input.cost.currency);
    if (MoneyMath.compare(input.cost, zero) <= 0 || MoneyMath.compare(input.residualValue, zero) < 0 || MoneyMath.compare(input.residualValue, input.cost) > 0) return review('asset_cost_or_residual_invalid');
    const depreciable = minorUnits(MoneyMath.subtract(input.cost, input.residualValue));
    const count = BigInt(input.usefulLifeMonths);
    const quotient = depreciable / count;
    const remainder = depreciable % count;
    const periods = Array.from({ length: input.usefulLifeMonths }, (_, index) => {
    const amount = quotient + (BigInt(index) < remainder ? BigInt(1) : BigInt(0));
      const fixed = amount.toString().padStart(scale + 1, '0');
      const formatted = scale ? `${fixed.slice(0, -scale)}.${fixed.slice(-scale)}` : fixed;
      return { period: index + 1, date: monthEndDate(input.inServiceDate, index), depreciation: createMoney(formatted, input.cost.currency) };
    });
    return { status: 'calculated' as const, assetId: input.assetId, method: 'straight_line' as const, currency: input.cost.currency, periods, totalDepreciation: MoneyMath.subtract(input.cost, input.residualValue), residualValue: input.residualValue, posted: false as const, evidence: { calculationVersion: 'wakeel-asset-v1', warnings: [] as string[] } };
  } catch (error) {
    return review(error instanceof Error ? error.message : 'asset_calculation_requires_review');
  }
}
