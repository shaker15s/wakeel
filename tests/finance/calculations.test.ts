import { describe, it, expect } from "vitest";
import {
  calculate,
  cents,
  ageing,
  strictCsv,
  tableSummary,
  aggregate,
} from "@/server/finance/calculations";
import { journalSchema, planSchema } from "@/server/finance/types";
import { publicIpv4, validateEndpoint } from "@/server/finance/transport";

describe("financial tools use decimals, not language-model arithmetic", () => {
  it("adds decimal currency without binary floating-point drift", () =>
    expect(calculate({ operation: "sum", values: [0.1, 0.2] }).value).toBe(
      "0.30",
    ));
  it("handles Arabic numerals and negative amounts", () => {
    expect(cents("١٢٫٣٤")).toBe(1234n);
    expect(
      calculate({ operation: "subtract", values: ["1.00", "1.50"] }).value,
    ).toBe("-0.50");
  });
  it("refuses silent input rounding and division by zero", () => {
    expect(() => cents("1.001")).toThrow();
    expect(() => calculate({ operation: "divide", values: [10, 0] })).toThrow();
  });
  it("rounds division explicitly and computes percentage change", () => {
    expect(calculate({ operation: "divide", values: ["1", "3"] }).value).toBe(
      "0.33",
    );
    expect(
      calculate({ operation: "percentage_change", values: [100, 120] }).value,
    ).toBe("20.00");
  });
  it("ages each currency independently and marks unknown due dates", () => {
    const result = ageing({
      asOf: "2026-10-14",
      rows: [
        {
          amount_residual: 100,
          invoice_date_due: "2026-10-01",
          currency_id: [1, "EGP"],
        },
        {
          amount_residual: 30,
          invoice_date_due: "2026-11-01",
          currency_id: [2, "USD"],
        },
        {
          amount_residual: 10,
          invoice_date_due: false,
          currency_id: [1, "EGP"],
        },
      ],
    });
    expect(result.currencyGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          currency: "EGP",
          days_1_30: "100.00",
          undated: "10.00",
          total: "110.00",
        }),
        expect.objectContaining({
          currency: "USD",
          not_due: "30.00",
          total: "30.00",
        }),
      ]),
    );
    expect(result.missingDates).toBe(1);
  });
  it("reads CSV quotes strictly and rejects silently truncated or malformed rows", () => {
    expect(strictCsv('name,amount\n"a,b",12\n')).toEqual([
      ["name", "amount"],
      ["a,b", "12"],
    ]);
    expect(() => strictCsv("a,b\n1,2,3")).toThrow();
    expect(() => strictCsv('a,b\n"unfinished,2')).toThrow();
    expect(() => strictCsv("a,a\n1,2")).toThrow();
  });
  it("aggregates source CSV directly by category AND currency", () => {
    const result = tableSummary(
      "type,amount,currency\nrent,10.10,EGP\nrent,20.20,EGP\nrent,5,USD",
      {
        valueColumn: "amount",
        currencyColumn: "currency",
        groupColumn: "type",
      },
    );
    expect(result.groups).toEqual([
      { currency: "EGP", group: "rent", total: "30.30", count: 2 },
      { currency: "USD", group: "rent", total: "5.00", count: 1 },
    ]);
  });
  it("rejects missing currency, unknown columns and nonnumeric values", () => {
    expect(() =>
      tableSummary("amount,currency\n1,", {
        valueColumn: "amount",
        currencyColumn: "currency",
      }),
    ).toThrow();
    expect(() =>
      tableSummary("amount,currency\n=2+2,EGP", {
        valueColumn: "amount",
        currencyColumn: "currency",
      }),
    ).toThrow();
  });
  it("rejects unbalanced and dual-sided journal lines", () => {
    const entry = {
      journalId: 1,
      date: "2026-10-14",
      description: "fixture",
      lines: [
        { accountId: 1, label: "a", debit: 10, credit: 0 },
        { accountId: 2, label: "b", debit: 0, credit: 9 },
      ],
    };
    expect(journalSchema.safeParse(entry).success).toBe(false);
    entry.lines[1].credit = 10;
    expect(journalSchema.safeParse(entry).success).toBe(true);
  });
  it("rejects cyclic plans and unregistered tools", () => {
    expect(
      planSchema.safeParse({
        title: "x",
        summary: "x",
        clarification: null,
        steps: [
          {
            id: "x",
            title: "x",
            tool: "odoo.read",
            dependsOn: ["x"],
            input: {},
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      planSchema.safeParse({
        title: "x",
        summary: "x",
        clarification: null,
        steps: [
          { id: "x", title: "x", tool: "shell.exec", dependsOn: [], input: {} },
        ],
      }).success,
    ).toBe(false);
  });
});
describe("outbound security", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "172.16.2.2",
    "192.168.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
  ])("blocks nonpublic IPv4 %s", (ip) => expect(publicIpv4(ip)).toBe(false));
  it("only accepts public HTTPS endpoint syntax", () => {
    expect(publicIpv4("1.1.1.1")).toBe(true);
    expect(() => validateEndpoint("http://example.com")).toThrow();
    expect(() => validateEndpoint("https://user:pass@example.com")).toThrow();
    expect(() => validateEndpoint("https://example.com:8443")).toThrow();
  });
});

it("aggregates Odoo amounts directly with company-currency discipline", () => {
  const rows = [
    {
      debit: 10,
      credit: 0,
      company_currency_id: [1, "EGP"],
      currency_id: [2, "USD"],
      account_id: [9, "Expense"],
    },
    {
      debit: 20,
      credit: 0,
      company_currency_id: [1, "EGP"],
      currency_id: [1, "EGP"],
      account_id: [9, "Expense"],
    },
  ];
  expect(() =>
    aggregate({ rows, valueFields: ["debit"], currencyField: "currency_id" }),
  ).toThrow();
  expect(
    aggregate({
      rows,
      valueFields: ["debit", "credit"],
      currencyField: "company_currency_id",
      groupBy: ["account_id"],
    }).groups[0],
  ).toMatchObject({ totals: { debit: "30.00", credit: "0.00" }, count: 2 });
});
