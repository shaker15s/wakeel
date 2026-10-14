import { getBuiltinModule } from "node:process";
// Node's built-in SQLite has no npm/native-addon download. Use the built-in
// loader because Vite 5 (Vitest 2) predates this node: module.
const { DatabaseSync } = getBuiltinModule(
  "node:sqlite",
) as typeof import("node:sqlite");
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ApprovalRequest,
  IdempotencyRecord,
  Task,
  TaskEvent,
  TaskStep,
  TaskStore,
} from "./types";
import { TenantIsolationError } from "./types";
import { redact } from "./redact";

// Deliberately local, single-node persistence. This is NOT a distributed worker
// engine. Run one application process against a persistent volume (Node >=22.13).
// The document envelope preserves Dates without coercing arbitrary user strings.
function encode(value: unknown): string {
  return JSON.stringify(value, function (key, v) {
    const original = this[key];
    return original instanceof Date
      ? { $wakeelDate: original.toISOString() }
      : v;
  });
}
function decode<T>(value: string): T {
  return JSON.parse(value, (_, v) =>
    v &&
    typeof v === "object" &&
    Object.keys(v).length === 1 &&
    typeof v.$wakeelDate === "string"
      ? new Date(v.$wakeelDate)
      : v,
  ) as T;
}

type Kind = "task" | "step" | "event" | "approval" | "idempotency" | "fixture";

