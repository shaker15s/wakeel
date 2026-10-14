import { describe, it, expect, afterEach } from "vitest";
import { FinanceStore } from "@/server/finance/store";
import {
  executeWorkpaper,
  profileDocument,
  safeCsvCell,
  exportWorkpaper,
  type WorkpaperRequest,
} from "@/server/finance/workpapers";
const stores: FinanceStore[] = [];
afterEach(() => stores.splice(0).forEach((s) => s.close()));
function fixture() {
  const store = new FinanceStore(":memory:");
  stores.push(store);
  const { id } = store.createWorkspace();
  const add = (text: string, title = "source.csv") =>
    store.addDocument(id, title, text, "document");
  return { store, id, add };
}
const columns = {
  amount: "amount",
  currency: "currency",
  reference: "reference",
};
const ledgerColumns = {
  entry: "entry",
  account: "account",
  debit: "debit",
  credit: "credit",
  currency: "currency",
};
const budgetColumns = {
  category: "category",
  actual: "actual",
  budget: "budget",
  currency: "currency",
};
describe("financial workpaper engine", () => {
  it("profiles actual headers, blanks, numbers and duplicate records", () => {
    const { store, id, add } = fixture();
    const d = add("name,amount\na,0.1\na,0.1\nb,");
    const p = profileDocument(store, id, d.id);
    expect(p.rowCount).toBe(3);
    expect(p.columns[1]).toEqual({ name: "amount", blank: 1, numeric: 2 });
    expect(p.duplicateGroups).toEqual([[2, 3]]);
    expect(p.hash).toBe(d.hash);
  });
  it("does not use cross-workspace sources", () => {
    const { store, id, add } = fixture();
    const d = add("a,b\nx,1");
    const other = store.createWorkspace();
    expect(() => profileDocument(store, other.id, d.id)).toThrow();
    expect(store.getWorkpaper(other.id, "missing")).toBeNull();
  });
  it("rejects comparing a source to itself", () => {
    const { store, id, add } = fixture();
    const d = add("reference,amount,currency\nA,10,EGP");
    expect(() =>
      executeWorkpaper(store, id, {
        operation: "reconcile",
        left: { documentId: d.id, columns },
        right: { documentId: d.id, columns },
      }),
    ).toThrow();
  });
  it("rejects a column reused for different accounting semantics", () => {
    const { store, id, add } = fixture();
    const d = add("category,actual,budget,currency\nx,1,2,EGP");
    expect(() =>
      executeWorkpaper(store, id, {
        operation: "budget_variance",
        documentId: d.id,
        columns: { ...budgetColumns, budget: "actual" },
        direction: "expense",
      }),
    ).toThrow();
  });
  it("matches only unique reference, signed amount and currency; exposes ambiguity", () => {
    const { store, id, add } = fixture();
    const l = add(
      "reference,amount,currency\nA,0.1,EGP\nB,20,EGP\nB,20,EGP\nC,-1,USD\n,5,EGP",
    );
    const r = add(
      "reference,amount,currency\nA,0.10,EGP\nB,20,EGP\nC,1,USD\n,5,EGP",
    );
    const p = executeWorkpaper(store, id, {
      operation: "reconcile",
      left: { documentId: l.id, columns },
      right: { documentId: r.id, columns },
    });
    expect(p.analysis.counts).toMatchObject({
      matchedPairs: 1,
      ambiguousLeft: 2,
      ambiguousRight: 1,
      unmatchedLeft: 2,
      unmatchedRight: 2,
    });
    expect(p.analysis.assessment).toBe("review_required");
    expect(p.analysis.tables[0].rows).toContainEqual([
      "USD",
      "-1.00",
      "1.00",
      "-2.00",
    ]);
    expect(p.analysis.tables[1].rows[0]).toEqual([2, 2, "A", "EGP", "0.10"]);
  });
  it("does not confuse equal totals with reconciled records", () => {
    const { store, id, add } = fixture();
    const l = add("reference,amount,currency\nA,10,EGP");
    const r = add("reference,amount,currency\nB,10,EGP");
    const p = executeWorkpaper(store, id, {
      operation: "reconcile",
      left: { documentId: l.id, columns },
      right: { documentId: r.id, columns },
    });
    expect(p.analysis.counts.matchedPairs).toBe(0);
    expect(p.analysis.tables[0].rows[0][3]).toBe("0.00");
    expect(p.analysis.assessment).toBe("review_required");
  });
  it("never nets a match across currencies", () => {
    const { store, id, add } = fixture();
    const l = add("reference,amount,currency\nA,10,EGP");
    const r = add("reference,amount,currency\nA,10,USD");
    const p = executeWorkpaper(store, id, {
      operation: "reconcile",
      left: { documentId: l.id, columns },
      right: { documentId: r.id, columns },
    });
    expect(p.analysis.counts.matchedPairs).toBe(0);
    expect(p.analysis.tables[0].rows).toHaveLength(2);
  });
  it("keeps a saved immutable workpaper and deduplicates the same evidence/request", () => {
    const { store, id, add } = fixture();
    const d = add("category,actual,budget,currency\nx,0.1,0.2,EGP");
    const req = {
      operation: "budget_variance",
      documentId: d.id,
      columns: budgetColumns,
      direction: "expense",
    } as const;
    const a = executeWorkpaper(store, id, req),
      b = executeWorkpaper(store, id, req);
    expect(a.id).toBe(b.id);
    expect(store.listWorkpapers(id)).toHaveLength(1);
    store.deleteDocument(id, d.id);
    expect(store.getWorkpaper(id, a.id)?.sources[0].hash).toBe(d.hash);
    expect(store.getWorkpaper(store.createWorkspace().id, a.id)).toBeNull();
  });
  it("checks entry-level balance rather than only global balance", () => {
    const { store, id, add } = fixture();
    const d = add(
      "entry,account,debit,credit,currency\nJ1,Cash,10,0,EGP\nJ2,Income,0,10,EGP",
    );
    const p = executeWorkpaper(store, id, {
      operation: "ledger_check",
      documentId: d.id,
      columns: ledgerColumns,
    });
    expect(p.analysis.counts.unbalancedEntries).toBe(2);
    expect(
      p.analysis.findings.every((f) => f.code === "unbalanced_entry"),
    ).toBe(true);
  });
  it("excludes invalid lines explicitly, flags duplicates, and never claims a clean ledger", () => {
    const { store, id, add } = fixture();
    const d = add(
      "entry,account,debit,credit,currency\nJ1,Cash,10,0,EGP\nJ1,Cash,10,0,EGP\nJ1,Income,0,20,EGP\nJ2,Cash,1,1,EGP\nJ3,Cash,10,0,",
    );
    const p = executeWorkpaper(store, id, {
      operation: "ledger_check",
      documentId: d.id,
      columns: ledgerColumns,
    });
    expect(p.analysis.counts).toMatchObject({
      validRows: 3,
      invalidRows: 2,
      unbalancedEntries: 0,
    });
    expect(p.analysis.assessment).toBe("review_required");
    expect(
      p.analysis.findings.some((f) => f.code === "possible_duplicate"),
    ).toBe(true);
  });
  it("accepts blank opposite-side amounts only under the declared zero convention", () => {
    const { store, id, add } = fixture();
    const d = add(
      "entry,account,debit,credit,currency\nJ1,Cash,0.1,,EGP\nJ1,Income,,0.1,EGP",
    );
    const p = executeWorkpaper(store, id, {
      operation: "ledger_check",
      documentId: d.id,
      columns: ledgerColumns,
    });
    expect(p.analysis.counts.validRows).toBe(2);
    expect(p.analysis.assessment).toBe("no_exceptions_in_scope");
  });
  it("does not turn invalid zero-only rows into valid transactions", () => {
    const { store, id, add } = fixture();
    const d = add(
      "entry,account,debit,credit,currency\nJ1,Cash,0,0,EGP\nJ2,Cash,,,EGP",
    );
    expect(
      executeWorkpaper(store, id, {
        operation: "ledger_check",
        documentId: d.id,
        columns: ledgerColumns,
      }).analysis.counts.invalidRows,
    ).toBe(2);
  });
  it("groups budget by currency, computes exact variance and leaves zero-budget percentages undefined", () => {
    const { store, id, add } = fixture();
    const d = add(
      "category,actual,budget,currency\nrent,0.1,0.2,EGP\nrent,0.2,0.2,EGP\nad,5,0,USD",
    );
    const p = executeWorkpaper(store, id, {
      operation: "budget_variance",
      documentId: d.id,
      columns: budgetColumns,
      direction: "expense",
    });
    expect(p.analysis.tables[0].rows).toContainEqual([
      "rent",
      "EGP",
      "0.30",
      "0.40",
      "-0.10",
      "-25.00",
      "ملائم",
    ]);
    expect(p.analysis.tables[0].rows).toContainEqual([
      "ad",
      "USD",
      "5.00",
      "0.00",
      "5.00",
      null,
      "غير ملائم",
    ]);
  });
  it("reverses favorable interpretation for income without changing the numeric formula", () => {
    const { store, id, add } = fixture();
    const d = add("category,actual,budget,currency\nsales,90,100,EGP");
    const p = executeWorkpaper(store, id, {
      operation: "budget_variance",
      documentId: d.id,
      columns: budgetColumns,
      direction: "income",
    });
    expect(p.analysis.tables[0].rows[0]).toEqual([
      "sales",
      "EGP",
      "90.00",
      "100.00",
      "-10.00",
      "-10.00",
      "غير ملائم",
    ]);
  });
  it.each(["", "oops", "=SUM(A1:A2)", "1.001"])(
    "rejects invalid budget input %j instead of fabricating totals",
    (v) => {
      const { store, id, add } = fixture();
      const d = add("category,actual,budget,currency\na," + v + ",1,EGP");
      expect(() =>
        executeWorkpaper(store, id, {
          operation: "budget_variance",
          documentId: d.id,
          columns: budgetColumns,
          direction: "expense",
        }),
      ).toThrow();
      expect(store.listWorkpapers(id)).toHaveLength(0);
    },
  );
  it("bounds displayed details without silently cutting the underlying calculations", () => {
    const { store, id, add } = fixture();
    const d = add(
      "category,actual,budget,currency\n" +
        Array.from({ length: 120 }, (_, i) => `c${i},1,1,EGP`).join("\n"),
    );
    const p = executeWorkpaper(store, id, {
      operation: "budget_variance",
      documentId: d.id,
      columns: budgetColumns,
      direction: "expense",
    });
    expect(p.analysis.counts.sourceRows).toBe(120);
    expect(p.analysis.tables[0]).toMatchObject({
      totalRows: 120,
      truncated: true,
    });
    expect(p.analysis.tables[0].rows).toHaveLength(100);
    expect(exportWorkpaper(p)).toContain('"120","المعروض","100"');
  });
  it.each([
    '=HYPERLINK("https://example.com")',
    "+cmd",
    "@SUM(A1)",
    "\t=1+1",
    "-1+2",
  ])("neutralizes spreadsheet formulas in exported text: %s", (value) =>
    expect(safeCsvCell(value)).toMatch(/^"'/),
  );
  it("keeps canonical signed numbers numeric-looking while quoting CSV delimiters", () => {
    expect(safeCsvCell("-10.25")).toBe('"-10.25"');
    expect(safeCsvCell('a,"b"')).toBe('"a,""b"""');
  });
});

it("preserves long numbers and leading-zero references in spreadsheet exports", () => {
  expect(safeCsvCell("00123")).toBe('"\'00123"');
  expect(safeCsvCell("1234567890123456.00")).toBe('"\'1234567890123456.00"');
});

it("finds saved analysis by its Arabic source name without crossing workspaces", () => {
  const { store, id, add } = fixture();
  const d = add(
    "category,actual,budget,currency\na,1,2,EGP",
    "موازنة أكتوبر.csv",
  );
  const p = executeWorkpaper(store, id, {
    operation: "budget_variance",
    documentId: d.id,
    columns: budgetColumns,
    direction: "expense",
  });
  expect(store.searchWorkpapers(id, "موازنه اكتوبر")[0].id).toBe(p.id);
  expect(
    store.searchWorkpapers(store.createWorkspace().id, "موازنه اكتوبر"),
  ).toEqual([]);
});
