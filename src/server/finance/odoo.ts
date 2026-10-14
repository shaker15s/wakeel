import { z } from "zod";
import { FinanceError, OdooConfig, journalSchema } from "./types";
import { JsonTransport, safeJsonPost } from "./transport";

export const readSchema = z.object({
  dataset: z.enum([
    "receivables",
    "payables",
    "invoices",
    "journal_items",
    "accounts",
    "journals",
    "bank_transactions",
  ]),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.number().int().min(1).max(200).default(100),
});
const collections = {
  receivables: {
    model: "account.move",
    fields: [
      "id",
      "name",
      "partner_id",
      "amount_residual",
      "amount_total",
      "invoice_date",
      "invoice_date_due",
      "currency_id",
      "state",
    ],
    domain: [
      ["move_type", "=", "out_invoice"],
      ["state", "=", "posted"],
      ["amount_residual", ">", 0],
    ],
    date: "invoice_date",
  },
  payables: {
    model: "account.move",
    fields: [
      "id",
      "name",
      "partner_id",
      "amount_residual",
      "amount_total",
      "invoice_date",
      "invoice_date_due",
      "currency_id",
      "state",
    ],
    domain: [
      ["move_type", "=", "in_invoice"],
      ["state", "=", "posted"],
      ["amount_residual", ">", 0],
    ],
    date: "invoice_date",
  },
  invoices: {
    model: "account.move",
    fields: [
      "id",
      "name",
      "partner_id",
      "move_type",
      "amount_total",
      "amount_residual",
      "invoice_date",
      "currency_id",
      "state",
    ],
    domain: [
      [
        "move_type",
        "in",
        ["out_invoice", "in_invoice", "out_refund", "in_refund"],
      ],
    ],
    date: "invoice_date",
  },
  journal_items: {
    model: "account.move.line",
    fields: [
      "id",
      "name",
      "date",
      "account_id",
      "partner_id",
      "debit",
      "credit",
      "balance",
      "currency_id",
      "company_currency_id",
      "amount_currency",
      "parent_state",
    ],
    domain: [["parent_state", "=", "posted"]],
    date: "date",
  },
  accounts: {
    model: "account.account",
    fields: ["id", "name", "code", "account_type"],
    domain: [],
    date: null,
  },
  journals: {
    model: "account.journal",
    fields: ["id", "name", "code", "type", "currency_id"],
    domain: [],
    date: null,
  },
  bank_transactions: {
    model: "account.bank.statement.line",
    fields: [
      "id",
      "date",
      "payment_ref",
      "amount",
      "partner_id",
      "is_reconciled",
      "currency_id",
    ],
    domain: [],
    date: "date",
  },
} as const;
export class FinanceOdoo {
  private uid: number | null = null;
  constructor(
    readonly config: OdooConfig,
    private transport: JsonTransport = safeJsonPost,
  ) {}
  private async rpc(
    service: string,
    method: string,
    args: unknown[],
    signal?: AbortSignal,
  ) {
    const result = (await this.transport(
      this.config.url.replace(/\/+$/, "") + "/jsonrpc",
      {
        jsonrpc: "2.0",
        method: "call",
        params: { service, method, args },
        id: Date.now(),
      },
      {},
      signal,
    )) as { error?: unknown; result?: unknown };
    if (result.error || !("result" in result))
      throw new FinanceError(
        "رفض Odoo الطلب. راجع قاعدة البيانات وصلاحيات المستخدم والموديلات المتاحة.",
        502,
      );
    return result.result;
  }
  async authenticate(signal?: AbortSignal) {
    if (this.uid) return this.uid;
    const uid = await this.rpc(
      "common",
      "authenticate",
      [this.config.database, this.config.username, this.config.apiKey, {}],
      signal,
    );
    if (typeof uid !== "number" || !Number.isSafeInteger(uid) || uid <= 0)
      throw new FinanceError("فشل الدخول إلى Odoo. راجع بيانات الاتصال.", 401);
    this.uid = uid;
    return uid;
  }
  async call(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
    signal?: AbortSignal,
  ) {
    const uid = await this.authenticate(signal);
    return this.rpc(
      "object",
      "execute_kw",
      [
        this.config.database,
        uid,
        this.config.apiKey,
        model,
        method,
        args,
        {
          ...kwargs,
          context: { allowed_company_ids: [this.config.companyId] },
        },
      ],
      signal,
    );
  }
  async test(signal?: AbortSignal) {
    await this.authenticate(signal);
    const rows = await this.call(
      "res.company",
      "search_read",
      [[["id", "=", this.config.companyId]]],
      { fields: ["id", "name", "currency_id"], limit: 1 },
      signal,
    );
    if (!Array.isArray(rows) || rows.length !== 1)
      throw new FinanceError("الشركة المحددة غير متاحة لهذا المستخدم.", 403);
    return { company: rows[0], readOnlyByDefault: true };
  }
  async read(raw: unknown, signal?: AbortSignal) {
    const input = readSchema.parse(raw),
      spec = collections[input.dataset];
    if ((input.dateFrom || input.dateTo) && !spec.date)
      throw new FinanceError("هذا السجل لا يدعم فلتر التاريخ.");
    const companyField =
      input.dataset === "accounts" ? "company_ids" : "company_id";
    const domain: unknown[] = [
      [
        companyField,
        input.dataset === "accounts" ? "in" : "=",
        input.dataset === "accounts"
          ? [this.config.companyId]
          : this.config.companyId,
      ],
      ...spec.domain,
    ];
    if (input.dateFrom) domain.push([spec.date, ">=", input.dateFrom]);
    if (input.dateTo) domain.push([spec.date, "<=", input.dateTo]);
    const totalCount = await this.call(
      spec.model,
      "search_count",
      [domain],
      {},
      signal,
    );
    const rows = await this.call(
      spec.model,
      "search_read",
      [domain],
      { fields: [...spec.fields], limit: input.limit, order: "id asc" },
      signal,
    );
    if (!Array.isArray(rows) || typeof totalCount !== "number")
      throw new FinanceError("بيانات Odoo غير مكتملة.", 502);
    const scope =
      input.dataset === "receivables"
        ? "Open posted customer invoices only; excludes credit notes and unallocated credits. NOT net receivables ledger."
        : input.dataset === "payables"
          ? "Open posted vendor bills only; excludes vendor credits and unallocated payments. NOT net payables ledger."
          : "Only the displayed dataset, domain and date range; not a statutory financial statement.";
    return {
      scope,
      filters: {
        dateFrom: input.dateFrom ?? null,
        dateTo: input.dateTo ?? null,
      },
      dataset: input.dataset,
      companyId: this.config.companyId,
      totalCount,
      returned: rows.length,
      truncated: totalCount > rows.length,
      rows,
      source: "Odoo",
      observedAt: new Date().toISOString(),
    };
  }
  async prepareJournal(
    action: z.infer<typeof journalSchema>,
    signal?: AbortSignal,
  ) {
    const journal = await this.call(
      "account.journal",
      "search_read",
      [
        [
          ["id", "=", action.journalId],
          ["company_id", "=", this.config.companyId],
        ],
      ],
      { fields: ["id", "name", "type"], limit: 1 },
      signal,
    );
    if (
      !Array.isArray(journal) ||
      journal.length !== 1 ||
      journal[0].type !== "general" ||
      journal[0].id !== action.journalId
    )
      throw new FinanceError("يلزم دفتر يومية عام متاح في نفس الشركة.");
    const ids = [...new Set(action.lines.map((l) => l.accountId))];
    const accounts = await this.call(
      "account.account",
      "search_read",
      [
        [
          ["id", "in", ids],
          ["company_ids", "in", [this.config.companyId]],
        ],
      ],
      { fields: ["id", "name", "code"], limit: 50 },
      signal,
    );
    if (
      !Array.isArray(accounts) ||
      accounts.length !== ids.length ||
      !ids.every((id) => accounts.some((a) => a.id === id))
    )
      throw new FinanceError("بعض الحسابات غير متاحة في الشركة المحددة.");
    return { journal: journal[0], accounts };
  }
  async createDraftJournal(
    action: z.infer<typeof journalSchema>,
    reference: string,
    signal?: AbortSignal,
  ) {
    // Only one attempt; the approval is persisted as executing before calling.
    // An ambiguous result is never retried by this method.
    return this.call(
      "account.move",
      "create",
      [
        {
          move_type: "entry",
          company_id: this.config.companyId,
          journal_id: action.journalId,
          date: action.date,
          ref: reference,
          line_ids: action.lines.map((l) => [
            0,
            0,
            {
              account_id: l.accountId,
              name: l.label,
              debit: l.debit,
              credit: l.credit,
            },
          ]),
        },
      ],
      {},
      signal,
    );
  }
  async verifyJournal(
    id: number,
    action: z.infer<typeof journalSchema>,
    reference: string,
    signal?: AbortSignal,
  ) {
    const records = await this.call(
      "account.move",
      "search_read",
      [
        [
          ["id", "=", id],
          ["company_id", "=", this.config.companyId],
        ],
      ],
      {
        fields: ["id", "state", "ref", "date", "journal_id", "line_ids"],
        limit: 1,
      },
      signal,
    );
    if (!Array.isArray(records) || records.length !== 1)
      throw new FinanceError("تعذر العثور على القيد للتحقق منه.", 502);
    const record = records[0];
    const lines = await this.call(
      "account.move.line",
      "read",
      [record.line_ids],
      { fields: ["account_id", "name", "debit", "credit"] },
      signal,
    );
    if (
      !Array.isArray(lines) ||
      !journalSchema.safeParse({
        ...action,
        lines: lines.map((l) => ({
          accountId: l.account_id?.[0],
          label: l.name,
          debit: l.debit,
          credit: l.credit,
        })),
      }).success
    )
      throw new FinanceError(
        "بنود القيد المقروءة ليست قيودًا مالية صالحة بنفس الدقة.",
        502,
      );
    const expected = action.lines
      .map((l) =>
        JSON.stringify([
          l.accountId,
          l.label,
          Math.round(l.debit * 100),
          Math.round(l.credit * 100),
        ]),
      )
      .sort();
    const actual = Array.isArray(lines)
      ? lines
          .map((l) =>
            JSON.stringify([
              l.account_id?.[0],
              l.name,
              Math.round(l.debit * 100),
              Math.round(l.credit * 100),
            ]),
          )
          .sort()
      : [];
    if (
      record.id !== id ||
      record.state !== "draft" ||
      record.ref !== reference ||
      record.date !== action.date ||
      record.journal_id?.[0] !== action.journalId ||
      JSON.stringify(expected) !== JSON.stringify(actual)
    )
      throw new FinanceError(
        "تمت محاولة الكتابة لكن التحقق لم يطابق الإجراء الموافق عليه. راجع Odoo يدويًا ولا تعاود الإنشاء.",
        502,
      );
    return {
      id,
      state: "draft",
      reference,
      record,
      lines,
      verifiedAt: new Date().toISOString(),
    };
  }
}
