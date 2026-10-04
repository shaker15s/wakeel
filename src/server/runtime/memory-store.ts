import { randomUUID } from 'crypto';
import {
  ApprovalRequest,
  IdempotencyRecord,
  Task,
  TaskEvent,
  TaskStep,
  TaskStore,
  TenantIsolationError,
} from './types';
import { redact } from './redact';


/**
 * In-memory TaskStore. This is the only TaskStore implementation exercised
 * in this session (see docs/implementation/03-milestone-1-report.md for why
 * a Prisma-backed store is deferred). It is written to the same contract a
 * Prisma-backed store must satisfy, so swapping is a constructor change, not
 * a rewrite of the executor.
 *
 * Deliberately NOT for production use at scale (no persistence across
 * process restarts) — but every method enforces the same tenant-scoping
 * discipline a real store must, which is the behavior under test here.
 */
export class InMemoryTaskStore implements TaskStore {
  private tasks = new Map<string, Task>();
  private steps = new Map<string, TaskStep>(); // keyed by stepId
  private stepsByTask = new Map<string, string[]>(); // taskId -> [stepId]
  private events = new Map<string, TaskEvent[]>(); // taskId -> events
  private approvals = new Map<string, ApprovalRequest>();
  private idempotency = new Map<string, IdempotencyRecord>(); // key: tenantId|toolName|idempotencyKey

  async createTask(task: Omit<Task, 'status' | 'createdAt' | 'updatedAt' | 'result'>): Promise<Task> {
    const now = new Date();
    const full: Task = { ...task, status: 'queued', createdAt: now, updatedAt: now };
    this.tasks.set(full.id, full);
    this.stepsByTask.set(full.id, []);
    this.events.set(full.id, []);
    return { ...full };
  }

  async getTask(tenantId: string, taskId: string): Promise<Task | null> {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    if (task.tenantId !== tenantId) return null; // 404, not 403 — do not confirm existence across tenants
    return { ...task };
  }

