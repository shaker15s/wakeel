import { expect, it } from "vitest";
import {
  advance,
  cancelTask,
  createCreateDraftInvoiceTask,
} from "@/server/runtime/executor";
import { buildTaskView } from "@/server/runtime/demo-view";
import { ACTOR, makeDeps, TENANT_A, VALID_INPUT } from "./helpers";

it("serializes simultaneous resumes: one pending approval, one write attempt", async () => {
  const deps = makeDeps();
  const task = await createCreateDraftInvoiceTask(deps, {
    tenantId: TENANT_A,
    actorId: ACTOR,
    input: VALID_INPUT,
  });
  await Promise.all(
    Array.from({ length: 8 }, () => advance(deps, TENANT_A, task.id)),
  );
  const before = (await buildTaskView(deps.store, TENANT_A, task.id))!;
  expect(
    before.events.filter((e) => e.type === "approval_requested"),
  ).toHaveLength(1);
  await deps.store.decideApproval(
    TENANT_A,
    before.pendingApproval!.id,
    "approved",
    ACTOR,
  );
  let writes = 0;
  const original = deps.connector.createDraftInvoice.bind(deps.connector);
  deps.connector.createDraftInvoice = async (...args) => {
    writes++;
    return original(...args);
  };
  const results = await Promise.all(
    Array.from({ length: 8 }, () => advance(deps, TENANT_A, task.id)),
  );
  expect(results.every((t) => t.status === "succeeded")).toBe(true);
  expect(writes).toBe(1);
});
it("a cancellation queued before resume prevents the write", async () => {
  const deps = makeDeps();
  const task = await createCreateDraftInvoiceTask(deps, {
    tenantId: TENANT_A,
    actorId: ACTOR,
    input: VALID_INPUT,
  });
  const results = await Promise.all([
    cancelTask(deps, TENANT_A, task.id, ACTOR),
    advance(deps, TENANT_A, task.id),
  ]);
  expect(results.every((t) => t.status === "cancelled")).toBe(true);
});
