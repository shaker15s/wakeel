import { advance, cancelTask, createCreateDraftInvoiceTask, ExecutorDeps } from '@/server/runtime/executor';
import { InMemoryTaskStore } from '@/server/runtime/memory-store';
import { FakeERPConnector } from '@/server/erp/fake-connector';
import { PolicyEngine } from '@/server/policy/engine';
import { Task, TaskStep } from '@/server/runtime/types';

/**
 * WAKEEL — versioned evaluation suite for the `create_draft_invoice` vertical
 * slice (docs/WAKIL_CODING_AGENT_EXECUTION_PROMPT.md, Phase 4).
 *
 * Bump SUITE_VERSION whenever a scenario's setup or pass condition changes in
 * a way that would make an old report non-comparable to a new one. Adding a
 * new scenario without changing existing ones does not require a bump.
 *
 * SCOPE: this suite only covers the one implemented workflow
 * (create_draft_invoice) against the deterministic FakeERPConnector — see
 * docs/implementation/03-milestone-1-report.md for why a real Odoo
 * connector and a real model provider are both out of scope right now.
 * Two Phase-4-required categories are INTENTIONALLY NOT covered here and
 * must not be reported as passing:
 *   - "prompt injection in untrusted document/tool output": there is no
 *     model-in-the-loop or untrusted document ingestion in this slice yet
 *     (inputs are structured JSON from a form, not free text an LLM reads).
 *     Explicitly deferred in docs/implementation/03-milestone-1-report.md.
 *   - "live-provider experiments" / cost measurement: no paid model or ERP
 *     API is called anywhere in this suite, by design (rule: no unsafe
 *     autonomous writes, deterministic fakes only). Cost is reported as N/A.
 */
export const SUITE_VERSION = '2026-10-04.1';

export type ScenarioCategory =
  | 'ordinary_success'
  | 'missing_or_ambiguous_input'
  | 'invalid_tool_arguments'
  | 'policy_denial'
  | 'approval_rejected'
  | 'approval_expired'
  | 'transient_failure_recovered'
  | 'retry_budget_exhausted'
  | 'crash_after_side_effect'
  | 'duplicate_replayed_request'
  | 'verification_mismatch'
  | 'verification_read_failed'
  | 'cross_tenant_access_denied'
  | 'action_tampering_blocked'
  | 'idempotency_key_collision'
  | 'cancellation';

export interface ScenarioResult {
  id: string;
  category: ScenarioCategory;
  description: string;
  /** Did the runtime behave exactly as this scenario requires? This is the
   * "verified outcome" signal, not just "did it not throw". */
  passed: boolean;
  failureReason?: string;
  finalStatus: string;
  outcome?: string;
  latencyMs: number;
  /** How many times the connector's create call actually ran — the direct,
   * machine-checkable signal for "no duplicate side effects". */
  connectorWriteCount: number;
  eventCount: number;
  /** A task result with a non-empty summary AND (for succeeded/partial
   * outcomes) at least one audit event recording the verification step —
   * our working definition of "receipt completeness" until a dedicated
   * receipt.ts exists (see docs/implementation/00-repo-audit.md gap). */
  receiptComplete: boolean;
}

function freshDeps(overrides: Partial<ExecutorDeps> = {}): ExecutorDeps {
  return { store: new InMemoryTaskStore(), connector: new FakeERPConnector(), ...overrides };
}

const TENANT_A = 'eval-tenant-a';
const TENANT_B = 'eval-tenant-b';
const ACTOR = 'eval-actor';
const APPROVER = 'eval-approver';
const VALID_INPUT = { customerId: 'cust-eval-1', lines: [{ description: 'Consulting services', quantity: 2, unitPrice: 100 }] };

async function approvalIdOf(deps: ExecutorDeps, taskId: string): Promise<string> {
  const steps = await deps.store.listSteps(taskId);
  const step = steps.find((s: TaskStep) => s.name === 'await_approval');
  if (!step) throw new Error('await_approval step not found — workflow shape changed?');
  return (step.output as { approvalId: string }).approvalId;
}

function receiptComplete(task: Task, eventCount: number): boolean {
  if (!task.result || task.result.summary.trim().length === 0) return false;
  const needsEvidence = task.result.outcome === 'succeeded' || task.result.outcome === 'partially_succeeded';
  return needsEvidence ? eventCount > 0 : true;
}

