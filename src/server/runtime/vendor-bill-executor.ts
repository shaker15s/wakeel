import { randomUUID } from 'node:crypto';
import { computeActionHash } from './action-hash';
import { POLICY_VERSION, type ExecutorDeps, type CreateTaskParams } from './executor';
import { PolicyEngine } from '../policy/engine';
import type { ApprovalRequest, Task, TaskStore } from './types';
import { TERMINAL_TASK_STATUSES } from './types';
import { computeVendorBillAmount, CREATE_DRAFT_VENDOR_BILL_STEPS, createDraftVendorBillInputSchema, WORKFLOW_TYPE } from './workflows/create-draft-vendor-bill';

const TOOL_NAME = 'create_draft_vendor_bill';
const TASK_TTL = 7 * 24 * 60 * 60 * 1000;
const APPROVAL_TTL = 24 * 60 * 60 * 1000;
const MAX_WRITE_ATTEMPTS = 3;

export async function createDraftVendorBillTask(deps: ExecutorDeps, params: CreateTaskParams): Promise<Task> {
  const now = (deps.now ?? (() => new Date()))(); const id = randomUUID();
  const task = await deps.store.createTask({ id, tenantId: params.tenantId, actorId: params.actorId, workflowType: WORKFLOW_TYPE, riskClass: 'MEDIUM', input: params.input, deadline: new Date(now.getTime() + (params.deadlineMs ?? TASK_TTL)) });
  for (const [index, name] of CREATE_DRAFT_VENDOR_BILL_STEPS.entries()) {
    await deps.store.createStep(params.tenantId, { id: randomUUID(), taskId: id, sequence: index + 1, name, maxAttempts: name === 'execute_write' ? MAX_WRITE_ATTEMPTS : 1 });
  }
  await deps.store.appendEvent(params.tenantId, { taskId: id, type: 'task_created', actorType: 'human', actorId: params.actorId, payload: { workflowType: WORKFLOW_TYPE } });
  return task;
}

async function stop(deps: ExecutorDeps, task: Task, code: string, summary: string): Promise<Task> {
  await deps.store.appendEvent(task.tenantId, { taskId: task.id, type: 'task_status_changed', actorType: 'system', payload: { status: 'failed', code, summary } });
  return deps.store.updateTask(task.tenantId, task.id, { status: 'failed', result: { outcome: 'failed', summary, unresolvedIssues: [code] } });
}

function safeReconciled(data: any) {
  return { vendorBillId: data.id, vendorBillReference: data.vendorBillReference, vendorId: data.vendorId, currency: data.currency, totalAmount: data.totalAmount, documentKind: 'vendor_bill' as const, moveType: 'in_invoice' as const, state: 'draft' as const };
}

