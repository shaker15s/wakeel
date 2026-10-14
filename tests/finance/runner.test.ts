import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceStore, digest } from "@/server/finance/store";
import {
  runTurn,
  sessionView,
  resolveReferences,
  decideJournal,
} from "@/server/finance/runner";
import { FinanceModel, OpenAIPlanningModel } from "@/server/finance/model";
import { FinanceOdoo } from "@/server/finance/odoo";
import {
  journalSchema,
  type Plan,
  type Step,
  type JournalApproval,
} from "@/server/finance/types";
import type { JsonTransport } from "@/server/finance/transport";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const stores: FinanceStore[] = [];
const dirs: string[] = [];
function make() {
  const store = new FinanceStore(":memory:");
  stores.push(store);
  const workspace = store.createWorkspace();
  const session = store.createSession(workspace.id, "طلب مركب");
  return { store, workspace, session };
}
afterEach(() => {
  for (const s of stores.splice(0)) {
    try {
      s.close();
    } catch {}
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const signal = () => new AbortController().signal;
function mockModel(plan: Plan): FinanceModel {
  return {
    plan: vi.fn(async () => plan),
    report: vi.fn(async (context) => "نتيجة مدعومة بمخرجات الأدوات [sum]."),
  };
}

describe("persistent conversational financial sessions", () => {
  it("creates an isolated workspace capability, never trusts a caller-selected tenant", () => {
    const { store, workspace, session } = make();
    const other = store.createWorkspace();
    expect(store.authenticate(workspace.token)).toBe(workspace.id);
    expect(store.authenticate(workspace.id)).toBeNull();
    expect(store.getSession(other.id, session.id)).toBeNull();
  });
  it("persists the user request and blocks honestly when no model is connected", async () => {
    const { store, workspace, session } = make();
    const snapshots: string[] = [];
    await runTurn(
      store,
      workspace.id,
      session.id,
      randomUUID(),
      "راجع ديون العملاء وسياسة التحصيل",
      (s) => snapshots.push(s.turns[0].phase),
      signal(),
    );
    const turn = store.getSession(workspace.id, session.id)!.turns[0];
    expect(turn.status).toBe("blocked");
    expect(turn.steps).toEqual([]);
    expect(turn.reply).toContain("اربط نموذج");
    expect(snapshots.length).toBeGreaterThan(0);
  });
  it("runs a dynamic multi-step plan over saved context and deterministic finance tools", async () => {
    const { store, workspace, session } = make();
    const doc = store.addDocument(
      workspace.id,
      "مصروفات.csv",
      "category,amount,currency\nrent,0.1,EGP\nrent,0.2,EGP",
      "document",
    );
    const model = mockModel({
      title: "تحليل المصروفات",
      summary: "أراجع الملف ثم أجمع القيم حسب العملة",
      clarification: null,
      steps: [
        {
          id: "read",
          title: "قراءة الملف",
          tool: "memory.read",
          dependsOn: [],
          input: { id: doc.id },
        },
        {
          id: "sum",
          title: "تجميع المصروفات",
          tool: "finance.table_summary",
          dependsOn: ["read"],
          input: {
            documentId: doc.id,
            valueColumn: "amount",
            currencyColumn: "currency",
            groupColumn: "category",
          },
        },
        {
          id: "compare",
          title: "مقارنة المصروفات بالموازنة",
          tool: "finance.calculate",
          dependsOn: ["sum"],
          input: {
            operation: "subtract",
            values: ["1.00", "{{sum.groups.0.total}}"],
          },
        },
      ],
    });
    const id = randomUUID();
    await runTurn(
      store,
      workspace.id,
      session.id,
      id,
      "حلل مصروفاتي وقارن بالموازنة",
      () => {},
      signal(),
      { model, documentIds: [doc.id] },
    );
    const final = store.getSession(workspace.id, session.id)!;
    expect(final.title).toBe("تحليل المصروفات");
    expect(final.turns[0].status).toBe("completed");
    expect(final.turns[0].sources[0].hash).toBe(doc.hash);
    expect(final.turns[0].steps[2].output).toMatchObject({ value: "0.70" });
    await runTurn(
      store,
      workspace.id,
      session.id,
      id,
      undefined,
      () => {},
      signal(),
      { model },
    );
    expect(model.plan).toHaveBeenCalledTimes(1);
    expect(model.report).toHaveBeenCalledTimes(1);
  });
  it("does not retry completed steps when report generation fails", async () => {
    const { store, workspace, session } = make();
    const model = mockModel({
      title: "حساب",
      summary: "حساب مبلغ",
      clarification: null,
      steps: [
        {
          id: "sum",
          title: "جمع",
          tool: "finance.calculate",
          dependsOn: [],
          input: { operation: "sum", values: [1, 2] },
        },
      ],
    });
    model.report = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce("المجموع 3.00 [sum]");
    const id = randomUUID();
    await runTurn(
      store,
      workspace.id,
      session.id,
      id,
      "احسب",
      () => {},
      signal(),
      { model },
    );
    const before = store.getSession(workspace.id, session.id)!.turns[0].steps[0]
      .finishedAt;
    await runTurn(
      store,
      workspace.id,
      session.id,
      id,
      undefined,
      () => {},
      signal(),
      { model },
    );
    const turn = store.getSession(workspace.id, session.id)!.turns[0];
    expect(turn.status).toBe("completed");
    expect(turn.steps[0].finishedAt).toBe(before);
    expect(model.plan).toHaveBeenCalledTimes(1);
  });
  it("shows a clarification rather than silently executing a partial plan", async () => {
    const { store, workspace, session } = make();
    const model = mockModel({
      title: "سؤال",
      summary: "تحديد الفترة",
      clarification: "أي فترة محاسبية؟",
      steps: [
        {
          id: "read",
          title: "قراءة",
          tool: "odoo.read",
          dependsOn: [],
          input: { dataset: "invoices" },
        },
      ],
    });
    const id = randomUUID();
    await runTurn(
      store,
      workspace.id,
      session.id,
      id,
      "راجع الإيراد",
      () => {},
      signal(),
      { model },
    );
    await runTurn(
      store,
      workspace.id,
      session.id,
      id,
      undefined,
      () => {},
      signal(),
      { model },
    );
    expect(
      store.getSession(workspace.id, session.id)!.turns[0].steps[0].status,
    ).toBe("pending");
    expect(model.report).not.toHaveBeenCalled();
  });
  it("passes follow-up context to the planner and keeps separate turns", async () => {
    const { store, workspace, session } = make();
    const model = mockModel({
      title: "توضيح",
      summary: "هل تقصد الشهر الحالي؟",
      clarification: null,
      steps: [],
    });
    await runTurn(
      store,
      workspace.id,
      session.id,
      randomUUID(),
      "راجع الشهر",
      () => {},
      signal(),
      { model },
    );
    await runTurn(
      store,
      workspace.id,
      session.id,
      randomUUID(),
      "نعم الحالي",
      () => {},
      signal(),
      { model },
    );
    expect(model.plan).toHaveBeenLastCalledWith(
      expect.objectContaining({
        history: [expect.objectContaining({ request: "راجع الشهر" })],
      }),
      expect.anything(),
    );
    expect(store.getSession(workspace.id, session.id)!.turns).toHaveLength(2);
  });
  it("never resolves other steps or prototype properties without explicit dependencies", () => {
    const step = {
      id: "b",
      title: "b",
      tool: "finance.calculate",
      dependsOn: [],
      input: {},
      status: "pending",
    } as Step;
    expect(() => resolveReferences("{{a.value}}", step, [])).toThrow();
    step.dependsOn = ["a"];
    expect(() =>
      resolveReferences("{{a.constructor}}", step, [
        { ...step, id: "a", status: "completed", output: { value: 1 } },
      ]),
    ).toThrow();
  });
  it("marks a persisted in-flight run as interrupted after process-state loss", () => {
    const { store, workspace, session } = make();
    session.turns = [
      {
        id: randomUUID(),
        request: "x",
        status: "running",
        phase: "x",
        reply: "",
        steps: [],
        activities: [],
        sources: [],
        createdAt: new Date().toISOString(),
      },
    ];
    store.saveSession(session);
    expect(sessionView(store, workspace.id, session.id).turns[0].status).toBe(
      "interrupted",
    );
  });
  it("encrypts connection secrets on disk, preserves access across reopen, never returns keys in public status", () => {
    const dir = mkdtempSync(join(tmpdir(), "wakeel-finance-"));
    dirs.push(dir);
    const path = join(dir, "finance.sqlite");
    let store = new FinanceStore(path);
    const { id, token } = store.createWorkspace();
    store.saveConnections(id, {
      model: {
        baseUrl: "https://example.com/v1",
        model: "test",
        apiKey: "SECRET-MODEL-KEY",
      },
    });
    store.close();
    expect(readFileSync(path).includes(Buffer.from("SECRET-MODEL-KEY"))).toBe(
      false,
    );
    store = new FinanceStore(path);
    stores.push(store);
    expect(store.authenticate(token)).toBe(id);
    expect(store.getConnections(id).model?.apiKey).toBe("SECRET-MODEL-KEY");
    expect(JSON.stringify(store.publicConnections(id))).not.toContain(
      "SECRET-MODEL-KEY",
    );
  });
  it("uses a system role and rejects invalid model plans without tool execution", async () => {
    const transport = vi.fn(async () => ({
      choices: [{ message: { content: '{"tool":"shell"}' } }],
    })) as unknown as JsonTransport;
    const model = new OpenAIPlanningModel(
      { baseUrl: "https://example.com/v1", model: "m", apiKey: "secret" },
      transport,
    );
    await expect(model.plan({ request: "x" })).rejects.toThrow();
    expect(transport).toHaveBeenCalledWith(
      "https://example.com/v1/chat/completions",
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "system" }),
        ]),
      }),
      { Authorization: "Bearer secret" },
      undefined,
    );
  });
});

