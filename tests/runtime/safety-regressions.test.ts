import { describe, expect, it } from "vitest";
import {
  advance,
  createCreateDraftInvoiceTask,
} from "@/server/runtime/executor";
import { buildTaskView } from "@/server/runtime/demo-view";
import { FakeERPConnector } from "@/server/erp/fake-connector";
import { ACTOR, makeDeps, TENANT_A, VALID_INPUT } from "./helpers";

async function approvedTask() {
  const deps = makeDeps();
  const task = await createCreateDraftInvoiceTask(deps, {
    tenantId: TENANT_A,
    actorId: ACTOR,
    input: VALID_INPUT,
  });
  await advance(deps, TENANT_A, task.id);
  const approval = (await buildTaskView(deps.store, TENANT_A, task.id))!
    .pendingApproval!;
  await deps.store.decideApproval(TENANT_A, approval.id, "approved", ACTOR);
  return { deps, task, connector: deps.connector as FakeERPConnector };
}

describe("research-driven runtime regressions", () => {
  it.each(["throw", "unsuccessful", "missing-data"] as const)(
    "does not retry an ambiguous write when reconciliation is %s",
    async (mode) => {
      const { deps, task, connector } = await approvedTask();
      connector.queueInvoiceBehavior("crash_after_write");
      let calls = 0;
      const write = connector.createDraftInvoice.bind(connector);
      connector.createDraftInvoice = async (...args) => {
        calls++;
        return write(...args);
      };
      connector.findByIdempotencyKey = async () => {
        if (mode === "throw") throw new Error("Timeout on reconciliation");
        return {
          success: mode !== "unsuccessful",
          durationMs: 1,
          auditId: "reconcile",
        };
      };
      const result = await advance(deps, TENANT_A, task.id);
      expect(result.status).toBe("failed");
      expect(result.result?.unresolvedIssues).toContain(
        "ambiguous_write_outcome_needs_manual_review",
      );
      expect(calls).toBe(1);
      expect(connector.getCreatedInvoices()).toHaveLength(1);
    },
  );

  it.each([
    ["totalAmount", undefined],
    ["totalAmount", Number.NaN],
    ["lines", undefined],
    ["state", "posted"],
    ["id", 999],
    ["lines", [{ description: "Changed item", quantity: 2, unitPrice: 100 }]],
    [
      "lines",
      [{ description: "Consulting services", quantity: 1, unitPrice: 200 }],
    ],
  ])("never verifies missing or altered %s", async (field, value) => {
    const { deps, task, connector } = await approvedTask();
    connector.simulateVerificationDrift({ [field as string]: value });
    const result = await advance(deps, TENANT_A, task.id);
    expect(result.status).toBe("partially_succeeded");
    expect(connector.getCreatedInvoices()).toHaveLength(1);
  });

  it("does not turn incomplete initialization into a false success after restart", async () => {
    const deps = makeDeps();
    const task = await deps.store.createTask({
      id: "partial-init",
      tenantId: TENANT_A,
      actorId: ACTOR,
      workflowType: "create_draft_invoice",
      input: VALID_INPUT,
      riskClass: "LOW",
      deadline: new Date(Date.now() + 60000),
    });
    expect((await advance(deps, TENANT_A, task.id)).status).toBe("failed");
  });
});

it("does not accept a succeeded approval step with its approval reference removed", async () => {
  const { deps, task, connector } = await approvedTask();
  const step = (await deps.store.listSteps(task.id)).find(
    (s) => s.name === "await_approval",
  )!;
  await deps.store.updateStep(task.id, step.id, {
    status: "succeeded",
    output: {},
  });
  expect((await advance(deps, TENANT_A, task.id)).status).toBe("failed");
  expect(connector.getCreatedInvoices()).toHaveLength(0);
});

it("refuses to execute an already-approved action after the approval validity window", async () => {
  const { deps, task, connector } = await approvedTask();
  deps.now = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  expect((await advance(deps, TENANT_A, task.id)).status).toBe("failed");
  expect(connector.getCreatedInvoices()).toHaveLength(0);
});

it("retains the full human decision and approved parameters in the completed receipt", async () => {
  const { deps, task } = await approvedTask();
  await advance(deps, TENANT_A, task.id);
  const receipt = (await buildTaskView(deps.store, TENANT_A, task.id))!;
  expect(receipt.pendingApproval).toBeNull();
  expect(receipt.approval).toMatchObject({
    status: "approved",
    decidedBy: ACTOR,
    normalizedParams: VALID_INPUT,
  });
  expect(receipt.approval?.decidedAt).toBeTruthy();
});
