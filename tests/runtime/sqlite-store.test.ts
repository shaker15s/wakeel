import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteTaskStore } from "@/server/runtime/sqlite-store";
import {
  FakeERPConnector,
  type FakeInvoiceRecord,
} from "@/server/erp/fake-connector";
import {
  advance,
  createCreateDraftInvoiceTask,
} from "@/server/runtime/executor";
import { buildTaskView } from "@/server/runtime/demo-view";
import { ACTOR, TENANT_A, TENANT_B, VALID_INPUT } from "./helpers";

const directories: string[] = [];
const stores: SqliteTaskStore[] = [];
function open(path: string) {
  const store = new SqliteTaskStore(path);
  stores.push(store);
  return store;
}
function filename() {
  const dir = mkdtempSync(join(tmpdir(), "wakeel-test-"));
  directories.push(dir);
  return join(dir, "runtime.sqlite");
}
function persistentConnector(store: SqliteTaskStore) {
  return new FakeERPConnector(
    store.readFixture<FakeInvoiceRecord[]>("erp") ?? [],
    (data) => store.writeFixture("erp", data),
  );
}
afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {
      /* already closed to simulate restart */
    }
  }
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("SQLite local runtime persistence", () => {
  it("restores pending approval, Dates, exact hash, and all steps after closing the database", async () => {
    const path = filename();
    let store = open(path);
    const deps = { store, connector: persistentConnector(store) };
    const task = await createCreateDraftInvoiceTask(deps, {
      tenantId: TENANT_A,
      actorId: ACTOR,
      input: VALID_INPUT,
    });
    await advance(deps, TENANT_A, task.id);
    const before = await buildTaskView(store, TENANT_A, task.id);
    store.close();
    store = open(path);
    const restored = await buildTaskView(store, TENANT_A, task.id);
    expect(restored).toEqual(before);
    expect((await store.getTask(TENANT_A, task.id))?.deadline).toBeInstanceOf(
      Date,
    );
    expect(restored?.steps).toHaveLength(5);
    await store.decideApproval(
      TENANT_A,
      restored!.pendingApproval!.id,
      "approved",
      ACTOR,
    );
    const connector = persistentConnector(store);
    expect(
      (await advance({ store, connector }, TENANT_A, task.id)).status,
    ).toBe("succeeded");
    expect(connector.getCreatedInvoices()).toHaveLength(1);
    store.close();
    store = open(path);
    const restartedConnector = persistentConnector(store);
    expect(
      (
        await advance(
          { store, connector: restartedConnector },
          TENANT_A,
          task.id,
        )
      ).status,
    ).toBe("succeeded");
    expect(restartedConnector.getCreatedInvoices()).toHaveLength(1);
  });

  it("recovers a committed synthetic ERP write after reopen without duplicating it", async () => {
    const path = filename();
    let store = open(path);
    const connector = persistentConnector(store);
    connector.queueInvoiceBehavior("crash_after_write");
    await expect(
      connector.createDraftInvoice(VALID_INPUT, "crashed-write"),
    ).rejects.toThrow();
    store.close();
    store = open(path);
    const restored = persistentConnector(store);
    const found = await restored.findByIdempotencyKey(
      "invoice",
      "crashed-write",
    );
    expect(found.data?.id).toBe(1);
    await restored.createDraftInvoice(VALID_INPUT, "crashed-write");
    expect(restored.getCreatedInvoices()).toHaveLength(1);
  });

  it("scopes task lists, task mutations, and approvals to the tenant", async () => {
    const store = open(filename());
    const deps = { store, connector: new FakeERPConnector() };
    const task = await createCreateDraftInvoiceTask(deps, {
      tenantId: TENANT_A,
      actorId: ACTOR,
      input: VALID_INPUT,
    });
    await advance(deps, TENANT_A, task.id);
    expect(await store.getTask(TENANT_B, task.id)).toBeNull();
    expect(await store.listTasks(TENANT_B)).toEqual([]);
    expect(await buildTaskView(store, TENANT_B, task.id)).toBeNull();
    await expect(
      store.updateTask(TENANT_B, task.id, { status: "succeeded" }),
    ).rejects.toThrow();
    const approval = (await buildTaskView(store, TENANT_A, task.id))!
      .pendingApproval!;
    await expect(
      store.decideApproval(TENANT_B, approval.id, "approved", ACTOR),
    ).rejects.toThrow();
    expect((await store.getApproval(TENANT_A, approval.id))?.status).toBe(
      "pending",
    );
  });

  it("only accepts one competing approval decision, including on a second DB connection", async () => {
    const path = filename();
    const store = open(path);
    const second = open(path);
    const deps = { store, connector: new FakeERPConnector() };
    const task = await createCreateDraftInvoiceTask(deps, {
      tenantId: TENANT_A,
      actorId: ACTOR,
      input: VALID_INPUT,
    });
    await advance(deps, TENANT_A, task.id);
    const approval = (await buildTaskView(store, TENANT_A, task.id))!
      .pendingApproval!;
    const results = await Promise.allSettled([
      store.decideApproval(TENANT_A, approval.id, "approved", ACTOR),
      second.decideApproval(TENANT_A, approval.id, "rejected", ACTOR),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
  });

  it("persists redacted sequential events, not the unredacted payload", async () => {
    const path = filename();
    let store = open(path);
    const task = await store.createTask({
      id: "t",
      tenantId: TENANT_A,
      actorId: ACTOR,
      workflowType: "create_draft_invoice",
      input: {},
      riskClass: "LOW",
      deadline: new Date(Date.now() + 10000),
    });
    await Promise.all(
      Array.from({ length: 10 }, () =>
        store.appendEvent({
          taskId: task.id,
          type: "step_started",
          actorType: "system",
          payload: {
            token: "never-store-this",
            nested: { password: "secret" },
          },
        }),
      ),
    );
    store.close();
    store = open(path);
    const events = await store.listEvents(task.id);
    expect(events.map((e) => e.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(JSON.stringify(events)).not.toContain("never-store-this");
    expect(JSON.stringify(events)).not.toContain('"secret"');
  });

  it("does not allow an in-progress idempotency claim to be overwritten", async () => {
    const store = open(filename());
    const record = {
      tenantId: TENANT_A,
      toolName: "tool",
      idempotencyKey: "key",
      requestHash: "hash",
    };
    await store.startIdempotencyRecord(record);
    await expect(store.startIdempotencyRecord(record)).rejects.toThrow();
    await store.failIdempotencyRecord(TENANT_A, "tool", "key");
    await expect(
      store.startIdempotencyRecord({ ...record, requestHash: "other" }),
    ).rejects.toThrow();
    await expect(store.startIdempotencyRecord(record)).resolves.toMatchObject({
      status: "in_progress",
    });
  });

  it("rejects duplicate task IDs without destroying history", async () => {
    const store = open(filename());
    const task = {
      id: "duplicate",
      tenantId: TENANT_A,
      actorId: ACTOR,
      workflowType: "create_draft_invoice" as const,
      input: VALID_INPUT,
      riskClass: "LOW" as const,
      deadline: new Date(),
    };
    await store.createTask(task);
    await expect(
      store.createTask({ ...task, tenantId: TENANT_B }),
    ).rejects.toThrow();
    expect(await store.getTask(TENANT_A, task.id)).not.toBeNull();
  });
});
