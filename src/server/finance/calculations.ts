import { z } from "zod";
import { FinanceError } from "./types";
const amount = z.union([z.number().finite(), z.string().max(30)]);
export function cents(value: number | string): bigint {
  const text = String(value)
    .trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace("٫", ".");
  if (!/^-?\d{1,13}(\.\d{1,2})?$/.test(text))
    throw new FinanceError(
      "الحسابات تدعم أرقامًا محددة حتى منزلتين عشريتين؛ لا نقرب مدخلات مالية صامتًا.",
    );
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  return (
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) *
    (text.startsWith("-") ? -1n : 1n)
  );
}
function divideRounded(n: bigint, d: bigint) {
  if (!d) throw new FinanceError("لا يمكن القسمة على صفر.");
  const negative = n < 0n !== d < 0n;
  n = n < 0n ? -n : n;
  d = d < 0n ? -d : d;
  const result = (n + d / 2n) / d;
  return negative ? -result : result;
}
export function decimal(n: bigint) {
  const negative = n < 0n;
  n = negative ? -n : n;
  return `${negative ? "-" : ""}${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
}
export function calculate(raw: unknown) {
  const input = z
    .object({
      operation: z.enum([
        "sum",
        "subtract",
        "multiply",
        "divide",
        "percentage_change",
      ]),
      values: z.array(amount).min(1).max(200),
    })
    .parse(raw);
  const values = input.values.map(cents);
  let result: bigint;
  if (input.operation !== "sum" && values.length !== 2)
    throw new FinanceError("هذه العملية تحتاج قيمتين بالضبط.");
  switch (input.operation) {
    case "sum":
      result = values.reduce((n, v) => n + v, 0n);
      break;
    case "subtract":
      result = values[0] - values[1];
      break;
    case "multiply":
      result = divideRounded(values[0] * values[1], 100n);
      break;
    case "divide":
      result = divideRounded(values[0] * 100n, values[1]);
      break;
    case "percentage_change":
      result = divideRounded(
        (values[1] - values[0]) * 10000n,
        values[0] < 0n ? -values[0] : values[0],
      );
      break;
  }
  return {
    value: decimal(result),
    operation: input.operation,
    inputs: values.map(decimal),
    formula:
      input.operation === "percentage_change"
        ? `(${decimal(values[1])} - ${decimal(values[0])}) / abs(${decimal(values[0])}) × 100`
        : values.map(decimal).join(
            {
              sum: " + ",
              subtract: " - ",
              multiply: " × ",
              divide: " ÷ ",
              percentage_change: "",
            }[input.operation],
          ),
    rounding: "half-away-from-zero, 2 decimals",
    source: "deterministic-calculator",
  };
}
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      Number.isFinite(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    "Invalid date",
  );
export function ageing(raw: unknown) {
  const input = z
    .object({
      asOf: isoDate,
      rows: z
        .array(
          z.object({
            amount_residual: amount,
            invoice_date_due: z.union([isoDate, z.literal(false), z.null()]),
            currency_id: z.tuple([
              z.number().int().positive(),
              z.string().min(1),
            ]),
          }),
        )
        .max(200),
    })
    .parse(raw);
  const groups = new Map<
    number,
    {
      currency: string;
      not_due: bigint;
      days_1_30: bigint;
      days_31_60: bigint;
      days_61_90: bigint;
      over_90: bigint;
      undated: bigint;
      total: bigint;
    }
  >();
  let missingDates = 0;
  for (const row of input.rows) {
    const [id, currency] = row.currency_id;
    let g = groups.get(id);
    if (!g) {
      g = {
        currency,
        not_due: 0n,
        days_1_30: 0n,
        days_31_60: 0n,
        days_61_90: 0n,
        over_90: 0n,
        undated: 0n,
        total: 0n,
      };
      groups.set(id, g);
    }
    const value = cents(row.amount_residual);
    g.total += value;
    if (!row.invoice_date_due) {
      g.undated += value;
      missingDates++;
      continue;
    }
    const days = Math.floor(
      (Date.parse(input.asOf) - Date.parse(row.invoice_date_due)) / 86400000,
    );
    const bucket =
      days <= 0
        ? "not_due"
        : days <= 30
          ? "days_1_30"
          : days <= 60
            ? "days_31_60"
            : days <= 90
              ? "days_61_90"
              : "over_90";
    g[bucket] += value;
  }
  return {
    asOf: input.asOf,
    processed: input.rows.length,
    missingDates,
    currencyGroups: [...groups.entries()].map(([currencyId, g]) => ({
      currencyId,
      ...Object.fromEntries(
        Object.entries(g).map(([key, v]) => [
          key,
          typeof v === "bigint" ? decimal(v) : v,
        ]),
      ),
    })),
    source: "deterministic-ageing",
    scope: "Only the supplied rows; no currency conversion or extrapolation",
  };
}

/** Strict CSV reader for financial aggregation: no silent padding/truncation. */
export function strictCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const flush = () => {
    row.push(cell);
    cell = "";
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed)
        throw new FinanceError("CSV غير صالح: علامات اقتباس غير متوقعة.");
      quoted = true;
    } else if (c === ",") flush();
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      flush();
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else {
      if (closed) throw new FinanceError("CSV غير صالح بعد إغلاق الاقتباس.");
      cell += c;
    }
  }
  if (quoted) throw new FinanceError("CSV يحتوي حقلًا غير مغلق.");
  if (cell || row.length || closed) {
    flush();
    rows.push(row);
  }
  if (!rows.length || rows.length > 5001 || rows[0].length > 50)
    throw new FinanceError("يدعم التحليل حتى ٥٠٠٠ صف و٥٠ عمود.");
  if (
    rows.some((r) => r.length !== rows[0].length) ||
    new Set(rows[0]).size !== rows[0].length ||
    rows[0].some((h) => !h)
  )
    throw new FinanceError("عدد أعمدة CSV غير متسق أو العناوين مكررة/فارغة.");
  return rows;
}
export function tableSummary(
  content: string,
  input: { valueColumn: string; currencyColumn: string; groupColumn?: string },
) {
  const [headers, ...rows] = strictCsv(content);
  const value = headers.indexOf(input.valueColumn),
    currency = headers.indexOf(input.currencyColumn),
    group = input.groupColumn ? headers.indexOf(input.groupColumn) : -1;
  if (value < 0 || currency < 0 || (input.groupColumn && group < 0))
    throw new FinanceError(
      "اسم عمود غير موجود. اقرأ عناوين الملف قبل طلب التجميع.",
    );
  const buckets = new Map<
    string,
    { currency: string; group: string; total: bigint; count: number }
  >();
  for (const row of rows) {
    const curr = row[currency].trim();
    if (!curr)
      throw new FinanceError(
        "العملة مفقودة في أحد الصفوف. لا يمكن جمع عملات غير محددة.",
      );
    const category = group >= 0 ? row[group] : "all";
    const key = JSON.stringify([curr, category]);
    const b = buckets.get(key) ?? {
      currency: curr,
      group: category,
      total: 0n,
      count: 0,
    };
    b.total += cents(row[value]);
    b.count++;
    buckets.set(key, b);
  }
  return {
    rowCount: rows.length,
    groups: [...buckets.values()].map((b) => ({
      ...b,
      total: decimal(b.total),
    })),
    source: "strict-csv-decimal-aggregation",
    columns: input,
  };
}

export function aggregate(raw: unknown) {
  const p = z
    .object({
      rows: z.array(z.record(z.string(), z.unknown())).max(200),
      valueFields: z.array(z.string().min(1).max(60)).min(1).max(5),
      currencyField: z.string().min(1),
      groupBy: z.array(z.string().min(1).max(60)).max(3).default([]),
    })
    .parse(raw);
  if (
    p.valueFields.some((f) => ["debit", "credit", "balance"].includes(f)) &&
    p.currencyField !== "company_currency_id"
  )
    throw new FinanceError(
      "المدين والدائن والرصيد في Odoo بعملة الشركة، لا عملة المعاملة. استخدم company_currency_id.",
    );
  const get = (row: Record<string, unknown>, field: string) => {
    if (
      ["__proto__", "constructor", "prototype"].includes(field) ||
      !Object.hasOwn(row, field)
    )
      throw new FinanceError("حقل التجميع غير موجود في السجلات.");
    return row[field];
  };
  const buckets = new Map<
    string,
    {
      currency: unknown;
      group: unknown[];
      count: number;
      totals: Record<string, bigint>;
    }
  >();
  for (const row of p.rows) {
    const currency = get(row, p.currencyField);
    if (!currency || (typeof currency === "object" && !Array.isArray(currency)))
      throw new FinanceError("عملة السجل غير محددة.");
    const group = p.groupBy.map((field) => get(row, field)),
      key = JSON.stringify([currency, ...group]);
    const b = buckets.get(key) ?? {
      currency,
      group,
      count: 0,
      totals: Object.fromEntries(p.valueFields.map((f) => [f, 0n])),
    };
    for (const field of p.valueFields) {
      const value = get(row, field);
      if (typeof value !== "number" && typeof value !== "string")
        throw new FinanceError("قيمة مالية غير رقمية.");
      b.totals[field] += cents(value);
    }
    b.count++;
    buckets.set(key, b);
  }
  return {
    processed: p.rows.length,
    groups: [...buckets.values()].map((b) => ({
      ...b,
      totals: Object.fromEntries(
        Object.entries(b.totals).map(([k, v]) => [k, decimal(v)]),
      ),
    })),
    source: "deterministic-row-aggregation",
    scope: "Only supplied rows; distinct currencies never combined",
  };
}
