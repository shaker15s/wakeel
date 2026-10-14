import { z } from "zod";
import { cents, decimal, strictCsv } from "./calculations";
import { FinanceError } from "./types";
import type { FinanceStore } from "./store";

const column = z.string().trim().min(1).max(180);
const source = z.object({ documentId: z.string().uuid() });
const moneyMapping = z.object({
  amount: column,
  currency: column,
  reference: column,
});
export const workpaperRequestSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("reconcile"),
    left: source.extend({ columns: moneyMapping }),
    right: source.extend({ columns: moneyMapping }),
  }),
  source.extend({
    operation: z.literal("ledger_check"),
    columns: z.object({
      entry: column,
      account: column,
      debit: column,
      credit: column,
      currency: column,
    }),
  }),
  source.extend({
    operation: z.literal("budget_variance"),
    columns: z.object({
      category: column,
      actual: column,
      budget: column,
      currency: column,
    }),
    direction: z.enum(["expense", "income"]),
  }),
]);
export type WorkpaperRequest = z.infer<typeof workpaperRequestSchema>;
export type Cell = string | number | boolean | null;
export interface PaperTable {
  title: string;
  columns: string[];
  rows: Cell[][];
  totalRows: number;
  truncated: boolean;
}
export interface Finding {
  severity: "error" | "warning";
  code: string;
  message: string;
  records: number[];
}
export interface Analysis {
  title: string;
  summary: string[];
  assessment: "review_required" | "no_exceptions_in_scope";
  tables: PaperTable[];
  findings: Finding[];
  findingCount: number;
  limitations: string[];
  counts: Record<string, number>;
}
export interface Workpaper {
  id: string;
  workspaceId: string;
  createdAt: string;
  engineVersion: "workpapers-v1";
  request: WorkpaperRequest;
  analysis: Analysis;
  sources: { id: string; title: string; hash: string }[];
}
function load(store: FinanceStore, workspace: string, id: string) {
  const doc = store.getDocument(workspace, id);
  if (!doc) throw new FinanceError("المصدر غير متاح في مساحة العمل.", 404);
  const [headers, ...rows] = strictCsv(doc.content);
  if (!rows.length)
    throw new FinanceError("الجدول يحتاج صف بيانات واحدًا على الأقل.");
  return { doc, headers, rows };
}
type Sheet = ReturnType<typeof load>;
function mapped(sheet: Sheet, columns: Record<string, string>) {
  if (new Set(Object.values(columns)).size !== Object.values(columns).length)
    throw new FinanceError(
      "كل حقل محاسبي يحتاج عمودًا مستقلًا؛ لا تستخدم نفس العمود مرتين.",
    );
  const indices = Object.fromEntries(
    Object.entries(columns).map(([key, name]) => {
      const at = sheet.headers.indexOf(name);
      if (at < 0) throw new FinanceError("العمود غير موجود في المصدر: " + name);
      return [key, at];
    }),
  );
  return sheet.rows.map((row, i) => ({
    record: i + 2,
    values: Object.fromEntries(
      Object.entries(indices).map(([key, at]) => [key, row[at].trim()]),
    ),
  }));
}
function currency(raw: string) {
  const v = raw.normalize("NFKC").trim().toUpperCase();
  if (!v || v.length > 20)
    throw new FinanceError("كل صف مالي يحتاج عملة صريحة، حتى ٢٠ حرفًا.");
  return v;
}
function table(title: string, columns: string[], rows: Cell[][]): PaperTable {
  return {
    title,
    columns,
    rows: rows.slice(0, 100),
    totalRows: rows.length,
    truncated: rows.length > 100,
  };
}
const limitations = [
  "الحسابات حتى منزلتين عشريتين؛ لا تحويل عملات أو استنتاج لعملة مفقودة.",
  "هذه فحوص على المصادر المختارة، وليست تدقيقًا قانونيًا أو إثبات احتيال أو مطابقة ERP كاملة.",
  "أرقام السجلات من CSV: سجل العنوان = 1، وليست أرقام الأسطر الفيزيائية عند وجود نص متعدد الأسطر.",
  "تفاصيل كل جدول محدودة بأول 100 نتيجة؛ الإجماليات والعدادات تشمل كل صفوف المصدر.",
];
function result(
  title: string,
  summary: string[],
  tables: PaperTable[],
  findings: Finding[],
  counts: Record<string, number>,
): Analysis {
  return {
    title,
    summary,
    tables,
    findings: findings.slice(0, 100),
    findingCount: findings.length,
    counts,
    assessment: findings.length ? "review_required" : "no_exceptions_in_scope",
    limitations,
  };
}
export function profileDocument(
  store: FinanceStore,
  workspace: string,
  id: string,
) {
  const s = load(store, workspace, id);
  const duplicates = new Map<string, number[]>();
  s.rows.forEach((r, i) => {
    const key = JSON.stringify(r);
    duplicates.set(key, [...(duplicates.get(key) ?? []), i + 2]);
  });
  return {
    documentId: s.doc.id,
    title: s.doc.title,
    hash: s.doc.hash,
    rowCount: s.rows.length,
    columns: s.headers.map((name, i) => ({
      name,
      blank: s.rows.filter((r) => !r[i].trim()).length,
      numeric: s.rows.filter((r) => {
        try {
          cents(r[i]);
          return true;
        } catch {
          return false;
        }
      }).length,
    })),
    preview: s.rows.slice(0, 8),
    duplicateGroups: [...duplicates.values()]
      .filter((g) => g.length > 1)
      .slice(0, 30),
    note: "Preview only. Duplicate rows are review candidates, not proven errors. Numeric classification does not imply a currency or business meaning.",
  };
}
function reconcile(
  left: Sheet,
  right: Sheet,
  p: Extract<WorkpaperRequest, { operation: "reconcile" }>,
): Analysis {
  type Item = {
    record: number;
    reference: string;
    amount: bigint;
    currency: string;
    side: "left" | "right";
  };
  const groups = new Map<string, { left: Item[]; right: Item[] }>();
  const sums = new Map<string, { left: bigint; right: bigint }>();
  for (const [sheet, mapping, side] of [
    [left, p.left.columns, "left"],
    [right, p.right.columns, "right"],
  ] as const) {
    for (const row of mapped(sheet, mapping)) {
      const cur = currency(row.values.currency),
        value = cents(row.values.amount),
        reference = row.values.reference.normalize("NFKC").trim();
      const bucket = sums.get(cur) ?? { left: 0n, right: 0n };
      bucket[side] += value;
      sums.set(cur, bucket);
      // Empty references NEVER match. Sign and exact reference are preserved.
      const key = reference
        ? JSON.stringify([cur, decimal(value), reference])
        : JSON.stringify(["missing", side, row.record]);
      const g = groups.get(key) ?? { left: [], right: [] };
      g[side].push({
        record: row.record,
        reference,
        amount: value,
        currency: cur,
        side,
      });
      groups.set(key, g);
    }
  }
  const matches: Cell[][] = [],
    unmatched: Cell[][] = [],
    ambiguous: Cell[][] = [],
    findings: Finding[] = [];
  let unmatchedLeft = 0,
    unmatchedRight = 0,
    ambiguousLeft = 0,
    ambiguousRight = 0;
  for (const g of groups.values()) {
    if (g.left.length === 1 && g.right.length === 1) {
      const l = g.left[0];
      matches.push([
        l.record,
        g.right[0].record,
        l.reference,
        l.currency,
        decimal(l.amount),
      ]);
    } else if (g.left.length && g.right.length) {
      ambiguousLeft += g.left.length;
      ambiguousRight += g.right.length;
      const item = g.left[0];
      ambiguous.push([
        item.reference,
        item.currency,
        decimal(item.amount),
        g.left.map((r) => r.record).join(", "),
        g.right.map((r) => r.record).join(", "),
      ]);
      findings.push({
        severity: "warning",
        code: "ambiguous_match",
        message: "مرجع ومبلغ مكرران؛ لا يمكن اختيار تطابق واحد آليًا.",
        records: [...g.left, ...g.right].map((r) => r.record),
      });
    } else
      for (const item of [...g.left, ...g.right]) {
        if (item.side === "left") unmatchedLeft++;
        else unmatchedRight++;
        unmatched.push([
          item.side === "left" ? "المصدر الأول" : "المصدر الثاني",
          item.record,
          item.reference,
          item.currency,
          decimal(item.amount),
          item.reference ? "لا مقابل مطابق" : "مرجع مفقود",
        ]);
        findings.push({
          severity: "warning",
          code: item.reference ? "unmatched" : "missing_reference",
          message:
            (item.side === "left" ? "المصدر الأول" : "المصدر الثاني") +
            ": سجل غير مطابق، يحتاج مراجعة.",
          records: [item.record],
        });
      }
  }
  return result(
    "ورقة مطابقة مصدرين",
    [
      `مطابقات فريدة: ${matches.length}. المطابقة بالمرجع الحرفي والمبلغ الموقّع والعملة.`,
      `غير مطابق: ${unmatchedLeft + unmatchedRight} سجل. ملتبس: ${ambiguousLeft + ambiguousRight} سجل. لا حسم آلي للالتباس.`,
      `لم تُكتب أي تسوية في ERP. تساوي الإجمالي وحده لا يثبت المطابقة.`,
    ],
    [
      table(
        "إجماليات المصدرين حسب العملة",
        ["العملة", "المصدر الأول", "المصدر الثاني", "الفرق: الأول − الثاني"],
        [...sums].map(([c, v]) => [
          c,
          decimal(v.left),
          decimal(v.right),
          decimal(v.left - v.right),
        ]),
      ),
      table(
        "المطابقات الفريدة",
        ["سجل الأول", "سجل الثاني", "المرجع", "العملة", "المبلغ"],
        matches,
      ),
      table(
        "سجلات غير مطابقة",
        ["المصدر", "السجل", "المرجع", "العملة", "المبلغ", "السبب"],
        unmatched,
      ),
      table(
        "مطابقات ملتبسة",
        ["المرجع", "العملة", "المبلغ", "سجلات الأول", "سجلات الثاني"],
        ambiguous,
      ),
    ],
    findings,
    {
      leftRows: left.rows.length,
      rightRows: right.rows.length,
      matchedPairs: matches.length,
      unmatchedLeft,
      unmatchedRight,
      ambiguousLeft,
      ambiguousRight,
    },
  );
}
function ledger(
  sheet: Sheet,
  p: Extract<WorkpaperRequest, { operation: "ledger_check" }>,
): Analysis {
  const accounts = new Map<
    string,
    { account: string; currency: string; debit: bigint; credit: bigint }
  >();
  const entries = new Map<
    string,
    {
      entry: string;
      currency: string;
      debit: bigint;
      credit: bigint;
      records: number[];
    }
  >();
  const seen = new Map<string, number>();
  const findings: Finding[] = [];
  let validRows = 0,
    invalidRows = 0;
  for (const row of mapped(sheet, p.columns)) {
    const v = row.values;
    try {
      if (!v.entry || !v.account || (!v.debit && !v.credit))
        throw new FinanceError("القيد والحساب وقيمة مالية صريحة مطلوبة.");
      const c = currency(v.currency),
        d = cents(v.debit || "0"),
        cr = cents(v.credit || "0");
      if (d < 0n || cr < 0n || (d > 0n && cr > 0n) || (d === 0n && cr === 0n))
        throw new FinanceError("يلزم مدين أو دائن موجب واحد فقط.");
      validRows++;
      const key = JSON.stringify([
        v.entry,
        v.account,
        decimal(d),
        decimal(cr),
        c,
      ]);
      if (seen.has(key))
        findings.push({
          severity: "warning",
          code: "possible_duplicate",
          message:
            "سطر محاسبي مماثل؛ قد يكون مشروعًا، راجع المصدر قبل اعتباره تكرارًا.",
          records: [seen.get(key)!, row.record],
        });
      else seen.set(key, row.record);
      const ak = JSON.stringify([v.account, c]);
      const a = accounts.get(ak) ?? {
        account: v.account,
        currency: c,
        debit: 0n,
        credit: 0n,
      };
      a.debit += d;
      a.credit += cr;
      accounts.set(ak, a);
      const ek = JSON.stringify([v.entry, c]);
      const e = entries.get(ek) ?? {
        entry: v.entry,
        currency: c,
        debit: 0n,
        credit: 0n,
        records: [],
      };
      e.debit += d;
      e.credit += cr;
      e.records.push(row.record);
      entries.set(ek, e);
    } catch (error) {
      invalidRows++;
      findings.push({
        severity: "error",
        code: "invalid_line",
        message:
          error instanceof FinanceError ? error.message : "سطر غير صالح.",
        records: [row.record],
      });
    }
  }
  const imbalances = [...entries.values()].filter((e) => e.debit !== e.credit);
  for (const e of imbalances)
    findings.push({
      severity: "error",
      code: "unbalanced_entry",
      message: `القيد ${e.entry} بعملة ${e.currency} غير متوازن في الصفوف الصالحة المقروءة.`,
      records: e.records,
    });
  return result(
    "فحص قيود وميزان من المصدر",
    [
      `صفوف صالحة: ${validRows} من ${sheet.rows.length}. صفوف مستبعدة لخطأ: ${invalidRows}.`,
      `قيود غير متوازنة ضمن الصفوف الصالحة: ${imbalances.length}. لا تعادل نتيجة التوازن صحة التوجيه المحاسبي.`,
      `افتراض معلن: خلية المدين أو الدائن الفارغة = صفر إذا كان الطرف الآخر موجودًا. استخدم عملة الشركة للقيم، وليس عملة المعاملة.`,
    ],
    [
      table(
        "ميزان الحسابات من الصفوف الصالحة",
        ["الحساب", "العملة", "مدين", "دائن", "الرصيد: مدين − دائن"],
        [...accounts.values()].map((a) => [
          a.account,
          a.currency,
          decimal(a.debit),
          decimal(a.credit),
          decimal(a.debit - a.credit),
        ]),
      ),
      table(
        "قيود غير متوازنة من الصفوف الصالحة",
        ["القيد", "العملة", "مدين", "دائن", "الفرق"],
        imbalances.map((e) => [
          e.entry,
          e.currency,
          decimal(e.debit),
          decimal(e.credit),
          decimal(e.debit - e.credit),
        ]),
      ),
    ],
    findings,
    {
      sourceRows: sheet.rows.length,
      validRows,
      invalidRows,
      entryCurrencyGroups: entries.size,
      unbalancedEntries: imbalances.length,
    },
  );
}
function budget(
  sheet: Sheet,
  p: Extract<WorkpaperRequest, { operation: "budget_variance" }>,
): Analysis {
  const buckets = new Map<
    string,
    {
      category: string;
      currency: string;
      actual: bigint;
      budget: bigint;
      records: number[];
    }
  >();
  for (const row of mapped(sheet, p.columns)) {
    const v = row.values,
      c = currency(v.currency);
    if (!v.category) throw new FinanceError("بند الموازنة مفقود.");
    const key = JSON.stringify([v.category, c]);
    const b = buckets.get(key) ?? {
      category: v.category,
      currency: c,
      actual: 0n,
      budget: 0n,
      records: [],
    };
    b.actual += cents(v.actual);
    b.budget += cents(v.budget);
    b.records.push(row.record);
    buckets.set(key, b);
  }
  const findings: Finding[] = [];
  const rows = [...buckets.values()].map((b) => {
    const variance = b.actual - b.budget;
    const unfavorable =
      p.direction === "expense" ? variance > 0n : variance < 0n;
    if (unfavorable)
      findings.push({
        severity: "warning",
        code: "unfavorable_variance",
        message: `انحراف غير ملائم في ${b.category} (${b.currency}) وفق نوع الموازنة المختار.`,
        records: b.records,
      });
    const den = b.budget < 0n ? -b.budget : b.budget;
    const numerator = variance < 0n ? -variance : variance;
    const percent = den
      ? decimal(
          ((numerator * 10000n + den / 2n) / den) * (variance < 0n ? -1n : 1n),
        )
      : null;
    return [
      b.category,
      b.currency,
      decimal(b.actual),
      decimal(b.budget),
      decimal(variance),
      percent,
      variance === 0n ? "مطابق" : unfavorable ? "غير ملائم" : "ملائم",
    ] as Cell[];
  });
  return result(
    "تحليل الفعلي مقابل الموازنة",
    [
      `نوع الموازنة: ${p.direction === "expense" ? "مصروفات" : "إيرادات"}. الفرق = الفعلي − الموازنة.`,
      `النسبة = الفرق ÷ القيمة المطلقة للموازنة × 100؛ لا نسبة عند موازنة صفرية.`,
      `هذا تجميع صفوف، لا يستنتج هل الموازنة مكررة على معاملات متعددة. تأكد أن كل صف مساهمة مستقلة في الموازنة.`,
    ],
    [
      table(
        "انحرافات البنود حسب العملة",
        [
          "البند",
          "العملة",
          "الفعلي",
          "الموازنة",
          "الفرق",
          "النسبة %",
          "التقييم",
        ],
        rows,
      ),
    ],
    findings,
    {
      sourceRows: sheet.rows.length,
      groups: buckets.size,
      unfavorableGroups: findings.length,
    },
  );
}
export function executeWorkpaper(
  store: FinanceStore,
  workspace: string,
  raw: unknown,
): Workpaper {
  const request = workpaperRequestSchema.parse(raw);
  const ids =
    request.operation === "reconcile"
      ? [request.left.documentId, request.right.documentId]
      : [request.documentId];
  if (new Set(ids).size !== ids.length)
    throw new FinanceError(
      "المطابقة تحتاج مصدرين مختلفين، لا الملف نفسه مرتين.",
    );
  const sheets = ids.map((id) => load(store, workspace, id));
  const analysis =
    request.operation === "reconcile"
      ? reconcile(sheets[0], sheets[1], request)
      : request.operation === "ledger_check"
        ? ledger(sheets[0], request)
        : budget(sheets[0], request);
  const sources = sheets.map((s) => ({
    id: s.doc.id,
    title: s.doc.title,
    hash: s.doc.hash,
  }));
  return store.saveWorkpaper(workspace, request, analysis, sources);
}
/** Do not let imported or model-supplied text become a spreadsheet formula. */
export function safeCsvCell(value: Cell) {
  let text = value === null ? "" : String(value);
  if (/^[\s\uFEFF]*[=+@\-]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text))
    text = "'" + text;
  // Excel drops leading zeros and rounds numbers beyond 15 significant digits.
  // Keep those identifiers/amounts as literal text in the exported review copy.
  if (
    /^-?\d+(\.\d+)?$/.test(text) &&
    (text.replace(/[-.]/g, "").length > 15 || /^-?0\d/.test(text))
  )
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function exportWorkpaper(p: Workpaper) {
  const rows: Cell[][] = [
    [p.analysis.title],
    ["المحرك", p.engineVersion],
    ["التاريخ", p.createdAt],
    ["التقييم", p.analysis.assessment],
    ...p.sources.map((s) => ["مصدر", s.title, s.hash]),
    ...p.analysis.summary.map((s) => ["ملخص", s]),
    ...p.analysis.limitations.map((s) => ["حدود", s]),
  ];
  for (const t of p.analysis.tables)
    rows.push(
      [],
      [t.title, "الإجمالي", t.totalRows, "المعروض", t.rows.length],
      t.columns,
      ...t.rows,
    );
  rows.push(
    [],
    [
      "تفاصيل الملاحظات",
      "الإجمالي",
      p.analysis.findingCount,
      "المعروض",
      p.analysis.findings.length,
    ],
    ["المستوى", "الكود", "الملاحظة", "سجلات المصدر"],
    ...p.analysis.findings.map((f) => [
      f.severity,
      f.code,
      f.message,
      f.records.join(", "),
    ]),
  );
  return "\uFEFF" + rows.map((r) => r.map(safeCsvCell).join(",")).join("\r\n");
}