const config = {
  url: "https://erp.example.com",
  database: "db",
  username: "user",
  apiKey: "key",
  companyId: 7,
};
function rpcMock() {
  return vi.fn(async (_url: string, body: any) => {
    const p = body.params;
    if (p.service === "common") return { result: 3 };
    const [, , , model, method] = p.args;
    if (model === "res.company")
      return { result: [{ id: 7, name: "Company" }] };
    if (method === "search_count") return { result: 250 };
    return {
      result: [{ id: 1, amount_residual: 25, currency_id: [1, "EGP"] }],
    };
  }) as unknown as JsonTransport;
}
describe("bounded Odoo finance adapter and approvals", () => {
  it("scopes every read to one company and reports truncation instead of fake total completeness", async () => {
    const transport = rpcMock(),
      odoo = new FinanceOdoo(config, transport);
    const result = await odoo.read({ dataset: "receivables", limit: 1 });
    expect(result).toMatchObject({
      totalCount: 250,
      truncated: true,
      returned: 1,
      companyId: 7,
    });
    expect(transport).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        params: expect.objectContaining({
          args: expect.arrayContaining([
            expect.objectContaining({ context: { allowed_company_ids: [7] } }),
          ]),
        }),
      }),
      {},
      undefined,
    );
  });
  it("rejects arbitrary models and overbroad read limits", async () => {
    const transport = rpcMock(),
      odoo = new FinanceOdoo(config, transport);
    await expect(odoo.read({ dataset: "res.users" })).rejects.toThrow();
    await expect(
      odoo.read({ dataset: "invoices", limit: 10000 }),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it("persists an unknown outcome and refuses to retry a possibly committed journal write", async () => {
    const { store, workspace, session } = make();
    const odoo = new FinanceOdoo(config, rpcMock());
    odoo.prepareJournal = vi.fn(async () => ({ journal: {}, accounts: [] }));
    odoo.createDraftJournal = vi.fn(async () => {
      throw new Error("timeout after commit");
    });
    const action = {
      journalId: 1,
      date: "2026-10-14",
      description: "adjustment",
      lines: [
        { accountId: 1, label: "a", debit: 1, credit: 0 },
        { accountId: 2, label: "b", debit: 0, credit: 1 },
      ],
    };
    const connectionHash = digest(JSON.stringify(config));
    const approval: JournalApproval = {
      id: randomUUID(),
      workspaceId: workspace.id,
      sessionId: session.id,
      turnId: "t",
      stepId: "s",
      action,
      connectionHash,
      actionHash: digest(JSON.stringify({ action, connectionHash })),
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
    store.saveApproval(approval);
    expect(
      (
        await decideJournal(
          store,
          workspace.id,
          approval.id,
          "approve",
          approval.actionHash,
          { odoo },
        )
      ).status,
    ).toBe("unknown");
    await expect(
      decideJournal(
        store,
        workspace.id,
        approval.id,
        "approve",
        approval.actionHash,
        { odoo },
      ),
    ).rejects.toThrow();
    expect(odoo.createDraftJournal).toHaveBeenCalledTimes(1);
  });
});

function savedApproval(
  store: FinanceStore,
  workspaceId: string,
  sessionId: string,
) {
  const action = {
    journalId: 1,
    date: "2026-10-14",
    description: "adjustment",
    lines: [
      { accountId: 1, label: "a", debit: 1, credit: 0 },
      { accountId: 2, label: "b", debit: 0, credit: 1 },
    ],
  };
  const connectionHash = digest(JSON.stringify(config));
  const approval: JournalApproval = {
    id: randomUUID(),
    workspaceId,
    sessionId,
    turnId: "t",
    stepId: "s",
    action,
    connectionHash,
    actionHash: digest(JSON.stringify({ action, connectionHash })),
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  store.saveApproval(approval);
  return approval;
}
describe("approval and execution regression gates", () => {
  it("blocks modified, expired, cross-workspace and changed-company approvals before writing", async () => {
    const { store, workspace, session } = make();
    const a = savedApproval(store, workspace.id, session.id);
    const odoo = new FinanceOdoo(config, rpcMock());
    odoo.createDraftJournal = vi.fn();
    await expect(
      decideJournal(store, workspace.id, a.id, "approve", "0".repeat(64), {
        odoo,
      }),
    ).rejects.toThrow();
    await expect(
      decideJournal(
        store,
        store.createWorkspace().id,
        a.id,
        "approve",
        a.actionHash,
        { odoo },
      ),
    ).rejects.toThrow();
    await expect(
      decideJournal(store, workspace.id, a.id, "approve", a.actionHash, {
        odoo: new FinanceOdoo({ ...config, companyId: 8 }, rpcMock()),
      }),
    ).rejects.toThrow();
    a.expiresAt = "2020-01-01T00:00:00Z";
    store.saveApproval(a);
    await expect(
      decideJournal(store, workspace.id, a.id, "approve", a.actionHash, {
        odoo,
      }),
    ).rejects.toThrow();
    expect(odoo.createDraftJournal).not.toHaveBeenCalled();
  });
  it("requires exact readback and never calls a posted or changed journal verified", async () => {
    const { store, workspace, session } = make();
    const a = savedApproval(store, workspace.id, session.id);
    const reference = "WAKIL:" + a.id;
    const transport = vi.fn(async (_url: string, body: any) => {
      if (body.params.service === "common") return { result: 3 };
      if (body.params.args[3] === "account.move")
        return {
          result: [
            {
              id: 8,
              state: "posted",
              ref: reference,
              date: a.action.date,
              journal_id: [1, "General"],
              line_ids: [11, 12],
            },
          ],
        };
      return {
        result: a.action.lines.map((l) => ({
          account_id: [l.accountId, "x"],
          name: l.label,
          debit: l.debit,
          credit: l.credit,
        })),
      };
    }) as unknown as JsonTransport;
    const odoo = new FinanceOdoo(config, transport);
    await expect(odoo.verifyJournal(8, a.action, reference)).rejects.toThrow();
  });
  it("recovers interrupted writes as UNKNOWN, never pending", () => {
    const { store, workspace, session } = make();
    const a = savedApproval(store, workspace.id, session.id);
    a.status = "executing";
    store.saveApproval(a);
    expect(
      sessionView(store, workspace.id, session.id).approvals[0].status,
    ).toBe("unknown");
    expect(store.getApproval(workspace.id, a.id)?.status).toBe("unknown");
  });
  it("prepares a proposal without ever making a write call", async () => {
    const { store, workspace, session } = make();
    const a = savedApproval(store, workspace.id, session.id);
    const odoo = new FinanceOdoo(config, rpcMock());
    odoo.prepareJournal = vi.fn(async () => ({ journal: {}, accounts: [] }));
    odoo.createDraftJournal = vi.fn();
    const model = mockModel({
      title: "تجهيز قيد",
      summary: "مسودة للمراجعة",
      clarification: null,
      steps: [
        {
          id: "proposal",
          title: "تجهيز",
          tool: "odoo.propose_journal",
          dependsOn: [],
          input: a.action,
        },
      ],
    });
    await runTurn(
      store,
      workspace.id,
      session.id,
      randomUUID(),
      "جهز قيد تعديل",
      () => {},
      signal(),
      { model, odoo },
    );
    expect(odoo.createDraftJournal).not.toHaveBeenCalled();
    expect(
      store.getSession(workspace.id, session.id)!.turns[0].steps[0].output,
    ).toMatchObject({ status: "pending" });
  });
  it("serializes approval clicks so only one create may be attempted", async () => {
    const { store, workspace, session } = make();
    const a = savedApproval(store, workspace.id, session.id);
    const odoo = new FinanceOdoo(config, rpcMock());
    let unlock!: () => void;
    const gate = new Promise<void>((r) => (unlock = r));
    odoo.prepareJournal = vi.fn(async () => {
      await gate;
      return { journal: {}, accounts: [] };
    });
    odoo.createDraftJournal = vi.fn(async () => 8);
    odoo.verifyJournal = vi.fn(async () => ({
      id: 8,
      state: "draft",
      reference: "WAKIL:" + a.id,
      record: {},
      lines: [],
      verifiedAt: new Date().toISOString(),
    }));
    const first = decideJournal(
      store,
      workspace.id,
      a.id,
      "approve",
      a.actionHash,
      { odoo },
    );
    await expect(
      decideJournal(store, workspace.id, a.id, "approve", a.actionHash, {
        odoo,
      }),
    ).rejects.toThrow();
    unlock();
    expect((await first).status).toBe("verified");
    expect(odoo.createDraftJournal).toHaveBeenCalledTimes(1);
  });
  it("rejects concurrent runs for the same session before recording a second request", async () => {
    const { store, workspace, session } = make();
    const model = mockModel({
      title: "رد",
      summary: "مرحبًا",
      clarification: null,
      steps: [],
    });
    let unlock!: () => void;
    const gate = new Promise<void>((r) => (unlock = r));
    model.plan = vi.fn(async () => {
      await gate;
      return { title: "رد", summary: "مرحبًا", clarification: null, steps: [] };
    });
    const first = runTurn(
      store,
      workspace.id,
      session.id,
      randomUUID(),
      "أول",
      () => {},
      signal(),
      { model },
    );
    await expect(
      runTurn(
        store,
        workspace.id,
        session.id,
        randomUUID(),
        "ثان",
        () => {},
        signal(),
        { model },
      ),
    ).rejects.toThrow();
    unlock();
    await first;
    expect(store.getSession(workspace.id, session.id)!.turns).toHaveLength(1);
  });
  it("refuses invalid calendar dates before preparing a journal", () => {
    const { store, workspace, session } = make();
    const a = savedApproval(store, workspace.id, session.id);
    expect(() => new Date(a.action.date)).not.toThrow();
    expect(
      journalSchema.safeParse({ ...a.action, date: "2026-02-30" }).success,
    ).toBe(false);
  });
});