export interface ScenarioDescriptor {
  id: string;
  category: ScenarioCategory;
  description: string;
  /** Runs this scenario now and returns its verified outcome. Safe to call
   * more than once; each call builds fresh in-memory deps. */
  exec: () => Promise<ScenarioResult>;
}

/** Wraps a scenario body with timing + a catch-all so one scenario's crash
 * can never take down the whole report (it shows up as a clear failure
 * instead), and exposes its identity up front (without running it) so test
 * names and report rows can reference it before/without executing it. */
function define(
  id: string,
  category: ScenarioCategory,
  description: string,
  body: () => Promise<Omit<ScenarioResult, 'id' | 'category' | 'description' | 'latencyMs'>>,
): ScenarioDescriptor {
  return {
    id,
    category,
    description,
    exec: async () => {
      const start = performance.now();
      try {
        const partial = await body();
        return { id, category, description, latencyMs: performance.now() - start, ...partial };
      } catch (err) {
        return {
          id,
          category,
          description,
          latencyMs: performance.now() - start,
          passed: false,
          failureReason: `threw unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
          finalStatus: 'unknown',
          connectorWriteCount: 0,
          eventCount: 0,
          receiptComplete: false,
        };
      }
    },
  };
}

export function buildScenarios(): ScenarioDescriptor[] {
  return [
    define('ordinary-success-01', 'ordinary_success', 'A well-formed request, approved, writes and verifies exactly once.', async () => {
        const deps = freshDeps();
        const connector = deps.connector as FakeERPConnector;
        const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
        await advance(deps, TENANT_A, task.id);
        await deps.store.decideApproval(TENANT_A, await approvalIdOf(deps, task.id), 'approved', APPROVER);
        const t = await advance(deps, TENANT_A, task.id);
        const events = await deps.store.listEvents(task.id);
        const passed = t.status === 'succeeded' && connector.getCreatedInvoices().length === 1;
        return {
          passed,
          failureReason: passed ? undefined : `expected succeeded+1 write, got ${t.status}/${connector.getCreatedInvoices().length}`,
          finalStatus: t.status,
          outcome: t.result?.outcome,
          connectorWriteCount: connector.getCreatedInvoices().length,
          eventCount: events.length,
          receiptComplete: receiptComplete(t, events.length),
        };
      }),

    define('missing-input-01', 'missing_or_ambiguous_input', 'Empty line items must fail validation before policy or the connector run.', async () => {
        const deps = freshDeps();
        const connector = deps.connector as FakeERPConnector;
        const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: { customerId: 'cust-1', lines: [] } });
        const t = await advance(deps, TENANT_A, task.id);
        const events = await deps.store.listEvents(task.id);
        const passed = t.status === 'failed' && (t.result?.unresolvedIssues[0] ?? '').startsWith('invalid_input:') && connector.getCreatedInvoices().length === 0;
        return {
          passed,
          failureReason: passed ? undefined : `expected failed/invalid_input with 0 writes, got ${t.status}/${t.result?.unresolvedIssues[0]}`,
          finalStatus: t.status,
          outcome: t.result?.outcome,
          connectorWriteCount: connector.getCreatedInvoices().length,
          eventCount: events.length,
          receiptComplete: receiptComplete(t, events.length),
        };
      }),

    define('invalid-args-01', 'invalid_tool_arguments', 'A structurally-present but semantically invalid argument (negative quantity) must fail validation.', async () => {
        const deps = freshDeps();
        const connector = deps.connector as FakeERPConnector;
        const task = await createCreateDraftInvoiceTask(deps, {
          tenantId: TENANT_A,
          actorId: ACTOR,
          input: { customerId: 'cust-1', lines: [{ description: 'Bad line', quantity: -5, unitPrice: 10 }] },
        });
        const t = await advance(deps, TENANT_A, task.id);
        const events = await deps.store.listEvents(task.id);
        const passed = t.status === 'failed' && (t.result?.unresolvedIssues[0] ?? '').startsWith('invalid_input:') && connector.getCreatedInvoices().length === 0;
        return {
          passed,
          failureReason: passed ? undefined : `expected failed/invalid_input with 0 writes, got ${t.status}/${t.result?.unresolvedIssues[0]}`,
          finalStatus: t.status,
          outcome: t.result?.outcome,
          connectorWriteCount: connector.getCreatedInvoices().length,
          eventCount: events.length,
          receiptComplete: receiptComplete(t, events.length),
        };
      }),

    define('policy-denial-01', 'policy_denial', 'A policy denial must block before approval and before the connector runs.', async () => {
        const deps = freshDeps();
        const connector = deps.connector as FakeERPConnector;
        // Plain monkey-patch (not vi.spyOn): this module must also run
        // standalone via scripts/eval-report.ts outside the vitest runner.
        const original = PolicyEngine.evaluate;
        PolicyEngine.evaluate = () => ({
          allowed: false,
          requiresApproval: false,
          riskLevel: 'CRITICAL',
          reason: 'eval: simulates a stricter policy',
        });
        try {
          const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
          const t = await advance(deps, TENANT_A, task.id);
          const events = await deps.store.listEvents(task.id);
          const passed = t.status === 'failed' && (t.result?.unresolvedIssues[0] ?? '').startsWith('policy_denied:') && connector.getCreatedInvoices().length === 0;
          return {
            passed,
            failureReason: passed ? undefined : `expected failed/policy_denied with 0 writes, got ${t.status}/${t.result?.unresolvedIssues[0]}`,
            finalStatus: t.status,
            outcome: t.result?.outcome,
            connectorWriteCount: connector.getCreatedInvoices().length,
            eventCount: events.length,
            receiptComplete: receiptComplete(t, events.length),
          };
        } finally {
          PolicyEngine.evaluate = original;
        }
      }),

    define('approval-rejected-01', 'approval_rejected', 'An explicit human rejection must fail the task and never call the connector.', async () => {
        const deps = freshDeps();
        const connector = deps.connector as FakeERPConnector;
        const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
        await advance(deps, TENANT_A, task.id);
        await deps.store.decideApproval(TENANT_A, await approvalIdOf(deps, task.id), 'rejected', APPROVER, 'amount looks wrong');
        const t = await advance(deps, TENANT_A, task.id);
        const events = await deps.store.listEvents(task.id);
        const passed = t.status === 'failed' && (t.result?.unresolvedIssues ?? []).includes('approval_rejected') && connector.getCreatedInvoices().length === 0;
        return {
          passed,
          failureReason: passed ? undefined : `expected failed/approval_rejected with 0 writes, got ${t.status}`,
          finalStatus: t.status,
          outcome: t.result?.outcome,
          connectorWriteCount: connector.getCreatedInvoices().length,
          eventCount: events.length,
          receiptComplete: receiptComplete(t, events.length),
        };
      }),

    define('approval-expired-01', 'approval_expired', 'An undecided approval past its TTL must fail the task, never silently proceed.', async () => {
        const deps = freshDeps({ approvalTtlMs: 5 });
        const connector = deps.connector as FakeERPConnector;
        const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
        await advance(deps, TENANT_A, task.id);
        await new Promise((r) => setTimeout(r, 30));
        const t = await advance(deps, TENANT_A, task.id);
        const events = await deps.store.listEvents(task.id);
        const passed = t.status === 'failed' && (t.result?.unresolvedIssues ?? []).includes('approval_expired') && connector.getCreatedInvoices().length === 0;
        return {
          passed,
          failureReason: passed ? undefined : `expected failed/approval_expired with 0 writes, got ${t.status}`,
          finalStatus: t.status,
          outcome: t.result?.outcome,
          connectorWriteCount: connector.getCreatedInvoices().length,
          eventCount: events.length,
          receiptComplete: receiptComplete(t, events.length),
        };
      }),

    define('transient-recovered-01', 'transient_failure_recovered', 'One confirmed-no-side-effect transient failure, then success on retry — exactly one write.', async () => {
        const deps = freshDeps();
        const connector = deps.connector as FakeERPConnector;
        connector.queueInvoiceBehavior('transient_error');
        const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
        await advance(deps, TENANT_A, task.id);
        await deps.store.decideApproval(TENANT_A, await approvalIdOf(deps, task.id), 'approved', APPROVER);
        const t = await advance(deps, TENANT_A, task.id);
        const events = await deps.store.listEvents(task.id);
        const passed = t.status === 'succeeded' && connector.getCreatedInvoices().length === 1;
        return {
          passed,
          failureReason: passed ? undefined : `expected succeeded+1 write, got ${t.status}/${connector.getCreatedInvoices().length}`,
          finalStatus: t.status,
          outcome: t.result?.outcome,
          connectorWriteCount: connector.getCreatedInvoices().length,
          eventCount: events.length,
          receiptComplete: receiptComplete(t, events.length),
        };
      }),

    define('retry-exhausted-01', 'retry_budget_exhausted', 'Three consecutive confirmed-no-side-effect failures must exhaust the retry budget and fail cleanly, with 0 writes.', async () => {
        const deps = freshDeps();
        const connector = deps.connector as FakeERPConnector;
        connector.queueInvoiceBehavior('transient_error');
        connector.queueInvoiceBehavior('transient_error');
        connector.queueInvoiceBehavior('transient_error');
        const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
        await advance(deps, TENANT_A, task.id);
        await deps.store.decideApproval(TENANT_A, await approvalIdOf(deps, task.id), 'approved', APPROVER);
        const t = await advance(deps, TENANT_A, task.id);
        const events = await deps.store.listEvents(task.id);
        const passed = t.status === 'failed' && (t.result?.unresolvedIssues ?? []).includes('retry_exhausted') && connector.getCreatedInvoices().length === 0;
        return {
          passed,
          failureReason: passed ? undefined : `expected failed/retry_exhausted with 0 writes, got ${t.status}`,
          finalStatus: t.status,
          outcome: t.result?.outcome,
          connectorWriteCount: connector.getCreatedInvoices().length,
          eventCount: events.length,
          receiptComplete: receiptComplete(t, events.length),
        };
      }),

    define(
        'crash-after-write-01',
        'crash_after_side_effect',
        'The connector call throws AFTER its side effect landed (crash window) — must reconcile to exactly one write, not zero and not two.',
        async () => {
          const deps = freshDeps();
          const connector = deps.connector as FakeERPConnector;
          connector.queueInvoiceBehavior('crash_after_write');
          const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
          await advance(deps, TENANT_A, task.id);
          await deps.store.decideApproval(TENANT_A, await approvalIdOf(deps, task.id), 'approved', APPROVER);
          const t = await advance(deps, TENANT_A, task.id);
          const events = await deps.store.listEvents(task.id);
          const passed = t.status === 'succeeded' && connector.getCreatedInvoices().length === 1;
          return {
            passed,
            failureReason: passed ? undefined : `expected succeeded+1 write, got ${t.status}/${connector.getCreatedInvoices().length}`,
            finalStatus: t.status,
            outcome: t.result?.outcome,
            connectorWriteCount: connector.getCreatedInvoices().length,
            eventCount: events.length,
            receiptComplete: receiptComplete(t, events.length),
          };
        },
      ),

    define(
        'duplicate-replay-01',
        'duplicate_replayed_request',
        'Re-entering execute_write after it already completed (simulated crash/restart) must NOT call the connector again.',
        async () => {
          const deps = freshDeps();
          const connector = deps.connector as FakeERPConnector;
          const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
          await advance(deps, TENANT_A, task.id);
          await deps.store.decideApproval(TENANT_A, await approvalIdOf(deps, task.id), 'approved', APPROVER);
          await advance(deps, TENANT_A, task.id);
          const steps = await deps.store.listSteps(task.id);
          const execStep = steps.find((s) => s.name === 'execute_write')!;
          await deps.store.updateStep(task.id, execStep.id, { status: 'pending' });
          await deps.store.updateTask(TENANT_A, task.id, { status: 'running' });
          const t = await advance(deps, TENANT_A, task.id);
          const events = await deps.store.listEvents(task.id);
          const passed = t.status === 'succeeded' && connector.getCreatedInvoices().length === 1;
          return {
            passed,
            failureReason: passed ? undefined : `expected succeeded+1 write after replay, got ${t.status}/${connector.getCreatedInvoices().length}`,
            finalStatus: t.status,
            outcome: t.result?.outcome,
            connectorWriteCount: connector.getCreatedInvoices().length,
            eventCount: events.length,
            receiptComplete: receiptComplete(t, events.length),
          };
        },
      ),

    define(
        'verification-mismatch-01',
        'verification_mismatch',
        'A read-after-write that does not match the approved request must report partially_succeeded, never succeeded.',
        async () => {
          const deps = freshDeps();
          const connector = deps.connector as FakeERPConnector;
          const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
          await advance(deps, TENANT_A, task.id);
          await deps.store.decideApproval(TENANT_A, await approvalIdOf(deps, task.id), 'approved', APPROVER);
          connector.simulateVerificationDrift({ customerId: 'someone-else' });
          const t = await advance(deps, TENANT_A, task.id);
          const events = await deps.store.listEvents(task.id);
          const passed =
            t.status === 'partially_succeeded' &&
            (t.result?.unresolvedIssues ?? []).includes('customerId_mismatch') &&
            connector.getCreatedInvoices().length === 1;
          return {
            passed,
            failureReason: passed ? undefined : `expected partially_succeeded/customerId_mismatch, got ${t.status}/${t.result?.unresolvedIssues}`,
            finalStatus: t.status,
            outcome: t.result?.outcome,
            connectorWriteCount: connector.getCreatedInvoices().length,
            eventCount: events.length,
            receiptComplete: receiptComplete(t, events.length),
          };
        },
      ),

    define(
        'verification-read-failed-01',
        'verification_read_failed',
        'A write that cannot be read back at all must report partially_succeeded, not silently succeeded.',
        async () => {
          const deps = freshDeps();
          const connector = deps.connector as FakeERPConnector;
          const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
          await advance(deps, TENANT_A, task.id);
          await deps.store.decideApproval(TENANT_A, await approvalIdOf(deps, task.id), 'approved', APPROVER);
          const original = connector.getEntityById.bind(connector);
          connector.getEntityById = async (entityId: string, id: string | number) => {
            if (entityId === 'invoice') return { success: true, data: null, durationMs: 1, auditId: 'eval-forced-not-found' };
            return original(entityId, id);
          };
          const t = await advance(deps, TENANT_A, task.id);
          const events = await deps.store.listEvents(task.id);
          const passed = t.status === 'partially_succeeded' && (t.result?.unresolvedIssues[0] ?? '').startsWith('verification_read_failed');
          return {
            passed,
            failureReason: passed ? undefined : `expected partially_succeeded/verification_read_failed, got ${t.status}/${t.result?.unresolvedIssues[0]}`,
            finalStatus: t.status,
            outcome: t.result?.outcome,
            connectorWriteCount: connector.getCreatedInvoices().length,
            eventCount: events.length,
            receiptComplete: receiptComplete(t, events.length),
          };
        },
      ),

    define(
        'cross-tenant-01',
        'cross_tenant_access_denied',
        "Tenant B must not be able to read, advance, or decide tenant A's task/approval, and tenant A must stay unaffected.",
        async () => {
          const deps = freshDeps();
          const connector = deps.connector as FakeERPConnector;
          const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });

          const readByB = await deps.store.getTask(TENANT_B, task.id);
          let advanceByBThrew = false;
          try {
            await advance(deps, TENANT_B, task.id);
          } catch {
            advanceByBThrew = true;
          }

          await advance(deps, TENANT_A, task.id);
          const approvalId = await approvalIdOf(deps, task.id);
          const approvalReadByB = await deps.store.getApproval(TENANT_B, approvalId);
          let decideByBThrew = false;
          try {
            await deps.store.decideApproval(TENANT_B, approvalId, 'approved', 'attacker');
          } catch {
            decideByBThrew = true;
          }
          const stillPending = await deps.store.getApproval(TENANT_A, approvalId);

          const events = await deps.store.listEvents(task.id);
          const passed =
            readByB === null &&
            advanceByBThrew &&
            approvalReadByB === null &&
            decideByBThrew &&
            stillPending?.status === 'pending' &&
            connector.getCreatedInvoices().length === 0;
          return {
            passed,
            failureReason: passed ? undefined : 'a cross-tenant read/mutation was not blocked, or tenant A state was disturbed',
            finalStatus: 'waiting_for_approval',
            connectorWriteCount: connector.getCreatedInvoices().length,
            eventCount: events.length,
            receiptComplete: true,
          };
        },
      ),

    define(
        'action-tampering-01',
        'action_tampering_blocked',
        'A corrupted stored action hash must block execution even after a legitimate-looking approval.',
        async () => {
          const deps = freshDeps();
          const connector = deps.connector as FakeERPConnector;
          const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
          await advance(deps, TENANT_A, task.id);
          const approvalId = await approvalIdOf(deps, task.id);
          const rawApprovals = (deps.store as unknown as { approvals: Map<string, { actionHash: string }> }).approvals;
          rawApprovals.get(approvalId)!.actionHash = '0'.repeat(64);
          await deps.store.decideApproval(TENANT_A, approvalId, 'approved', APPROVER);
          const t = await advance(deps, TENANT_A, task.id);
          const events = await deps.store.listEvents(task.id);
          const passed =
            t.status === 'failed' &&
            (t.result?.unresolvedIssues ?? []).includes('action_hash_mismatch_at_execution') &&
            connector.getCreatedInvoices().length === 0;
          return {
            passed,
            failureReason: passed ? undefined : `expected failed/action_hash_mismatch_at_execution, got ${t.status}`,
            finalStatus: t.status,
            outcome: t.result?.outcome,
            connectorWriteCount: connector.getCreatedInvoices().length,
            eventCount: events.length,
            receiptComplete: receiptComplete(t, events.length),
          };
        },
      ),

    define(
        'idempotency-collision-01',
        'idempotency_key_collision',
        'The same idempotency key associated with a different request hash (corruption/bug model) must be rejected, never trusted blindly.',
        async () => {
          const deps = freshDeps();
          const connector = deps.connector as FakeERPConnector;
          const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
          await advance(deps, TENANT_A, task.id);
          await deps.store.decideApproval(TENANT_A, await approvalIdOf(deps, task.id), 'approved', APPROVER);
          await advance(deps, TENANT_A, task.id);
          const steps = await deps.store.listSteps(task.id);
          const execStep = steps.find((s) => s.name === 'execute_write')!;
          const key = `task:${task.id}:execute_write`;
          const rawMap = (deps.store as unknown as { idempotency: Map<string, { requestHash: string }> }).idempotency;
          const mapKey = `${TENANT_A}::create_draft_invoice::${key}`;
          rawMap.get(mapKey)!.requestHash = 'eval-tampered-hash';
          await deps.store.updateStep(task.id, execStep.id, { status: 'pending' });
          await deps.store.updateTask(TENANT_A, task.id, { status: 'running' });
          const t = await advance(deps, TENANT_A, task.id);
          const events = await deps.store.listEvents(task.id);
          const passed = t.status === 'failed' && (t.result?.unresolvedIssues ?? []).includes('idempotency_key_reused_with_different_request');
          return {
            passed,
            failureReason: passed ? undefined : `expected failed/idempotency_key_reused_with_different_request, got ${t.status}`,
            finalStatus: t.status,
            outcome: t.result?.outcome,
            connectorWriteCount: connector.getCreatedInvoices().length,
            eventCount: events.length,
            receiptComplete: receiptComplete(t, events.length),
          };
        },
      ),

    define(
      'cancellation-01',
      'cancellation',
      'A human can cancel a task before any write occurs; the task becomes terminal and the connector is never called.',
      async () => {
        const deps = freshDeps();
        const connector = deps.connector as FakeERPConnector;
        const task = await createCreateDraftInvoiceTask(deps, { tenantId: TENANT_A, actorId: ACTOR, input: VALID_INPUT });
        await advance(deps, TENANT_A, task.id); // now waiting_for_approval
        const t = await cancelTask(deps, TENANT_A, task.id, ACTOR, 'eval: cancelling before approval');
        const events = await deps.store.listEvents(task.id);
        const passed =
          t.status === 'cancelled' &&
          (t.result?.unresolvedIssues ?? []).includes('cancelled_by_actor') &&
          connector.getCreatedInvoices().length === 0;
        return {
          passed,
          failureReason: passed ? undefined : `expected cancelled/cancelled_by_actor with 0 writes, got ${t.status}`,
          finalStatus: t.status,
          outcome: t.result?.outcome,
          connectorWriteCount: connector.getCreatedInvoices().length,
          eventCount: events.length,
          receiptComplete: receiptComplete(t, events.length),
        };
      },
    ),
  ];
}
