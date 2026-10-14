import { describe, it, expect, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { FinanceStore } from "@/server/finance/store";
import { runTurn } from "@/server/finance/runner";
import type { FinanceModel } from "@/server/finance/model";
import { OpenAIPlanningModel } from "@/server/finance/model";
import type { Review } from "@/server/finance/types";
const stores: FinanceStore[] = [];
afterEach(() => stores.splice(0).forEach((s) => s.close()));
function fixture() {
  const store = new FinanceStore(":memory:");
  stores.push(store);
  const w = store.createWorkspace();
  const s = store.createSession(w.id, "financial request");
  const id = randomUUID();
  const signal = new AbortController().signal;
  return { store, w, s, id, signal };
}
function model(): FinanceModel {
  return {
    plan: vi.fn(async () => ({
      title: "حساب",
      summary: "أحسب ثم أراجع",
      clarification: null,
      steps: [
        {
          id: "sum",
          title: "جمع",
          tool: "finance.calculate" as const,
          dependsOn: [],
          input: { operation: "sum", values: [1, 2] },
        },
      ],
    })),
    report: vi.fn(async () => "المجموع 3.00 [sum]"),
    review: vi.fn(async () => ({
      summary: "الأدلة متاحة ضمن النطاق المحدد",
      decision: "ready" as const,
      question: null,
      steps: [],
    })),
  };
}
const ready: Review = {
  summary: "النتائج جاهزة لصياغة مقيدة بالنطاق",
  decision: "ready" as const,
  question: null,
  steps: [],
};
describe("bounded observe → review → extend loop", () => {
  it("inspects a real source first, then appends analysis using observed columns and persists its workpaper", async () => {
    const { store, w, s, id, signal } = fixture();
    const doc = store.addDocument(
      w.id,
      "budget.csv",
      "category,actual,budget,currency\nrent,150,100,EGP",
      "document",
    );
    const m = model();
    m.plan = vi.fn(async () => ({
      title: "مراجعة الموازنة",
      summary: "أراجع الأعمدة أولًا",
      clarification: null,
      steps: [
        {
          id: "schema",
          title: "فحص المصدر",
          tool: "sheet.profile" as const,
          dependsOn: [],
          input: { documentId: doc.id },
        },
      ],
    }));
    m.review = vi
      .fn()
      .mockImplementationOnce(async (context) => {
        expect(context.evidence[0].output.columns[0].name).toBe("category");
        return {
          summary: "الأعمدة واضحة؛ سأحسب الانحراف",
          decision: "extend" as const,
          question: null,
          steps: [
            {
              id: "variance",
              title: "حساب الفروق",
              tool: "finance.budget_variance" as const,
              dependsOn: ["schema"],
              input: {
                documentId: doc.id,
                columns: {
                  category: "category",
                  actual: "actual",
                  budget: "budget",
                  currency: "currency",
                },
                direction: "expense",
              },
            },
          ],
        };
      })
      .mockResolvedValueOnce(ready);
    await runTurn(store, w.id, s.id, id, "راجع الموازنة", () => {}, signal, {
      model: m,
      documentIds: [doc.id],
    });
    const t = store.getSession(w.id, s.id)!.turns[0];
    expect(t.status).toBe("completed");
    expect(t.steps.map((s) => s.status)).toEqual(["completed", "completed"]);
    expect(t.reviews?.map((r) => r.decision)).toEqual(["extend", "ready"]);
    expect(t.reviewComplete).toBe(true);
    expect(store.listWorkpapers(w.id)).toHaveLength(1);
    expect(m.plan).toHaveBeenCalledTimes(1);
    expect(m.report).toHaveBeenCalledTimes(1);
  });
  it("reuses the completed review and tool results if only report generation failed", async () => {
    const { store, w, s, id, signal } = fixture();
    const m = model();
    m.report = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider"))
      .mockResolvedValueOnce("3.00 [sum]");
    await runTurn(store, w.id, s.id, id, "احسب", () => {}, signal, {
      model: m,
    });
    expect(store.getSession(w.id, s.id)!.turns[0].status).toBe("failed");
    await runTurn(store, w.id, s.id, id, undefined, () => {}, signal, {
      model: m,
    });
    expect(m.review).toHaveBeenCalledTimes(1);
    expect(m.plan).toHaveBeenCalledTimes(1);
    expect(store.getSession(w.id, s.id)!.turns[0].status).toBe("completed");
  });
  it.each(["sum", "new"])(
    "rejects overwriting completed steps or dependency cycles (%s)",
    async (stepId) => {
      const { store, w, s, id, signal } = fixture();
      const m = model();
      m.review = vi.fn(async () => ({
        summary: "غير صالحة",
        decision: "extend" as const,
        question: null,
        steps: [
          {
            id: stepId,
            title: "إضافة",
            tool: "finance.calculate" as const,
            dependsOn: [stepId],
            input: { operation: "sum", values: [9] },
          },
        ],
      }));
      await runTurn(store, w.id, s.id, id, "احسب", () => {}, signal, {
        model: m,
      });
      const t = store.getSession(w.id, s.id)!.turns[0];
      expect(t.status).toBe("failed");
      expect(t.steps).toHaveLength(1);
      expect(t.steps[0].output).toMatchObject({ value: "3.00" });
      expect(m.report).not.toHaveBeenCalled();
    },
  );
  it("stops at the review budget instead of running forever or claiming completion", async () => {
    const { store, w, s, id, signal } = fixture();
    const m = model();
    let i = 0;
    m.review = vi.fn(async () => ({
      summary: "أحتاج المزيد",
      decision: "extend" as const,
      question: null,
      steps: [
        {
          id: "more_" + ++i,
          title: "حساب إضافي",
          tool: "finance.calculate" as const,
          dependsOn: [],
          input: { operation: "sum", values: [1] },
        },
      ],
    }));
    await runTurn(store, w.id, s.id, id, "طلب واسع", () => {}, signal, {
      model: m,
    });
    const t = store.getSession(w.id, s.id)!.turns[0];
    expect(t.status).toBe("blocked");
    expect(t.steps).toHaveLength(3);
    expect(m.review).toHaveBeenCalledTimes(3);
    expect(m.report).not.toHaveBeenCalled();
    await runTurn(store, w.id, s.id, id, undefined, () => {}, signal, {
      model: m,
    });
    expect(m.review).toHaveBeenCalledTimes(3);
  });
  it("asks a necessary question without executing additional speculative work", async () => {
    const { store, w, s, id, signal } = fixture();
    const m = model();
    m.review = vi.fn(async () => ({
      summary: "العملة تحتاج توضيحًا",
      decision: "clarify" as const,
      question: "هل هذه القيم بعملة الشركة؟",
      steps: [],
    }));
    await runTurn(store, w.id, s.id, id, "راجع", () => {}, signal, {
      model: m,
    });
    await runTurn(store, w.id, s.id, id, undefined, () => {}, signal, {
      model: m,
    });
    expect(store.getSession(w.id, s.id)!.turns[0].clarification).toContain(
      "عملة الشركة",
    );
    expect(m.review).toHaveBeenCalledTimes(1);
    expect(m.report).not.toHaveBeenCalled();
  });
  it("does not publish a report after cancellation during evidence review", async () => {
    const { store, w, s, id } = fixture();
    const abort = new AbortController(),
      m = model();
    m.review = vi.fn(async () => {
      abort.abort();
      return ready;
    });
    await runTurn(store, w.id, s.id, id, "راجع", () => {}, abort.signal, {
      model: m,
    });
    const t = store.getSession(w.id, s.id)!.turns[0];
    expect(t.status).toBe("interrupted");
    expect(t.steps[0].status).toBe("completed");
    expect(m.report).not.toHaveBeenCalled();
  });
  it("rejects a provider review that smuggles arbitrary tools or conflicting decisions", async () => {
    const m = new OpenAIPlanningModel(
      { baseUrl: "https://example.com/v1", apiKey: "test", model: "test" },
      async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "do it",
                decision: "ready" as const,
                question: null,
                steps: [
                  {
                    id: "x",
                    title: "x",
                    tool: "shell.exec" as const,
                    dependsOn: [],
                    input: {},
                  },
                ],
              }),
            },
          },
        ],
      }),
    );
    await expect(m.review({})).rejects.toThrow();
  });
});
