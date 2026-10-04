"use client";

import type { TaskView } from "@/server/runtime/demo-view";

export type { TaskView } from "@/server/runtime/demo-view";

export interface DemoInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateDemoTaskInput {
  customerId: string;
  lines: DemoInvoiceLine[];
  memo?: string;
}

export type FaultInjection = "none" | "transient_once" | "crash_after_write" | "exhaust_retries";

const DEMO_TENANT_HEADER = "x-demo-tenant-id";

async function asJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return body as T;
}

export async function createDemoTask(
  tenantId: string,
  input: CreateDemoTaskInput,
): Promise<{ tenantId: string; task: TaskView }> {
  const res = await fetch("/api/demo/invoice-task", {
    method: "POST",
    headers: { "Content-Type": "application/json", [DEMO_TENANT_HEADER]: tenantId },
    body: JSON.stringify(input),
  });
  return asJson(res);
}

export async function getDemoTask(tenantId: string, taskId: string): Promise<{ task: TaskView }> {
  const res = await fetch(`/api/demo/invoice-task/${taskId}`, {
    headers: { [DEMO_TENANT_HEADER]: tenantId },
  });
  return asJson(res);
}

export async function cancelDemoTask(tenantId: string, taskId: string, reason?: string): Promise<{ task: TaskView }> {
  const res = await fetch(`/api/demo/invoice-task/${taskId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [DEMO_TENANT_HEADER]: tenantId },
    body: JSON.stringify({ reason }),
  });
  return asJson(res);
}

export async function decideDemoApproval(
  tenantId: string,
  taskId: string,
  decision: "approved" | "rejected",
  opts?: { reason?: string; faultInjection?: FaultInjection },
): Promise<{ task: TaskView; status: string }> {
  const res = await fetch(`/api/demo/invoice-task/${taskId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [DEMO_TENANT_HEADER]: tenantId },
    body: JSON.stringify({ decision, ...opts }),
  });
  return asJson(res);
}
