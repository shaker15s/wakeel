import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { redact } from './redact';
import {
  ApprovalRequest,
  IdempotencyRecord,
  Task,
  TaskEvent,
  TaskStep,
  TaskStore,
  TenantIsolationError,
} from './types';

function encode(value: unknown): string {
  return JSON.stringify(redact(value)) ?? 'null';
}

function decode<T>(value: string | null | undefined): T | undefined {
  return value == null ? undefined : JSON.parse(value) as T;
}

function toTask(row: any): Task {
  return {
    id: row.id,
    tenantId: row.tenantId,
    actorId: row.actorId,
    workflowType: row.workflowType,
    status: row.status,
    riskClass: row.riskClass,
    input: decode(row.inputJson),
    result: decode(row.resultJson),
    deadline: row.deadline,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toStep(row: any): TaskStep {
  return {
    id: row.id,
    taskId: row.taskId,
    sequence: row.sequence,
    name: row.name,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    input: decode(row.inputJson),
    output: decode(row.outputJson),
    errorCode: row.errorCode ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    idempotencyKey: row.idempotencyKey ?? undefined,
    startedAt: row.startedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
  };
}

function toEvent(row: any): TaskEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    taskId: row.taskId,
    sequence: row.sequence,
    type: row.type,
    actorType: row.actorType,
    actorId: row.actorId ?? undefined,
    payload: decode(row.payloadJson) ?? {},
    createdAt: row.createdAt,
  };
}

function toApproval(row: any): ApprovalRequest {
  return {
    id: row.id,
    tenantId: row.tenantId,
    taskId: row.taskId,
    stepId: row.stepId,
    toolName: row.toolName,
    actionHash: row.actionHash,
    normalizedParams: decode(row.normalizedParamsJson),
    policyVersion: row.policyVersion,
    riskLevel: row.riskLevel,
    summary: row.summary,
    status: row.status,
    requestedAt: row.requestedAt,
    expiresAt: row.expiresAt,
    decidedBy: row.decidedBy ?? undefined,
    decidedAt: row.decidedAt ?? undefined,
    reason: row.reason ?? undefined,
  };
}

