import { ApprovalRequest, Task, TaskEvent, TaskStep, TaskStore } from './types';

/** JSON-safe projections of the runtime's internal types, for the demo API responses. */

export interface TaskStepView extends Omit<TaskStep, 'startedAt' | 'finishedAt'> {
  startedAt?: string;
  finishedAt?: string;
}

export interface TaskEventView extends Omit<TaskEvent, 'createdAt'> {
  createdAt: string;
}

export interface ApprovalView extends Omit<ApprovalRequest, 'requestedAt' | 'expiresAt' | 'decidedAt'> {
  requestedAt: string;
  expiresAt: string;
  decidedAt?: string;
}

export interface TaskView extends Omit<Task, 'deadline' | 'createdAt' | 'updatedAt'> {
  deadline: string;
  createdAt: string;
  updatedAt: string;
  steps: TaskStepView[];
  events: TaskEventView[];
  pendingApproval: ApprovalView | null;
}

function viewStep(step: TaskStep): TaskStepView {
  return {
    ...step,
    startedAt: step.startedAt?.toISOString(),
    finishedAt: step.finishedAt?.toISOString(),
  };
}

function viewEvent(event: TaskEvent): TaskEventView {
  return { ...event, createdAt: event.createdAt.toISOString() };
}

function viewApproval(approval: ApprovalRequest): ApprovalView {
  return {
    ...approval,
    requestedAt: approval.requestedAt.toISOString(),
    expiresAt: approval.expiresAt.toISOString(),
    decidedAt: approval.decidedAt?.toISOString(),
  };
}

export async function buildTaskView(store: TaskStore, tenantId: string, taskId: string): Promise<TaskView | null> {
  const task = await store.getTask(tenantId, taskId);
  if (!task) return null;
  const steps = await store.listSteps(taskId);
  const events = await store.listEvents(taskId);

  let pendingApproval: ApprovalView | null = null;
  const approvalStep = steps.find((s) => s.name === 'await_approval');
  const approvalId = (approvalStep?.output as { approvalId?: string } | undefined)?.approvalId;
  if (approvalId) {
    const approval = await store.getApproval(tenantId, approvalId);
    if (approval && approval.status === 'pending') pendingApproval = viewApproval(approval);
  }

  return {
    ...task,
    deadline: task.deadline.toISOString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    steps: steps.map(viewStep),
    events: events.map(viewEvent),
    pendingApproval,
  };
}
