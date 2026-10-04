import { randomUUID } from 'crypto';
import { PolicyEngine } from '@/server/policy/engine';
import { IERPConnector } from '@/server/erp/contract';
import { computeActionHash } from './action-hash';
import {
  CREATE_DRAFT_INVOICE_STEPS,
  computeInvoiceAmount,
  createDraftInvoiceInputSchema,
  WORKFLOW_TYPE,
} from './workflows/create-draft-invoice';
import { ApprovalRequest, RiskLevel, Task, TaskStore, TERMINAL_TASK_STATUSES } from './types';

/** The one policy version this milestone's PolicyEngine implements (see src/server/policy/engine.ts header). */
export const POLICY_VERSION = 'policy-engine-v0.1';

const TOOL_NAME = 'create_draft_invoice';
const DEFAULT_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_TASK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d
const EXECUTE_WRITE_MAX_ATTEMPTS = 3;

export interface ExecutorDeps {
  store: TaskStore;
  connector: IERPConnector;
  /** Injectable clock for deterministic tests. Defaults to real time. */
  now?: () => Date;
  /** Overrides the default 24h approval TTL. Mainly for tests. */
  approvalTtlMs?: number;
}

export interface CreateTaskParams {
  tenantId: string;
  actorId: string;
  input: unknown;
  /** Overrides the default 7-day task deadline. Mainly for tests. */
  deadlineMs?: number;
}

/**
 * Creates a `create_draft_invoice` Task with all 5 steps pre-materialized as
 * `pending`. Nothing executes yet — call `advance()` to run it. Validation
 * deliberately happens as step 1 (not here), so even a malformed submission
 * is captured as an auditable task/event rather than silently rejected.
 */
export async function createCreateDraftInvoiceTask(deps: ExecutorDeps, params: CreateTaskParams): Promise<Task> {
  const now = (deps.now ?? (() => new Date()))();
  const taskId = randomUUID();
  const deadline = new Date(now.getTime() + (params.deadlineMs ?? DEFAULT_TASK_TTL_MS));

  const task = await deps.store.createTask({
    id: taskId,
    tenantId: params.tenantId,
    actorId: params.actorId,
    workflowType: WORKFLOW_TYPE,
    riskClass: 'MEDIUM', // refined once policy_check runs
    input: params.input,
    deadline,
  });

  for (let i = 0; i < CREATE_DRAFT_INVOICE_STEPS.length; i++) {
    await deps.store.createStep({
      id: randomUUID(),
      taskId,
      sequence: i + 1,
      name: CREATE_DRAFT_INVOICE_STEPS[i],
      maxAttempts: CREATE_DRAFT_INVOICE_STEPS[i] === 'execute_write' ? EXECUTE_WRITE_MAX_ATTEMPTS : 1,
    });
  }

  await deps.store.appendEvent({
    taskId,
    type: 'task_created',
    actorType: 'human',
    actorId: params.actorId,
    payload: { workflowType: WORKFLOW_TYPE },
  });

  return task;
}

async function fail(deps: ExecutorDeps, tenantId: string, taskId: string, summary: string, unresolvedIssues: string[]): Promise<Task> {
  await deps.store.appendEvent({
    taskId,
    type: 'task_status_changed',
    actorType: 'system',
    payload: { status: 'failed', summary, unresolvedIssues },
  });
  return deps.store.updateTask(tenantId, taskId, {
    status: 'failed',
    result: { outcome: 'failed', summary, unresolvedIssues },
  });
}

async function partiallySucceed(
  deps: ExecutorDeps,
  tenantId: string,
  taskId: string,
  summary: string,
  unresolvedIssues: string[],
): Promise<Task> {
  await deps.store.appendEvent({
    taskId,
    type: 'task_status_changed',
    actorType: 'system',
    payload: { status: 'partially_succeeded', summary, unresolvedIssues },
  });
  return deps.store.updateTask(tenantId, taskId, {
    status: 'partially_succeeded',
    result: { outcome: 'partially_succeeded', summary, unresolvedIssues },
  });
}

async function succeed(deps: ExecutorDeps, tenantId: string, taskId: string, summary: string): Promise<Task> {
  await deps.store.appendEvent({
    taskId,
    type: 'task_status_changed',
    actorType: 'system',
    payload: { status: 'succeeded', summary },
  });
  return deps.store.updateTask(tenantId, taskId, {
    status: 'succeeded',
    result: { outcome: 'succeeded', summary, unresolvedIssues: [] },
  });
}