  async updateTask(tenantId: string, taskId: string, patch: Partial<Pick<Task, 'status' | 'result'>>): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.tenantId !== tenantId) throw new TenantIsolationError();
    const updated: Task = { ...task, ...patch, updatedAt: new Date() };
    this.tasks.set(taskId, updated);
    return { ...updated };
  }

  async createStep(step: Omit<TaskStep, 'status' | 'attempt'> & { status?: TaskStep['status']; attempt?: number }): Promise<TaskStep> {
    const full: TaskStep = { status: 'pending', attempt: 0, ...step };
    this.steps.set(full.id, full);
    const list = this.stepsByTask.get(full.taskId) ?? [];
    list.push(full.id);
    this.stepsByTask.set(full.taskId, list);
    return { ...full };
  }

  async getStep(taskId: string, stepId: string): Promise<TaskStep | null> {
    const step = this.steps.get(stepId);
    if (!step || step.taskId !== taskId) return null;
    return { ...step };
  }

  async listSteps(taskId: string): Promise<TaskStep[]> {
    const ids = this.stepsByTask.get(taskId) ?? [];
    return ids
      .map((id) => this.steps.get(id))
      .filter((s): s is TaskStep => !!s)
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => ({ ...s }));
  }

  async updateStep(taskId: string, stepId: string, patch: Partial<TaskStep>): Promise<TaskStep> {
    const step = this.steps.get(stepId);
    if (!step || step.taskId !== taskId) throw new Error(`Step ${stepId} not found on task ${taskId}`);
    const updated: TaskStep = { ...step, ...patch };
    this.steps.set(stepId, updated);
    return { ...updated };
  }

  async appendEvent(event: Omit<TaskEvent, 'id' | 'sequence' | 'createdAt'>): Promise<TaskEvent> {
    const list = this.events.get(event.taskId) ?? [];
    const full: TaskEvent = {
      ...event,
      // Redacted here, at the actual persistence boundary — not left to
      // every call site in executor.ts to remember. See redact.ts.
      payload: redact(event.payload),
      id: randomUUID(),
      sequence: list.length + 1,
      createdAt: new Date(),
    };
    list.push(full);
    this.events.set(event.taskId, list);
    return { ...full };
  }

  async listEvents(taskId: string): Promise<TaskEvent[]> {
    return (this.events.get(taskId) ?? []).map((e) => ({ ...e }));
  }

  async createApproval(approval: Omit<ApprovalRequest, 'status' | 'requestedAt'>): Promise<ApprovalRequest> {
    const full: ApprovalRequest = { ...approval, status: 'pending', requestedAt: new Date() };
    this.approvals.set(full.id, full);
    return { ...full };
  }

  async getApproval(tenantId: string, approvalId: string): Promise<ApprovalRequest | null> {
    const approval = this.approvals.get(approvalId);
    if (!approval || approval.tenantId !== tenantId) return null;
    // Lazily transition to `expired` on read so stale approvals are never usable
    // even if nothing ever called decideApproval() on them.
    if (approval.status === 'pending' && approval.expiresAt.getTime() < Date.now()) {
      const expired: ApprovalRequest = { ...approval, status: 'expired' };
      this.approvals.set(approvalId, expired);
      return { ...expired };
    }
    return { ...approval };
  }

  async decideApproval(
    tenantId: string,
    approvalId: string,
    decision: 'approved' | 'rejected',
    decidedBy: string,
    reason?: string,
  ): Promise<ApprovalRequest> {
    const approval = await this.getApproval(tenantId, approvalId);
    if (!approval) throw new Error(`Approval ${approvalId} not found`);
    if (approval.status !== 'pending') {
      // Replay/duplicate-decision guard: an already-decided or expired approval
      // can never be decided again, in either direction.
      throw new Error(`Approval ${approvalId} is not pending (status: ${approval.status}) — cannot decide again.`);
    }
    const updated: ApprovalRequest = {
      ...approval,
      status: decision,
      decidedBy,
      decidedAt: new Date(),
      reason,
    };
    this.approvals.set(approvalId, updated);
    return { ...updated };
  }

  private idemKey(tenantId: string, toolName: string, idempotencyKey: string): string {
    return `${tenantId}::${toolName}::${idempotencyKey}`;
  }

  async getIdempotencyRecord(tenantId: string, toolName: string, idempotencyKey: string): Promise<IdempotencyRecord | null> {
    const record = this.idempotency.get(this.idemKey(tenantId, toolName, idempotencyKey));
    return record ? { ...record } : null;
  }

  async startIdempotencyRecord(
    record: Omit<IdempotencyRecord, 'status' | 'createdAt' | 'updatedAt' | 'resultRef'>,
  ): Promise<IdempotencyRecord> {
    const key = this.idemKey(record.tenantId, record.toolName, record.idempotencyKey);
    const now = new Date();
    const full: IdempotencyRecord = { ...record, status: 'in_progress', createdAt: now, updatedAt: now };
    this.idempotency.set(key, full);
    return { ...full };
  }

  async completeIdempotencyRecord(
    tenantId: string,
    toolName: string,
    idempotencyKey: string,
    resultRef: unknown,
  ): Promise<IdempotencyRecord> {
    const key = this.idemKey(tenantId, toolName, idempotencyKey);
    const existing = this.idempotency.get(key);
    if (!existing) throw new Error('Cannot complete an idempotency record that was never started.');
    const updated: IdempotencyRecord = { ...existing, status: 'completed', resultRef, updatedAt: new Date() };
    this.idempotency.set(key, updated);
    return { ...updated };
  }

  async failIdempotencyRecord(tenantId: string, toolName: string, idempotencyKey: string): Promise<IdempotencyRecord> {
    const key = this.idemKey(tenantId, toolName, idempotencyKey);
    const existing = this.idempotency.get(key);
    if (!existing) throw new Error('Cannot fail an idempotency record that was never started.');
    const updated: IdempotencyRecord = { ...existing, status: 'failed', updatedAt: new Date() };
    this.idempotency.set(key, updated);
    return { ...updated };
  }
}
