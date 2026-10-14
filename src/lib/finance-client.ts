"use client";
import type {
  FinanceSession,
  JournalApproval,
  MemoryDocument,
} from "@/server/finance/types";
export type SessionView = FinanceSession & { approvals: JournalApproval[] };
export type SessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  status: string;
  preview: string;
};
export type DocumentSummary = Omit<MemoryDocument, "content"> & {
  characters: number;
};
export type PublicConnections = {
  model: { baseUrl: string; model: string; verifiedAt: string | null } | null;
  odoo: {
    url: string;
    database: string;
    username: string;
    companyId: number;
    verifiedAt: string | null;
  } | null;
};
export async function financeApi<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api/finance/" + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "تعذر إكمال الطلب.");
  return body as T;
}
export async function streamTurn(
  token: string,
  id: string,
  payload: { requestId: string; message?: string; documentIds?: string[] },
  signal: AbortSignal,
  onSession: (session: SessionView) => void,
) {
  const response = await fetch(`/api/finance/sessions/${id}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "تعذر بدء التنفيذ.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("لم تبدأ قناة متابعة التنفيذ.");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let at: number;
    while ((at = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "session") onSession(event.session);
      else if (event.type === "error") throw new Error(event.error);
    }
  }
}