/**
 * Cancels a task on explicit human request. Safe by construction:
 *  - a no-op (returns the task unchanged) if it is already in a terminal
 *    state — including an already-cancelled task, so double-cancellation
 *    cannot append duplicate events or raise;
 *  - REFUSED once `execute_write` has already succeeded. Once the external
 *    side effect has actually happened, "cancel" is no longer a safe
 *    no-consequence action — undoing it would need a real compensating
 *    action (e.g. void/delete the created invoice), which this workflow
 *    does not implement. Silently marking the task `cancelled` at that
 *    point would misreport a real outcome as if nothing happened.
 * Tenant-scoped like every other store operation: a task invisible to
 * `tenantId` here throws, same as `advance()`.
 */
export async function cancelTask(
  deps: ExecutorDeps,
  tenantId: string,
  taskId: string,
  actorId: string,
  reason?: string,
): Promise<Task> {
  const task = await deps.store.getTask(tenantId, taskId);
  if (!task) throw new Error(`Task ${taskId} not found for tenant ${tenantId}`);
  if (TERMINAL_TASK_STATUSES.has(task.status)) return task;

  const steps = await deps.store.listSteps(taskId);
  const executeStep = steps.find((s) => s.name === 'execute_write');
  if (executeStep?.status === 'succeeded') {
    throw new Error(
      'Cannot cancel: the write already completed. This requires a compensating action (e.g. voiding the invoice), not a cancellation.',
    );
  }

  // A pending approval left dangling on a cancelled (terminal) task is a
  // stale, confusing state — e.g. a UI would keep showing an "approve this"
  // card for a task that is already over. Resolve it as part of the same
  // cancellation, not as an afterthought the caller has to remember.
  const approvalStep = steps.find((s) => s.name === 'await_approval');
  const approvalId = (approvalStep?.output as { approvalId?: string } | undefined)?.approvalId;
  if (approvalId) {
    const approval = await deps.store.getApproval(tenantId, approvalId);
    if (approval?.status === 'pending') {
      await deps.store.decideApproval(tenantId, approvalId, 'rejected', actorId, 'Task was cancelled before a decision was made.');
    }
  }

  await deps.store.appendEvent({
    taskId,
    type: 'task_status_changed',
    actorType: 'human',
    actorId,
    payload: { status: 'cancelled', reason: reason ?? null },
  });

  return deps.store.updateTask(tenantId, taskId, {
    status: 'cancelled',
    result: {
      outcome: 'cancelled',
      summary: reason ? `Cancelled: ${reason}` : 'Cancelled by request before any write occurred.',
      unresolvedIssues: ['cancelled_by_actor'],
    },
  });
}

/**
 * Resumable orchestrator tick. Safe to call repeatedly (including after a
 * crash/restart): it re-reads persisted task/step state every time and never
 * re-executes a step already marked `succeeded`, never re-decides an
 * approval, and never blindly re-calls a side-effecting tool whose outcome
 * is unknown (see execute_write handling below).
 *
 * Advances as far as it can synchronously, then returns — either because the
 * task reached a terminal state, or because it is now blocked on a human
 * decision (`waiting_for_approval`).
 */
