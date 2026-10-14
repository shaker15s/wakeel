import { describe, expect, it } from 'vitest';
import { createMoney } from '@/server/accounting/money';
import { calculateAssetSchedule } from '@/server/accounting/fixed-assets';

describe('fixed asset schedule', () => {
  const input = { assetId: 'asset-1', inServiceDate: '2026-01-31', cost: createMoney('100.00', 'USD'), residualValue: createMoney('0.00', 'USD'), usefulLifeMonths: 3, method: 'straight_line' as const };
  it('allocates exact minor units and puts each period on a valid month-end', () => {
    const result = calculateAssetSchedule(input, { method: 'straight_line', maxUsefulLifeMonths: 120, configured: true });
    expect(result.status).toBe('calculated');
    if (result.status !== 'calculated') throw new Error(result.reason);
    expect(result.periods.map((period) => period.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(result.periods.reduce((sum, period) => sum + Number(period.depreciation.amount), 0)).toBeCloseTo(100, 8);
  });
  it('requires review for unsupported/unknown policy, invalid life and inconsistent currencies', () => {
    expect(calculateAssetSchedule(input, null).status).toBe('review_required');
    expect(calculateAssetSchedule({ ...input, method: 'declining_balance' as const }, { method: 'straight_line', maxUsefulLifeMonths: 120, configured: true }).status).toBe('review_required');
    expect(calculateAssetSchedule({ ...input, usefulLifeMonths: 0 }, { method: 'straight_line', maxUsefulLifeMonths: 120, configured: true }).status).toBe('review_required');
    expect(calculateAssetSchedule({ ...input, residualValue: createMoney('0', 'EUR') }, { method: 'straight_line', maxUsefulLifeMonths: 120, configured: true }).status).toBe('review_required');
  });
});
