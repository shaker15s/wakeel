import { describe, expect, it } from 'vitest';
import { MoneyMath, createMoney, currencyScale } from '@/server/accounting/money';

describe('MoneyMath', () => {
  it('uses exact decimal arithmetic for additions and line multiplication', () => {
    expect(MoneyMath.add(createMoney('0.1', 'USD'), createMoney('0.2', 'USD'))).toEqual({ amount: '0.30', currency: 'USD', scale: 2 });
    expect(MoneyMath.multiply(createMoney('12.35', 'EGP'), '3', 2)).toEqual({ amount: '37.05', currency: 'EGP', scale: 2 });
  });

  it('rounds half away from zero at the requested currency scale', () => {
    expect(MoneyMath.multiply(createMoney('1.005', 'USD', 3), '1', 2)).toEqual({ amount: '1.01', currency: 'USD', scale: 2 });
    expect(MoneyMath.multiply(createMoney('-1.005', 'USD', 3), '1', 2)).toEqual({ amount: '-1.01', currency: 'USD', scale: 2 });
  });

  it('compares and subtracts without floating-point drift', () => {
    expect(MoneyMath.compare(createMoney('0.30', 'USD'), createMoney('0.1', 'USD'))).toBe(1);
    expect(MoneyMath.subtract(createMoney('0.30', 'USD'), createMoney('0.10', 'USD'))).toEqual({ amount: '0.20', currency: 'USD', scale: 2 });
  });

  it('uses known ISO currency scales and refuses unknown or invalid values', () => {
    expect(currencyScale('JPY')).toBe(0);
    expect(currencyScale('KWD')).toBe(3);
    expect(() => currencyScale('XYZ')).toThrow();
    expect(() => createMoney('1.001', 'USD')).toThrow();
    expect(() => createMoney('1e3', 'USD')).toThrow();
  });
});