export async function advance(deps: ExecutorDeps, tenantId: string, taskId: string): Promise<Task> {
  const now = (deps.now ?? (() => new Date()))();
  let task = await deps.store.getTask(tenantId, taskId);
  if (!task) throw new Error(`Task ${taskId} not found for tenant ${tenantId}`);

  while (true) {
    if (TERMINAL_TASK_STATUSES.has(task.status)) return task;

    if (task.deadline.getTime() < now.getTime()) {
      await deps.store.appendEvent({ taskId, type: 'task_status_changed', actorType: 'system', payload: { status: 'expired' } });
      return deps.store.updateTask(tenantId, taskId, {
        status: 'expired',
        result: { outcome: 'expired', summary: 'Task exceeded its deadline before completing.', unresolvedIssues: ['deadline_exceeded'] },
      });
    }

    const steps = await deps.store.listSteps(taskId);
    const current = steps.find((s) => s.status !== 'succeeded' && s.status !== 'skipped' && s.status !== 'failed');
    if (!current) {
      // All steps resolved without the per-step handlers setting a terminal
      // task status — defensive fallback, should not happen in practice.
      return succeed(deps, tenantId, taskId, 'All steps completed.');
    }

    if (current.name === 'validate_input') {
      const parsed = createDraftInvoiceInputSchema.safeParse(task.input);
      if (!parsed.success) {
        await deps.store.updateStep(taskId, current.id, {
          status: 'failed',
          errorCode: 'INVALID_INPUT',
          errorMessage: parsed.error.message,
          finishedAt: now,
        });
        return fail(deps, tenantId, taskId, 'Input failed validation.', [
          `invalid_input: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
        ]);
      }
      await deps.store.updateStep(taskId, current.id, {
        status: 'succeeded',
        output: parsed.data,
        startedAt: now,
        finishedAt: now,
      });
      task = await deps.store.getTask(tenantId, taskId) as Task;
      continue;
    }

    if (current.name === 'policy_check') {
      const validateStep = steps.find((s) => s.name === 'validate_input')!;
      const input = validateStep.output as ReturnType<typeof createDraftInvoiceInputSchema.parse>;
      const amount = computeInvoiceAmount(input);

      const decision = PolicyEngine.evaluate({
        toolName: TOOL_NAME,
        category: 'DRAFT_WRITE',
        parameters: input,
        operatorId: task.actorId,
        amount,
      });

      if (!decision.allowed) {
        await deps.store.updateStep(taskId, current.id, {
          status: 'failed',
          errorCode: 'POLICY_DENIED',
          errorMessage: decision.reason,
          finishedAt: now,
        });
        return fail(deps, tenantId, taskId, 'Blocked by policy.', [`policy_denied: ${decision.reason}`]);
      }

      const resourceRef = `customer:${input.customerId}`;
      const actionHash = computeActionHash({
        toolName: TOOL_NAME,
        normalizedParams: input,
        policyVersion: POLICY_VERSION,
        resourceRef,
      });

      await deps.store.updateStep(taskId, current.id, {
        status: 'succeeded',
        output: { decision, actionHash, policyVersion: POLICY_VERSION, resourceRef },
        startedAt: now,
        finishedAt: now,
      });
      await deps.store.updateTask(tenantId, taskId, { riskClass: decision.riskLevel as RiskLevel });
      task = await deps.store.getTask(tenantId, taskId) as Task;
      continue;
    }

    if (current.name === 'await_approval') {
      const policyStep = steps.find((s) => s.name === 'policy_check')!;
      const { decision, actionHash, policyVersion, resourceRef } = policyStep.output as {
        decision: ReturnType<typeof PolicyEngine.evaluate>;
        actionHash: string;
        policyVersion: string;
        resourceRef: string;
      };

      let approvalId = (current.output as { approvalId?: string } | undefined)?.approvalId;
      let approval: ApprovalRequest | null = null;

      if (!approvalId) {
        if (!decision.requiresApproval) {
          // v0 policy always requires approval for this workflow; this branch
          // exists only so a future, less-strict policy doesn't silently skip
          // human review by accident — it is explicit, not implicit.
          await deps.store.updateStep(taskId, current.id, { status: 'skipped', startedAt: now, finishedAt: now });
          task = await deps.store.getTask(tenantId, taskId) as Task;
          continue;
        }
        const created = await deps.store.createApproval({
          id: randomUUID(),
          taskId,
          stepId: current.id,
          tenantId,
          toolName: TOOL_NAME,
          actionHash,
          normalizedParams: (steps.find((s) => s.name === 'validate_input')!.output),
          policyVersion,
          riskLevel: decision.riskLevel,
          summary: decision.approvalCard?.description ?? decision.reason,
          expiresAt: new Date(now.getTime() + (deps.approvalTtlMs ?? DEFAULT_APPROVAL_TTL_MS)),
        });
        approvalId = created.id;
        approval = created;
        await deps.store.updateStep(taskId, current.id, {
          status: 'waiting_for_approval',
          output: { approvalId },
          startedAt: now,
        });
        await deps.store.appendEvent({
          taskId,
          type: 'approval_requested',
          actorType: 'system',
          payload: { approvalId, actionHash, riskLevel: decision.riskLevel, resourceRef },
        });
      } else {
        approval = await deps.store.getApproval(tenantId, approvalId);
        if (!approval) throw new Error(`Approval ${approvalId} referenced by step ${current.id} not found`);
      }

      if (approval.status === 'pending') {
        return deps.store.updateTask(tenantId, taskId, { status: 'waiting_for_approval' });
      }

      if (approval.status === 'expired') {
        await deps.store.updateStep(taskId, current.id, { status: 'failed', errorCode: 'APPROVAL_EXPIRED', finishedAt: now });
        await deps.store.appendEvent({ taskId, type: 'approval_expired', actorType: 'system', payload: { approvalId } });
        return fail(deps, tenantId, taskId, 'Approval request expired before a decision was made.', ['approval_expired']);
      }

      if (approval.status === 'rejected') {
        await deps.store.updateStep(taskId, current.id, { status: 'failed', errorCode: 'APPROVAL_REJECTED', finishedAt: now });
        await deps.store.appendEvent({
          taskId,
          type: 'approval_decided',
          actorType: 'human',
          actorId: approval.decidedBy,
          payload: { approvalId, decision: 'rejected', reason: approval.reason },
        });
        return fail(deps, tenantId, taskId, `Approval was rejected by ${approval.decidedBy}.`, ['approval_rejected']);
      }

      // approved
      await deps.store.appendEvent({
        taskId,
        type: 'approval_decided',
        actorType: 'human',
        actorId: approval.decidedBy,
        payload: { approvalId, decision: 'approved' },
      });
      await deps.store.updateStep(taskId, current.id, {
        status: 'succeeded',
        output: { approvalId, decidedBy: approval.decidedBy },
        finishedAt: now,
      });
      task = await deps.store.getTask(tenantId, taskId) as Task;
      continue;
    }

    if (current.name === 'execute_write') {
      const validateStep = steps.find((s) => s.name === 'validate_input')!;
      const policyStep = steps.find((s) => s.name === 'policy_check')!;
      const approvalStep = steps.find((s) => s.name === 'await_approval')!;
      const input = validateStep.output as ReturnType<typeof createDraftInvoiceInputSchema.parse>;

      const recomputedHash = computeActionHash({
        toolName: TOOL_NAME,
        normalizedParams: input,
        policyVersion: (policyStep.output as { policyVersion: string }).policyVersion,
        resourceRef: (policyStep.output as { resourceRef: string }).resourceRef,
      });

      // The action actually executed must match exactly what a human
      // approved, re-checked against the PERSISTED approval record (not
      // just the freshly-recomputed policy_check value) so that any
      // tampering with the stored approval — its action hash changed, or it
      // doesn't belong to this task/tool at all — is caught here, as the
      // last line of defense before an external side effect happens.
      const approvalStepOutput = approvalStep.output as { approvalId?: string } | undefined;
      let expectedHash = (policyStep.output as { actionHash: string }).actionHash;
      if (approvalStepOutput?.approvalId) {
        const approval = await deps.store.getApproval(tenantId, approvalStepOutput.approvalId);
        if (!approval || approval.status !== 'approved' || approval.taskId !== taskId || approval.toolName !== TOOL_NAME) {
          await deps.store.updateStep(taskId, current.id, { status: 'failed', errorCode: 'APPROVAL_INVALID', finishedAt: now });
          return fail(deps, tenantId, taskId, 'Approval record is missing, unapproved, or does not match this task; refusing to execute.', [
            'approval_invalid_at_execution',
          ]);
        }
        expectedHash = approval.actionHash;
      }
      if (recomputedHash !== expectedHash) {
        await deps.store.updateStep(taskId, current.id, { status: 'failed', errorCode: 'ACTION_HASH_MISMATCH', finishedAt: now });
        return fail(deps, tenantId, taskId, 'Approved action hash does not match the action about to execute; refusing to execute.', [
          'action_hash_mismatch_at_execution',
        ]);
      }

      const idempotencyKey = `task:${taskId}:execute_write`;
      const result = await runIdempotentWrite(deps, tenantId, taskId, current.id, idempotencyKey, recomputedHash, input);
      if (result.status === 'blocked') {
        return result.task;
      }
      task = await deps.store.getTask(tenantId, taskId) as Task;
      continue;
    }

    if (current.name === 'verify') {
      const execStep = steps.find((s) => s.name === 'execute_write')!;
      const validateStep = steps.find((s) => s.name === 'validate_input')!;
      const input = validateStep.output as ReturnType<typeof createDraftInvoiceInputSchema.parse>;
      const written = execStep.output as { invoiceId: string | number; invoiceNumber?: string; state: 'draft' };

      let verified: any = null;
      try {
        const read = await deps.connector.getEntityById('invoice', written.invoiceId);
        verified = read.success ? read.data : null;
      } catch {
        verified = null;
      }

      const expectedAmount = computeInvoiceAmount(input);
      const mismatches: string[] = [];
      if (!verified) {
        mismatches.push('verification_read_failed: invoice not found after creation');
      } else {
        if (String(verified.customerId) !== String(input.customerId)) mismatches.push('customerId_mismatch');
        if (typeof verified.totalAmount === 'number' && Math.abs(verified.totalAmount - expectedAmount) > 0.005) {
          mismatches.push('amount_mismatch');
        }
        if (Array.isArray(verified.lines) && verified.lines.length !== input.lines.length) mismatches.push('line_count_mismatch');
      }

      if (mismatches.length === 0) {
        await deps.store.updateStep(taskId, current.id, { status: 'succeeded', output: verified, startedAt: now, finishedAt: now });
        await deps.store.appendEvent({ taskId, type: 'verification_result', actorType: 'system', payload: { ok: true, invoiceId: written.invoiceId } });
        return succeed(deps, tenantId, taskId, `Draft invoice ${written.invoiceNumber ?? written.invoiceId} created and verified.`);
      }

      await deps.store.updateStep(taskId, current.id, {
        status: 'failed',
        errorCode: 'VERIFICATION_MISMATCH',
        errorMessage: mismatches.join('; '),
        startedAt: now,
        finishedAt: now,
      });
      await deps.store.appendEvent({ taskId, type: 'verification_result', actorType: 'system', payload: { ok: false, mismatches } });
      // The write almost certainly happened (we have an invoiceId) but we
      // could not confirm it matches what was approved — this is NEVER
      // reported as `succeeded`.
      return partiallySucceed(
        deps,
        tenantId,
        taskId,
        `Draft invoice ${written.invoiceNumber ?? written.invoiceId} was created but verification could not confirm it matches the approved request.`,
        mismatches,
      );
    }

    throw new Error(`Unhandled step: ${current.name}`);
  }
}

type WriteOutcome = { status: 'advanced' } | { status: 'blocked'; task: Task };

async function runIdempotentWrite(
  deps: ExecutorDeps,
  tenantId: string,
  taskId: string,
  stepId: string,
  idempotencyKey: string,
  requestHash: string,
  input: ReturnType<typeof createDraftInvoiceInputSchema.parse>,
): Promise<WriteOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const existing = await deps.store.getIdempotencyRecord(tenantId, TOOL_NAME, idempotencyKey);

  if (existing?.status === 'completed') {
    if (existing.requestHash !== requestHash) {
      await deps.store.updateStep(taskId, stepId, { status: 'failed', errorCode: 'IDEMPOTENCY_KEY_REUSED', finishedAt: now });
      return { status: 'blocked', task: await fail(deps, tenantId, taskId, 'Idempotency key reused with a different request.', ['idempotency_key_reused_with_different_request']) };
    }
    // Dedup: a previous attempt already completed this exact write
    // (possibly the process crashed right after, before the step record was
    // updated). Reuse the cached result; do NOT call the connector again.
    await deps.store.updateStep(taskId, stepId, { status: 'succeeded', output: existing.resultRef, finishedAt: now });
    return { status: 'advanced' };
  }

  if (existing?.status === 'in_progress') {
    const reconciled = await tryReconcile(deps, tenantId, idempotencyKey);
    if (reconciled) {
      await deps.store.completeIdempotencyRecord(tenantId, TOOL_NAME, idempotencyKey, reconciled);
      await deps.store.updateStep(taskId, stepId, { status: 'succeeded', output: reconciled, finishedAt: now });
      return { status: 'advanced' };
    }
    // Ambiguous: a previous attempt is (or claims to be) still in flight and
    // we have no way to confirm whether it already took effect. Never retry
    // blindly — escalate instead of risking a duplicate financial write.
    await deps.store.updateStep(taskId, stepId, { status: 'failed', errorCode: 'AMBIGUOUS_WRITE_OUTCOME', finishedAt: now });
    return {
      status: 'blocked',
      task: await fail(deps, tenantId, taskId, 'Previous write attempt has an unknown outcome; escalating for manual review instead of retrying.', [
        'ambiguous_write_outcome_needs_manual_review',
      ]),
    };
  }

  // existing is null, or a prior attempt definitively failed with no side
  // effect (status 'failed') — safe to (re)try, subject to maxAttempts.
  const step = await deps.store.getStep(taskId, stepId);
  if (!step) throw new Error(`Step ${stepId} not found`);
  if (step.attempt >= step.maxAttempts) {
    return {
      status: 'blocked',
      task: await fail(deps, tenantId, taskId, 'Exceeded maximum retry attempts for the write step.', ['retry_exhausted']),
    };
  }

  await deps.store.updateStep(taskId, stepId, { status: 'running', attempt: step.attempt + 1, startedAt: now });
  await deps.store.startIdempotencyRecord({ tenantId, toolName: TOOL_NAME, idempotencyKey, requestHash });
  await deps.store.appendEvent({ taskId, type: 'step_started', actorType: 'system', payload: { step: 'execute_write', attempt: step.attempt + 1 } });

  try {
    const result = await deps.connector.createDraftInvoice(
      { customerId: input.customerId, lines: input.lines },
      idempotencyKey,
    );
    if (!result.success) {
      // Permanent, non-ambiguous rejection: the connector is telling us
      // definitively that nothing was created.
      await deps.store.failIdempotencyRecord(tenantId, TOOL_NAME, idempotencyKey);
      await deps.store.updateStep(taskId, stepId, { status: 'failed', errorCode: result.error?.code ?? 'CONNECTOR_REJECTED', errorMessage: result.error?.message, finishedAt: now });
      return {
        status: 'blocked',
        task: await fail(deps, tenantId, taskId, `ERP rejected the write: ${result.error?.message ?? 'unknown error'}.`, [
          `connector_rejected: ${result.error?.code ?? 'unknown'}`,
        ]),
      };
    }
    await deps.store.completeIdempotencyRecord(tenantId, TOOL_NAME, idempotencyKey, result.data);
    await deps.store.updateStep(taskId, stepId, { status: 'succeeded', output: result.data, finishedAt: now });
    await deps.store.appendEvent({ taskId, type: 'step_succeeded', actorType: 'system', payload: { step: 'execute_write' } });
    return { status: 'advanced' };
  } catch {
    // The call threw: we genuinely do not know whether the ERP committed
    // the write before failing to tell us. Try connector-level
    // reconciliation if it is supported; otherwise this is ambiguous and
    // must be escalated, never silently retried.
    const reconciled = await tryReconcile(deps, tenantId, idempotencyKey);
    if (reconciled) {
      await deps.store.completeIdempotencyRecord(tenantId, TOOL_NAME, idempotencyKey, reconciled);
      await deps.store.updateStep(taskId, stepId, { status: 'succeeded', output: reconciled, finishedAt: now });
      return { status: 'advanced' };
    }

    const refreshedStep = await deps.store.getStep(taskId, stepId);
    const hasRetriesLeft = !!refreshedStep && refreshedStep.attempt < refreshedStep.maxAttempts;
    if (hasRetriesLeft && !deps.connector.findByIdempotencyKey) {
      // No reconciliation capability at all: we cannot distinguish "transient,
      // nothing happened" from "crashed after success". Do not guess — leave
      // the idempotency record in_progress and escalate.
      await deps.store.updateStep(taskId, stepId, { status: 'failed', errorCode: 'AMBIGUOUS_WRITE_OUTCOME', finishedAt: now });
      return {
        status: 'blocked',
        task: await fail(deps, tenantId, taskId, 'Write attempt failed with an unknown outcome and this connector cannot reconcile; escalating for manual review.', [
          'ambiguous_write_outcome_needs_manual_review',
        ]),
      };
    }

    // Connector supports reconciliation and confirmed nothing was written
    // (tryReconcile returned null) — safe to mark this attempt failed and
    // let the loop retry on the next advance() call, up to maxAttempts.
    await deps.store.failIdempotencyRecord(tenantId, TOOL_NAME, idempotencyKey);
    await deps.store.updateStep(taskId, stepId, { status: 'failed', errorCode: 'TRANSIENT_ERROR', finishedAt: now });
    if (!hasRetriesLeft) {
      return {
        status: 'blocked',
        task: await fail(deps, tenantId, taskId, 'Exceeded maximum retry attempts for the write step.', ['retry_exhausted']),
      };
    }
    // Reset step to pending so the next advance() call retries it.
    await deps.store.updateStep(taskId, stepId, { status: 'pending' });
    return { status: 'advanced' };
  }
}

async function tryReconcile(deps: ExecutorDeps, tenantId: string, idempotencyKey: string): Promise<unknown | null> {
  if (!deps.connector.findByIdempotencyKey) return null;
  try {
    const found = await deps.connector.findByIdempotencyKey('invoice', idempotencyKey);
    if (found.success && found.data) {
      return { invoiceId: found.data.id, invoiceNumber: `FAKE-INV-${found.data.id}`, state: 'draft' as const };
    }
    return null;
  } catch {
    return null;
  }
}
