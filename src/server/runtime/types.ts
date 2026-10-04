/**
 * WAKIL durable execution — core types.
 *
 * This is the first real implementation of the PRD's "runtime owns execution
 * state, permissions, idempotency, verification, auditability" invariants
 * (docs/WAKIL_MASTER_PRD.md §3/§7/§8), scoped to the one workflow chosen in
 * docs/implementation/01-mvp-decision.md: vendor-bill text -> validated
 * fields -> mandatory human approval -> idempotent, verified Odoo draft
 * invoice creation.
 *
 * Storage-agnostic by design: `TaskStore` is the persistence contract.
 * `InMemoryTaskStore` (memory-store.ts) is the only implementation built and
 * tested so far — see docs/implementation/03-milestone-1-report.md for why a
 * Prisma-backed store is deferred (this sandbox cannot download Prisma's
 * query-engine binary, so a Prisma implementation could not be exercised or
 * verified in this session; shipping it untested would violate the "never
 * claim a check passed that wasn't run" rule).
 */

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'verifying'
  | 'succeeded'
  | 'partially_succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired';

export const TERMINAL_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'succeeded',
  'partially_succeeded',
  'failed',
  'cancelled',
  'expired',
]);

export type StepStatus = 'pending' | 'running' | 'waiting_for_approval' | 'succeeded' | 'failed' | 'skipped';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type IdempotencyStatus = 'in_progress' | 'completed' | 'failed';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** The one workflow type this milestone implements. More are added later, never inferred silently. */
export type WorkflowType = 'create_draft_invoice';

export interface Task {
  id: string;
  tenantId: string;
  actorId: string;
  workflowType: WorkflowType;
  status: TaskStatus;
  riskClass: RiskLevel;
  input: unknown;
  /** Absolute deadline. Past this, advance() refuses to continue and marks the task `expired`. */
  deadline: Date;
  createdAt: Date;
  updatedAt: Date;
  /** Present once the task reaches a terminal state. Never set to a success summary without verification evidence. */
  result?: TaskResult;
}

export interface TaskResult {
  outcome: Extract<TaskStatus, 'succeeded' | 'partially_succeeded' | 'failed' | 'cancelled' | 'expired'>;
  summary: string;
  unresolvedIssues: string[];
}

export interface TaskStep {
  id: string;
  taskId: string;
  sequence: number;
  name: string;
  status: StepStatus;
  attempt: number;
  maxAttempts: number;
  input?: unknown;
  output?: unknown;
  errorCode?: string;
  errorMessage?: string;
  /** Present only for side-effecting steps. */
  idempotencyKey?: string;
  startedAt?: Date;
  finishedAt?: Date;
}

export type TaskEventType =
  | 'task_created'
  | 'step_started'
  | 'step_succeeded'
  | 'step_failed'
  | 'approval_requested'
  | 'approval_decided'
  | 'approval_expired'
  | 'task_status_changed'
  | 'verification_result';

export interface TaskEvent {
  id: string;
  taskId: string;
  sequence: number;
  type: TaskEventType;
  actorType: 'system' | 'human' | 'model';
  actorId?: string;
  /** Must already be redacted by the caller before this is persisted — see redact() in receipt.ts. */
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface ApprovalRequest {
  id: string;
  taskId: string;
  stepId: string;
  tenantId: string;
  toolName: string;
  /** Hash of {toolName, normalizedParams, policyVersion, resourceRef} — see action-hash.ts. */
  actionHash: string;
  normalizedParams: unknown;
  policyVersion: string;
  riskLevel: RiskLevel;
  summary: string;
  status: ApprovalStatus;
  requestedAt: Date;
  expiresAt: Date;
  decidedBy?: string;
  decidedAt?: Date;
  reason?: string;
}

export interface IdempotencyRecord {
  tenantId: string;
  toolName: string;
  idempotencyKey: string;
  requestHash: string;
  status: IdempotencyStatus;
  resultRef?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Persistence contract for the runtime. Every method takes `tenantId`
 * explicitly and MUST filter by it server-side — this is the tenant-isolation
 * boundary for the whole runtime, not just the HTTP layer (defense in depth
 * against the exact class of bug found in docs/implementation/00-repo-audit.md §5.1).
 */
export interface TaskStore {
  createTask(task: Omit<Task, 'status' | 'createdAt' | 'updatedAt' | 'result'>): Promise<Task>;
  getTask(tenantId: string, taskId: string): Promise<Task | null>;
  updateTask(tenantId: string, taskId: string, patch: Partial<Pick<Task, 'status' | 'result' | 'riskClass'>>): Promise<Task>;

  createStep(step: Omit<TaskStep, 'status' | 'attempt'> & { status?: StepStatus; attempt?: number }): Promise<TaskStep>;
  getStep(taskId: string, stepId: string): Promise<TaskStep | null>;
  listSteps(taskId: string): Promise<TaskStep[]>;
  updateStep(taskId: string, stepId: string, patch: Partial<TaskStep>): Promise<TaskStep>;

  appendEvent(event: Omit<TaskEvent, 'id' | 'sequence' | 'createdAt'>): Promise<TaskEvent>;
  listEvents(taskId: string): Promise<TaskEvent[]>;

  createApproval(approval: Omit<ApprovalRequest, 'status' | 'requestedAt'>): Promise<ApprovalRequest>;
  getApproval(tenantId: string, approvalId: string): Promise<ApprovalRequest | null>;
  /** Human-decision-only entrypoint. Never called from executor/model code paths. */
  decideApproval(
    tenantId: string,
    approvalId: string,
    decision: 'approved' | 'rejected',
    decidedBy: string,
    reason?: string,
  ): Promise<ApprovalRequest>;

  getIdempotencyRecord(tenantId: string, toolName: string, idempotencyKey: string): Promise<IdempotencyRecord | null>;
  startIdempotencyRecord(record: Omit<IdempotencyRecord, 'status' | 'createdAt' | 'updatedAt' | 'resultRef'>): Promise<IdempotencyRecord>;
  completeIdempotencyRecord(tenantId: string, toolName: string, idempotencyKey: string, resultRef: unknown): Promise<IdempotencyRecord>;
  failIdempotencyRecord(tenantId: string, toolName: string, idempotencyKey: string): Promise<IdempotencyRecord>;
}

export class TenantIsolationError extends Error {
  constructor(message = 'Resource does not belong to this tenant.') {
    super(message);
    this.name = 'TenantIsolationError';
  }
}
