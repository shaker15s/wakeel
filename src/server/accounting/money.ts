export interface Money {
  /** Decimal text, fixed to `scale` places. Never a JS floating-point number. */
  amount: string;
  currency: string;
  scale: number;
}

const CURRENCY_SCALES: Readonly<Record<string, number>> = Object.freeze({
  AED: 2, AUD: 2, BHD: 3, CAD: 2, CHF: 2, EGP: 2, EUR: 2, GBP: 2,
  JPY: 0, KWD: 3, OMR: 3, QAR: 2, SAR: 2, USD: 2,
});

const MAX_SCALE = 12;
const DECIMAL = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/;

export function currencyScale(currency: string): number {
  const normalized = currency.trim().toUpperCase();
  const scale = CURRENCY_SCALES[normalized];
  if (scale === undefined) throw new Error(`Unknown currency scale: ${normalized || '(empty)'}`);
  return scale;
}

function parseDecimal(value: string, maximumScale = MAX_SCALE): { coefficient: bigint; scale: number } {
  if (typeof value !== 'string' || value.length > 80) throw new Error('Amount must be a bounded decimal string.');
  const match = DECIMAL.exec(value);
  if (!match) throw new Error('Amount must be a plain decimal string without exponent notation.');
  const fraction = match[3] ?? '';
  if (fraction.length > maximumScale) throw new Error(`Amount supports at most ${maximumScale} decimal places.`);
  const digits = `${match[2]}${fraction}`;
  const coefficient = BigInt(digits) * (match[1] === '-' ? BigInt(-1) : BigInt(1));
  return { coefficient, scale: fraction.length };
}

function format(coefficient: bigint, scale: number): string {
  const negative = coefficient < BigInt(0);
  const digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, '0');
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? '' : `.${digits.slice(-scale)}`;
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

function toScale(coefficient: bigint, from: number, to: number): bigint {
  if (to >= from) return coefficient * BigInt(10) ** BigInt(to - from);
  const divisor = BigInt(10) ** BigInt(from - to);
  const quotient = coefficient / divisor;
  const remainder = coefficient % divisor;
  if ((remainder < BigInt(0) ? -remainder : remainder) * BigInt(2) >= divisor) return quotient + (coefficient < BigInt(0) ? BigInt(-1) : BigInt(1));
  return quotient;
}

export function createMoney(amount: string, currency: string, scale = currencyScale(currency)): Money {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) throw new Error('Money scale is invalid.');
  const normalizedCurrency = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) throw new Error('Currency must be a three-letter code.');
  const parsed = parseDecimal(amount, scale);
  return { amount: format(toScale(parsed.coefficient, parsed.scale, scale), scale), currency: normalizedCurrency, scale };
}

function assertCompatible(a: Money, b: Money): void {
  if (a.currency !== b.currency || a.scale !== b.scale) throw new Error('Money currency and scale must match.');
  // Validate boundary objects too; callers may have received them from persistence or a connector.
  if (createMoney(a.amount, a.currency, a.scale).amount !== a.amount || createMoney(b.amount, b.currency, b.scale).amount !== b.amount) {
    throw new Error('Money amount is not canonical for its scale.');
  }
}

function coefficient(money: Money): bigint {
  const parsed = parseDecimal(money.amount, money.scale);
  if (parsed.scale !== money.scale) throw new Error('Money amount must use its declared scale.');
  return parsed.coefficient;
}

export const MoneyMath = Object.freeze({
  add(a: Money, b: Money): Money {
    assertCompatible(a, b);
    return { ...a, amount: format(coefficient(a) + coefficient(b), a.scale) };
  },
  subtract(a: Money, b: Money): Money {
    assertCompatible(a, b);
    return { ...a, amount: format(coefficient(a) - coefficient(b), a.scale) };
  },
  multiply(a: Money, quantity: string, resultScale: number): Money {
    const amount = coefficient(a);
    const factor = parseDecimal(quantity);
    if (!Number.isInteger(resultScale) || resultScale < 0 || resultScale > MAX_SCALE) throw new Error('Result scale is invalid.');
    return { currency: a.currency, scale: resultScale, amount: format(toScale(amount * factor.coefficient, a.scale + factor.scale, resultScale), resultScale) };
  },
  compare(a: Money, b: Money): -1 | 0 | 1 {
    assertCompatible(a, b);
    const left = coefficient(a); const right = coefficient(b);
    return left < right ? -1 : left > right ? 1 : 0;
  },
});