export async function advanceDraftVendorBill(deps: ExecutorDeps, tenantId: string, taskId: string): Promise<Task> {
  const now = (deps.now ?? (() => new Date()))();
  let task = await deps.store.getTask(tenantId, taskId);
  if (!task || task.workflowType !== WORKFLOW_TYPE) throw new Error('Vendor bill task not found.');
  while (!TERMINAL_TASK_STATUSES.has(task.status)) {
    if (task.deadline.getTime() < now.getTime()) return deps.store.updateTask(tenantId, taskId, { status: 'expired', result: { outcome: 'expired', summary: 'Task expired before completion.', unresolvedIssues: ['deadline_exceeded'] } });
    const steps = await deps.store.listSteps(tenantId, taskId);
    const current = steps.find((step) => !['succeeded', 'skipped', 'failed'].includes(step.status));
    if (!current) return task;
    if (current.name === 'validate_input') {
      const parsed = createDraftVendorBillInputSchema.safeParse(task.input);
      if (!parsed.success) return stop(deps, task, 'INVALID_INPUT', parsed.error.issues.map((issue) => issue.message).join('; '));
      try { computeVendorBillAmount(parsed.data); } catch (error) { return stop(deps, task, 'INVALID_MONEY', error instanceof Error ? error.message : 'Invalid financial amount.'); }
      await deps.store.updateStep(tenantId, taskId, current.id, { status: 'succeeded', output: parsed.data, startedAt: now, finishedAt: now });
      task = await deps.store.getTask(tenantId, taskId) as Task; continue;
    }
    if (current.name === 'policy_check') {
      const input = steps.find((step) => step.name === 'validate_input')?.output as ReturnType<typeof createDraftVendorBillInputSchema.parse>;
      let status;
      try { status = await deps.connector.testConnection(); } catch { return stop(deps, task, 'ERP_CAPABILITY_UNKNOWN', 'ERP permissions could not be verified.'); }
      if (!status.healthy || !status.authenticated || !status.permissions.canCreateDraftVendorBills) return stop(deps, task, 'VENDOR_BILL_CAPABILITY_UNVERIFIED', 'This ERP workspace is not verified for vendor-bill draft writes.');
      const partnerCheck = await deps.connector.verifyPartnerRole(input.vendorId, 'vendor');
      if (!partnerCheck.success || !partnerCheck.data?.matches) return stop(deps, task, 'VENDOR_ROLE_MISMATCH', 'The selected partner is not verified as a vendor in this workspace.');
      const totalAmount = computeVendorBillAmount(input);
      const decision = PolicyEngine.evaluate({ toolName: TOOL_NAME, category: 'DRAFT_WRITE', parameters: { ...input, totalAmount: totalAmount.amount }, operatorId: task.actorId });
      if (!decision.allowed || !decision.requiresApproval) return stop(deps, task, 'POLICY_DENIED', 'The vendor-bill policy did not allow a required approval.');
      const resourceRef = `vendor:${input.vendorId}:reference:${input.vendorBillReference}`;
      const actionHash = computeActionHash({ toolName: TOOL_NAME, normalizedParams: input, policyVersion: POLICY_VERSION, resourceRef });
      await deps.store.updateStep(tenantId, taskId, current.id, { status: 'succeeded', output: { decision, actionHash, policyVersion: POLICY_VERSION, resourceRef, totalAmount }, startedAt: now, finishedAt: now });
      await deps.store.updateTask(tenantId, taskId, { riskClass: decision.riskLevel });
      task = await deps.store.getTask(tenantId, taskId) as Task; continue;
    }
    if (current.name === 'await_approval') {
      const policy = steps.find((step) => step.name === 'policy_check')!.output as any;
      let approvalId = (current.output as { approvalId?: string } | undefined)?.approvalId;
      let approval: ApprovalRequest | null = approvalId ? await deps.store.getApproval(tenantId, approvalId) : null;
      if (!approvalId) {
        approval = await deps.store.createApproval(tenantId, { id: randomUUID(), taskId, stepId: current.id, tenantId, toolName: TOOL_NAME, actionHash: policy.actionHash, normalizedParams: steps.find((step) => step.name === 'validate_input')!.output, policyVersion: policy.policyVersion, riskLevel: policy.decision.riskLevel, summary: policy.decision.approvalCard.description, expiresAt: new Date(now.getTime() + (deps.approvalTtlMs ?? APPROVAL_TTL)) });
        approvalId = approval.id;
        await deps.store.updateStep(tenantId, taskId, current.id, { status: 'waiting_for_approval', output: { approvalId }, startedAt: now });
        await deps.store.appendEvent(tenantId, { taskId, type: 'approval_requested', actorType: 'system', payload: { approvalId, actionHash: policy.actionHash, riskLevel: approval.riskLevel, resourceRef: policy.resourceRef } });
      }
      if (!approval) return stop(deps, task, 'APPROVAL_MISSING', 'The durable approval record is missing.');
      if (approval.status === 'pending') return deps.store.updateTask(tenantId, taskId, { status: 'waiting_for_approval' });
      if (approval.status !== 'approved') return stop(deps, task, approval.status === 'expired' ? 'APPROVAL_EXPIRED' : 'APPROVAL_REJECTED', `Vendor-bill draft was ${approval.status}.`);
      await deps.store.updateStep(tenantId, taskId, current.id, { status: 'succeeded', output: { approvalId, decidedBy: approval.decidedBy }, finishedAt: now });
      task = await deps.store.getTask(tenantId, taskId) as Task; continue;
    }
    if (current.name === 'execute_write') {
      const input = steps.find((step) => step.name === 'validate_input')!.output as ReturnType<typeof createDraftVendorBillInputSchema.parse>;
      const policy = steps.find((step) => step.name === 'policy_check')!.output as any;
      const approvalStep = steps.find((step) => step.name === 'await_approval')!;
      const approvalId = (approvalStep.output as { approvalId?: string }).approvalId;
      const approval = approvalId ? await deps.store.getApproval(tenantId, approvalId) : null;
      const recomputedHash = computeActionHash({ toolName: TOOL_NAME, normalizedParams: input, policyVersion: policy.policyVersion, resourceRef: policy.resourceRef });
      if (!approval || approval.status !== 'approved' || approval.taskId !== taskId || approval.toolName !== TOOL_NAME || approval.actionHash !== recomputedHash || policy.actionHash !== recomputedHash) return stop(deps, task, 'APPROVAL_BINDING_INVALID', 'Approval does not match this exact vendor bill; refusing to write.');
      const key = `task:${taskId}:execute_write`;
      const existing = await deps.store.getIdempotencyRecord(tenantId, TOOL_NAME, key);
      let receipt: any = null;
      if (existing?.status === 'completed') {
        if (existing.requestHash !== recomputedHash) return stop(deps, task, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency key does not match the approved action.');
        receipt = existing.resultRef;
      } else if (existing?.status === 'in_progress') {
        const reconciled = await deps.connector.findByIdempotencyKey?.('vendor_bill', key);
        if (reconciled?.success && reconciled.data) {
          receipt = safeReconciled(reconciled.data);
          await deps.store.completeIdempotencyRecord(tenantId, TOOL_NAME, key, receipt);
        } else if (now.getTime() - existing.updatedAt.getTime() < 2 * 60 * 1000) {
          // Another executor may currently hold the write claim. Preserve a
          // resumable state; never turn a live concurrent write into a false
          // terminal failure or start a second connector call.
          return deps.store.updateTask(tenantId, taskId, { status: 'running' });
        } else return stop(deps, task, 'AMBIGUOUS_WRITE_OUTCOME', 'The previous write outcome is unknown; manual review is required.');
      } else {
        const step = await deps.store.getStep(tenantId, taskId, current.id);
        if (!step || step.attempt >= step.maxAttempts) return stop(deps, task, 'RETRY_EXHAUSTED', 'Vendor-bill write retry limit reached.');
        try {
          await deps.store.startIdempotencyRecord(tenantId, { tenantId, toolName: TOOL_NAME, idempotencyKey: key, requestHash: recomputedHash });
          await deps.store.updateStep(tenantId, taskId, current.id, { status: 'running', attempt: step.attempt + 1, startedAt: now });
          const result = await deps.connector.createDraftVendorBill(input, key);
          if (!result.success || !result.data) {
            await deps.store.failIdempotencyRecord(tenantId, TOOL_NAME, key);
            return stop(deps, task, result.error?.code ?? 'ERP_REJECTED', result.error?.message ?? 'ERP rejected the vendor-bill draft.');
          }
          receipt = result.data;
          await deps.store.completeIdempotencyRecord(tenantId, TOOL_NAME, key, receipt);
        } catch {
          const reconciled = await deps.connector.findByIdempotencyKey?.('vendor_bill', key);
          if (!reconciled?.success || !reconciled.data) return stop(deps, task, 'AMBIGUOUS_WRITE_OUTCOME', 'The write could not be reconciled. Manual review is required.');
          receipt = safeReconciled(reconciled.data);
          await deps.store.completeIdempotencyRecord(tenantId, TOOL_NAME, key, receipt);
        }
      }
      await deps.store.updateStep(tenantId, taskId, current.id, { status: 'succeeded', output: receipt, finishedAt: now });
      task = await deps.store.getTask(tenantId, taskId) as Task; continue;
    }
    if (current.name === 'verify') {
      const receipt = steps.find((step) => step.name === 'execute_write')!.output as any;
      const input = steps.find((step) => step.name === 'validate_input')!.output as ReturnType<typeof createDraftVendorBillInputSchema.parse>;
      const read = await deps.connector.getEntityById('vendor_bill', receipt.vendorBillId);
      const verified = read.success ? read.data : null;
      const expected = computeVendorBillAmount(input);
      const matches = verified && String(verified.vendorId) === String(input.vendorId) && verified.vendorBillReference === input.vendorBillReference && verified.moveType === 'in_invoice' && verified.currency === input.currency.toUpperCase() && verified.totalAmount === expected.amount;
      if (!matches) {
        await deps.store.updateStep(tenantId, taskId, current.id, { status: 'failed', errorCode: 'VERIFICATION_MISMATCH', finishedAt: now });
        return deps.store.updateTask(tenantId, taskId, { status: 'partially_succeeded', result: { outcome: 'partially_succeeded', summary: 'Vendor-bill draft write occurred, but read-after-write verification did not match the approved action.', unresolvedIssues: ['verification_mismatch_manual_review'] } });
      }
      await deps.store.updateStep(tenantId, taskId, current.id, { status: 'succeeded', output: verified, finishedAt: now });
      await deps.store.appendEvent(tenantId, { taskId, type: 'verification_result', actorType: 'system', payload: { ok: true, vendorBillId: receipt.vendorBillId, actionHash: policyHash(steps) } });
      const summary = `Draft vendor bill ${input.vendorBillReference} created and verified.`;
      await deps.store.appendEvent(tenantId, { taskId, type: 'task_status_changed', actorType: 'system', payload: { status: 'succeeded', summary } });
      return deps.store.updateTask(tenantId, taskId, { status: 'succeeded', result: { outcome: 'succeeded', summary, unresolvedIssues: [], receipt: {
        documentKind: 'vendor_bill', erpRecordId: receipt.vendorBillId, partnerRole: 'vendor', currency: input.currency.toUpperCase(), verifiedTotal: expected.amount,
        approvedActionHash: policyHash(steps) ?? '', verificationSource: deps.connector.getMetadata().provider, unresolvedIssues: [],
      } } });
    }
    return stop(deps, task, 'UNHANDLED_STEP', 'Vendor-bill task has an unsupported runtime step.');
  }
  return task;
}

function policyHash(steps: Awaited<ReturnType<TaskStore['listSteps']>>) {
  return (steps.find((step) => step.name === 'policy_check')?.output as { actionHash?: string } | undefined)?.actionHash ?? null;
}