function toIdempotency(row: any): IdempotencyRecord {
  return {
    tenantId: row.tenantId,
    toolName: row.toolName,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    status: row.status,
    resultRef: decode(row.resultRefJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function missingResource(): TenantIsolationError {
  return new TenantIsolationError('Resource does not exist in this tenant.');
}

/** SQLite/Prisma implementation. Every child query carries tenantId in its predicate. */
export class PrismaTaskStore implements TaskStore {
  constructor(private readonly prisma: PrismaClient) {}

  async createTask(task: Omit<Task, 'status' | 'createdAt' | 'updatedAt' | 'result'>): Promise<Task> {
    const row = await this.prisma.runtimeTask.create({
      data: {
        id: task.id,
        tenantId: task.tenantId,
        actorId: task.actorId,
        workflowType: task.workflowType,
        status: 'queued',
        riskClass: task.riskClass,
        inputJson: encode(task.input),
        deadline: task.deadline,
      },
    });
    return toTask(row);
  }

  async getTask(tenantId: string, taskId: string): Promise<Task | null> {
    const row = await this.prisma.runtimeTask.findFirst({ where: { tenantId, id: taskId } });
    return row ? toTask(row) : null;
  }

  async updateTask(tenantId: string, taskId: string, patch: Partial<Pick<Task, 'status' | 'result' | 'riskClass'>>): Promise<Task> {
    const data: Prisma.RuntimeTaskUpdateManyMutationInput = {};
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.riskClass !== undefined) data.riskClass = patch.riskClass;
    if (patch.result !== undefined) data.resultJson = encode(patch.result);
    const updated = await this.prisma.runtimeTask.updateMany({ where: { tenantId, id: taskId }, data });
    if (updated.count !== 1) throw missingResource();
    const row = await this.prisma.runtimeTask.findFirst({ where: { tenantId, id: taskId } });
    if (!row) throw missingResource();
    return toTask(row);
  }

  async createStep(tenantId: string, step: Omit<TaskStep, 'status' | 'attempt'> & { status?: TaskStep['status']; attempt?: number }): Promise<TaskStep> {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.runtimeTask.findFirst({ where: { tenantId, id: step.taskId }, select: { id: true } });
      if (!task) throw missingResource();
      const row = await tx.runtimeTaskStep.create({
        data: {
          id: step.id,
          tenantId,
          taskId: step.taskId,
          sequence: step.sequence,
          name: step.name,
          status: step.status ?? 'pending',
          attempt: step.attempt ?? 0,
          maxAttempts: step.maxAttempts,
          inputJson: step.input === undefined ? null : encode(step.input),
          outputJson: step.output === undefined ? null : encode(step.output),
          errorCode: step.errorCode,
          errorMessage: step.errorMessage,
          idempotencyKey: step.idempotencyKey,
          startedAt: step.startedAt,
          finishedAt: step.finishedAt,
        },
      });
      return toStep(row);
    });
  }

  async getStep(tenantId: string, taskId: string, stepId: string): Promise<TaskStep | null> {
    const row = await this.prisma.runtimeTaskStep.findFirst({ where: { tenantId, taskId, id: stepId } });
    return row ? toStep(row) : null;
  }

  async listSteps(tenantId: string, taskId: string): Promise<TaskStep[]> {
    const rows = await this.prisma.runtimeTaskStep.findMany({ where: { tenantId, taskId }, orderBy: { sequence: 'asc' } });
    return rows.map(toStep);
  }

  async updateStep(tenantId: string, taskId: string, stepId: string, patch: Partial<TaskStep>): Promise<TaskStep> {
    const data: Prisma.RuntimeTaskStepUpdateManyMutationInput = {};
    for (const key of ['sequence', 'name', 'status', 'attempt', 'maxAttempts', 'errorCode', 'errorMessage', 'idempotencyKey', 'startedAt', 'finishedAt'] as const) {
      if (patch[key] !== undefined) (data as Record<string, unknown>)[key] = patch[key];
    }
    if (patch.input !== undefined) data.inputJson = encode(patch.input);
    if (patch.output !== undefined) data.outputJson = encode(patch.output);
    const updated = await this.prisma.runtimeTaskStep.updateMany({ where: { tenantId, taskId, id: stepId }, data });
    if (updated.count !== 1) throw missingResource();
    const row = await this.prisma.runtimeTaskStep.findFirst({ where: { tenantId, taskId, id: stepId } });
    if (!row) throw missingResource();
    return toStep(row);
  }

  async appendEvent(tenantId: string, event: Omit<TaskEvent, 'id' | 'tenantId' | 'sequence' | 'createdAt'>): Promise<TaskEvent> {
    return this.prisma.$transaction((tx) => this.appendEventInTransaction(tx, tenantId, event));
  }

  private async appendEventInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    event: Omit<TaskEvent, 'id' | 'tenantId' | 'sequence' | 'createdAt'>,
  ): Promise<TaskEvent> {
    const task = await tx.runtimeTask.findFirst({ where: { tenantId, id: event.taskId }, select: { id: true } });
    if (!task) throw missingResource();
    const last = await tx.runtimeTaskEvent.findFirst({ where: { tenantId, taskId: event.taskId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    const row = await tx.runtimeTaskEvent.create({
      data: {
        id: randomUUID(), tenantId, taskId: event.taskId, sequence: (last?.sequence ?? 0) + 1,
        type: event.type, actorType: event.actorType, actorId: event.actorId,
        payloadJson: encode(event.payload),
      },
    });
    return toEvent(row);
  }

  async listEvents(tenantId: string, taskId: string): Promise<TaskEvent[]> {
    const rows = await this.prisma.runtimeTaskEvent.findMany({ where: { tenantId, taskId }, orderBy: { sequence: 'asc' } });
    return rows.map(toEvent);
  }

  async createApproval(tenantId: string, approval: Omit<ApprovalRequest, 'status' | 'requestedAt'>): Promise<ApprovalRequest> {
    if (approval.tenantId !== tenantId) throw missingResource();
    return this.prisma.$transaction(async (tx) => {
      const step = await tx.runtimeTaskStep.findFirst({ where: { tenantId, taskId: approval.taskId, id: approval.stepId }, select: { id: true } });
      if (!step) throw missingResource();
      const row = await tx.runtimeApproval.create({
        data: {
          id: approval.id, tenantId, taskId: approval.taskId, stepId: approval.stepId,
          toolName: approval.toolName, actionHash: approval.actionHash,
          normalizedParamsJson: encode(approval.normalizedParams), policyVersion: approval.policyVersion,
          riskLevel: approval.riskLevel, summary: approval.summary, status: 'pending', expiresAt: approval.expiresAt,
          decidedBy: approval.decidedBy, decidedAt: approval.decidedAt, reason: approval.reason,
        },
      });
      return toApproval(row);
    });
  }

  async getApproval(tenantId: string, approvalId: string): Promise<ApprovalRequest | null> {
    let row = await this.prisma.runtimeApproval.findFirst({ where: { tenantId, id: approvalId } });
    if (!row) return null;
    if (row.status === 'pending' && row.expiresAt.getTime() < Date.now()) {
      await this.prisma.runtimeApproval.updateMany({ where: { tenantId, id: approvalId, status: 'pending' }, data: { status: 'expired' } });
      row = await this.prisma.runtimeApproval.findFirst({ where: { tenantId, id: approvalId } });
    }
    return row ? toApproval(row) : null;
  }

  async decideApproval(tenantId: string, approvalId: string, decision: 'approved' | 'rejected', decidedBy: string, reason?: string): Promise<ApprovalRequest> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.runtimeApproval.findFirst({ where: { tenantId, id: approvalId } });
      if (!current) throw missingResource();
      if (current.status !== 'pending' || current.expiresAt.getTime() < Date.now()) {
        throw new Error(`Approval ${approvalId} is no longer pending.`);
      }
      const updated = await tx.runtimeApproval.updateMany({
        where: { tenantId, id: approvalId, status: 'pending', expiresAt: { gt: new Date() } },
        data: { status: decision, decidedBy, decidedAt: new Date(), reason },
      });
      if (updated.count !== 1) throw new Error(`Approval ${approvalId} was already decided.`);
      await this.appendEventInTransaction(tx, tenantId, {
        taskId: current.taskId,
        type: 'approval_decided',
        actorType: 'human',
        actorId: decidedBy,
        payload: { approvalId, decision, reason: reason ?? null },
      });
      const row = await tx.runtimeApproval.findFirst({ where: { tenantId, id: approvalId } });
      if (!row) throw missingResource();
      return toApproval(row);
    });
  }

  async getIdempotencyRecord(tenantId: string, toolName: string, idempotencyKey: string): Promise<IdempotencyRecord | null> {
    const row = await this.prisma.runtimeIdempotencyRecord.findUnique({ where: { tenantId_toolName_idempotencyKey: { tenantId, toolName, idempotencyKey } } });
    return row ? toIdempotency(row) : null;
  }

  async startIdempotencyRecord(tenantId: string, record: Omit<IdempotencyRecord, 'status' | 'createdAt' | 'updatedAt' | 'resultRef'>): Promise<IdempotencyRecord> {
    if (record.tenantId !== tenantId) throw missingResource();
    const unique = { tenantId_toolName_idempotencyKey: { tenantId, toolName: record.toolName, idempotencyKey: record.idempotencyKey } };
    const existing = await this.prisma.runtimeIdempotencyRecord.findUnique({ where: unique });
    if (existing) {
      if (existing.requestHash !== record.requestHash) throw new Error('Idempotency key reused with a different request.');
      if (existing.status !== 'failed') throw new Error('Idempotency record already exists.');
      const retried = await this.prisma.runtimeIdempotencyRecord.updateMany({
        where: { tenantId, toolName: record.toolName, idempotencyKey: record.idempotencyKey, requestHash: record.requestHash, status: 'failed' },
        data: { status: 'in_progress' },
      });
      if (retried.count !== 1) throw new Error('Idempotency record already exists.');
      const row = await this.prisma.runtimeIdempotencyRecord.findUnique({ where: unique });
      if (!row) throw missingResource();
      return toIdempotency(row);
    }
    const row = await this.prisma.runtimeIdempotencyRecord.create({
      data: { tenantId, toolName: record.toolName, idempotencyKey: record.idempotencyKey, requestHash: record.requestHash, status: 'in_progress' },
    });
    return toIdempotency(row);
  }

  async completeIdempotencyRecord(tenantId: string, toolName: string, idempotencyKey: string, resultRef: unknown): Promise<IdempotencyRecord> {
    return this.updateIdempotency(tenantId, toolName, idempotencyKey, { status: 'completed', resultRefJson: encode(resultRef) });
  }

  async failIdempotencyRecord(tenantId: string, toolName: string, idempotencyKey: string): Promise<IdempotencyRecord> {
    return this.updateIdempotency(tenantId, toolName, idempotencyKey, { status: 'failed' });
  }

  private async updateIdempotency(
    tenantId: string,
    toolName: string,
    idempotencyKey: string,
    data: Prisma.RuntimeIdempotencyRecordUpdateManyMutationInput,
  ): Promise<IdempotencyRecord> {
    const updated = await this.prisma.runtimeIdempotencyRecord.updateMany({
      where: { tenantId, toolName, idempotencyKey },
      data,
    });
    if (updated.count !== 1) throw missingResource();
    const row = await this.prisma.runtimeIdempotencyRecord.findUnique({ where: { tenantId_toolName_idempotencyKey: { tenantId, toolName, idempotencyKey } } });
    if (!row) throw missingResource();
    return toIdempotency(row);
  }
}