export class SqliteTaskStore implements TaskStore {
  private db: InstanceType<typeof DatabaseSync>;
  constructor(filename: string) {
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runtime_documents (
        kind TEXT NOT NULL, id TEXT NOT NULL, scope TEXT NOT NULL,
        sequence INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL,
        PRIMARY KEY(kind, id)
      );
      CREATE INDEX IF NOT EXISTS runtime_scope ON runtime_documents(kind, scope, sequence);
      CREATE UNIQUE INDEX IF NOT EXISTS event_sequence ON runtime_documents(scope, sequence) WHERE kind='event';`);
  }
  close() {
    this.db.close();
  }
  private get<T>(kind: Kind, id: string, scope?: string): T | null {
    const row = this.db
      .prepare(
        "SELECT scope, data FROM runtime_documents WHERE kind=? AND id=?",
      )
      .get(kind, id) as { scope: string; data: string } | undefined;
    return row && (scope === undefined || row.scope === scope)
      ? decode<T>(row.data)
      : null;
  }
  private insert(
    kind: Kind,
    id: string,
    scope: string,
    data: unknown,
    sequence = 0,
  ) {
    this.db
      .prepare(
        "INSERT INTO runtime_documents(kind,id,scope,sequence,data) VALUES (?,?,?,?,?)",
      )
      .run(kind, id, scope, sequence, encode(data));
  }
  private put(kind: Kind, id: string, data: unknown) {
    this.db
      .prepare("UPDATE runtime_documents SET data=? WHERE kind=? AND id=?")
      .run(encode(data), kind, id);
  }
  private list<T>(kind: Kind, scope: string): T[] {
    return (
      this.db
        .prepare(
          "SELECT data FROM runtime_documents WHERE kind=? AND scope=? ORDER BY sequence",
        )
        .all(kind, scope) as { data: string }[]
    ).map((r) => decode<T>(r.data));
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  async createTask(
    input: Omit<Task, "status" | "createdAt" | "updatedAt" | "result">,
  ): Promise<Task> {
    const task: Task = {
      ...input,
      status: "queued",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.insert("task", task.id, task.tenantId, task, Date.now());
    return task;
  }
  async getTask(tenantId: string, taskId: string): Promise<Task | null> {
    return this.get("task", taskId, tenantId);
  }
  async listTasks(tenantId: string, limit = 100): Promise<Task[]> {
    const rows = this.db
      .prepare(
        "SELECT data FROM runtime_documents WHERE kind='task' AND scope=? ORDER BY sequence DESC LIMIT ?",
      )
      .all(tenantId, Math.min(Math.max(limit, 1), 100)) as { data: string }[];
    return rows.map((r) => decode<Task>(r.data));
  }
  async updateTask(
    tenantId: string,
    id: string,
    patch: Partial<Pick<Task, "status" | "result" | "riskClass">>,
  ): Promise<Task> {
    const task = this.get<Task>("task", id, tenantId);
    if (!task) throw new TenantIsolationError();
    const updated = { ...task, ...patch, updatedAt: new Date() };
    this.put("task", id, updated);
    return updated;
  }
  async createStep(
    input: Omit<TaskStep, "status" | "attempt"> & {
      status?: TaskStep["status"];
      attempt?: number;
    },
  ): Promise<TaskStep> {
    if (!this.get("task", input.taskId)) throw new Error("Task not found");
    const step: TaskStep = { status: "pending", attempt: 0, ...input };
    this.insert("step", step.id, step.taskId, step, step.sequence);
    return step;
  }
  async getStep(taskId: string, id: string): Promise<TaskStep | null> {
    return this.get("step", id, taskId);
  }
  async listSteps(taskId: string): Promise<TaskStep[]> {
    return this.list("step", taskId);
  }
  async updateStep(
    taskId: string,
    id: string,
    patch: Partial<TaskStep>,
  ): Promise<TaskStep> {
    const step = this.get<TaskStep>("step", id, taskId);
    if (!step) throw new Error("Step not found");
    const updated = {
      ...step,
      ...patch,
      id: step.id,
      taskId: step.taskId,
      sequence: step.sequence,
    };
    this.put("step", id, updated);
    return updated;
  }
  async appendEvent(
    input: Omit<TaskEvent, "id" | "sequence" | "createdAt">,
  ): Promise<TaskEvent> {
    return this.transaction(() => {
      if (!this.get("task", input.taskId)) throw new Error("Task not found");
      const row = this.db
        .prepare(
          "SELECT COALESCE(MAX(sequence),0) AS seq FROM runtime_documents WHERE kind='event' AND scope=?",
        )
        .get(input.taskId) as { seq: number };
      const event = {
        ...input,
        payload: redact(input.payload),
        id: randomUUID(),
        sequence: row.seq + 1,
        createdAt: new Date(),
      };
      this.insert("event", event.id, event.taskId, event, event.sequence);
      return event;
    });
  }
  async listEvents(taskId: string): Promise<TaskEvent[]> {
    return this.list("event", taskId);
  }
  async createApproval(
    input: Omit<ApprovalRequest, "status" | "requestedAt">,
  ): Promise<ApprovalRequest> {
    if (!this.get("task", input.taskId, input.tenantId))
      throw new TenantIsolationError();
    const approval: ApprovalRequest = {
      ...input,
      status: "pending",
      requestedAt: new Date(),
    };
    this.insert("approval", approval.id, approval.tenantId, approval);
    return approval;
  }
  private readApproval(tenant: string, id: string): ApprovalRequest | null {
    const approval = this.get<ApprovalRequest>("approval", id, tenant);
    if (
      approval?.status === "pending" &&
      approval.expiresAt.getTime() <= Date.now()
    ) {
      approval.status = "expired";
      this.put("approval", id, approval);
    }
    return approval;
  }
  async getApproval(
    tenant: string,
    id: string,
  ): Promise<ApprovalRequest | null> {
    return this.readApproval(tenant, id);
  }
  async decideApproval(
    tenant: string,
    id: string,
    decision: "approved" | "rejected",
    decidedBy: string,
    reason?: string,
  ): Promise<ApprovalRequest> {
    return this.transaction(() => {
      const approval = this.readApproval(tenant, id);
      if (!approval || approval.status !== "pending")
        throw new Error("Approval is not pending");
      const updated: ApprovalRequest = {
        ...approval,
        status: decision,
        decidedBy,
        decidedAt: new Date(),
        reason,
      };
      this.put("approval", id, updated);
      return updated;
    });
  }
  private key(tenant: string, tool: string, key: string) {
    return JSON.stringify([tenant, tool, key]);
  }
  async getIdempotencyRecord(
    tenant: string,
    tool: string,
    key: string,
  ): Promise<IdempotencyRecord | null> {
    return this.get("idempotency", this.key(tenant, tool, key), tenant);
  }
  async startIdempotencyRecord(
    input: Omit<
      IdempotencyRecord,
      "status" | "createdAt" | "updatedAt" | "resultRef"
    >,
  ): Promise<IdempotencyRecord> {
    const id = this.key(input.tenantId, input.toolName, input.idempotencyKey);
    const existing = this.get<IdempotencyRecord>(
      "idempotency",
      id,
      input.tenantId,
    );
    if (
      existing &&
      (existing.status !== "failed" ||
        existing.requestHash !== input.requestHash)
    )
      throw new Error("Idempotency record already claimed");
    const record: IdempotencyRecord = {
      ...input,
      status: "in_progress",
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    if (existing) this.put("idempotency", id, record);
    else this.insert("idempotency", id, input.tenantId, record);
    return record;
  }
  private finish(
    tenant: string,
    tool: string,
    key: string,
    status: "completed" | "failed",
    resultRef?: unknown,
  ): IdempotencyRecord {
    const id = this.key(tenant, tool, key);
    const record = this.get<IdempotencyRecord>("idempotency", id, tenant);
    if (!record) throw new Error("Idempotency record not found");
    const updated = { ...record, status, resultRef, updatedAt: new Date() };
    this.put("idempotency", id, updated);
    return updated;
  }
  async completeIdempotencyRecord(
    tenant: string,
    tool: string,
    key: string,
    result: unknown,
  ) {
    return this.finish(tenant, tool, key, "completed", result);
  }
  async failIdempotencyRecord(tenant: string, tool: string, key: string) {
    return this.finish(tenant, tool, key, "failed");
  }

  // Only synthetic ERP records. Never use this as a credential store.
  readFixture<T>(id: string): T | null {
    return this.get("fixture", id);
  }
  writeFixture(id: string, data: unknown) {
    this.db
      .prepare(
        "INSERT INTO runtime_documents(kind,id,scope,data) VALUES ('fixture',?,'demo',?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
      )
      .run(id, encode(data));
  }
}
