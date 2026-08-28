/**
 * WAKEEL — typed API client.
 * Mirrors the fixed API contract in worklog.md (Task 1).
 * Every call is wrapped: network failures / non-OK responses throw
 * `Error(message)` so the UI can surface them via sonner + inline states
 * without ever hard-crashing.
 */

/* ---------------------------------- types --------------------------------- */

export type View = "landing" | "console" | "share";

export type ConsoleTab =
  | "overview"
  | "discovery"
  | "systems"
  | "forge"
  | "activity";

export type Origin = "DISCOVERED" | "CREATED";
export type SystemStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";
export type ScanStatus = "RUNNING" | "COMPLETE" | "FAILED";
export type ActivityType =
  | "SCAN"
  | "FORGE"
  | "ADOPT"
  | "ARCHIVE"
  | "RESTORE"
  | "DELETE"
  | "RECORD"
  | "CHAT"
  | "STATUS"
  | "SHARE"
  | "AUTOMATION";

export interface Operator {
  id: string;
  name: string;
  workspace: string;
  role?: string | null;
  createdAt: string;
}

export interface UserStats {
  systems: number;
  discovered: number;
  created: number;
  records: number;
  scans: number;
}

export interface AiSystem {
  id: string;
  userId: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color?: string;
  origin: Origin;
  status: SystemStatus;
  health: number;
  confidence?: number | null;
  source?: string | null;
  /** raw JSON string — parse with parseBlueprint() before use */
  blueprint: string;
  /** raw JSON string — parse with parseCapabilities() before use */
  capabilities: string;
  createdAt: string;
  updatedAt: string;
  recordsCount?: number;
  _count?: { records?: number };
}

export interface ScanSession {
  id: string;
  userId: string;
  target: string;
  notes?: string | null;
  status: ScanStatus;
  systemsFound: number;
  /** raw JSON string */
  result: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  userId: string;
  type: ActivityType;
  title: string;
  detail?: string | null;
  status: "RUNNING" | "DONE" | "FAILED";
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  role: "USER" | "AGENT";
  content: string;
  createdAt: string;
}

export interface SystemRecordDTO {
  id: string;
  systemId: string;
  /** JSON string or object depending on backend — use parseRecordData */
  data: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationLogLine {
  /** ms offset from run start */
  t: number;
  line: string;
  level: "info" | "ok" | "warn" | "error";
}

export interface AutomationRun {
  id: string;
  systemId: string;
  automation: string;
  status: "RUNNING" | "DONE" | "FAILED";
  trigger: "MANUAL" | "SCHEDULE" | "EVENT";
  /** JSON string — parse with parseRunLog() before use */
  log: string;
  durationMs: number;
  createdAt: string;
}

export interface BlueprintField {
  key: string;
  label: string;
  type: string;
  options?: string[];
}

export interface ParsedBlueprint {
  summary: string;
  fields: BlueprintField[];
  automations: string[];
  views: string[];
  sampleRecords: Record<string, unknown>[];
}

/* ------------------------------ core fetcher ------------------------------ */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    // hard ceiling so a slow LLM/web-search call never hangs the UI forever
    const timeout = AbortSignal.timeout(180_000);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
    res = await fetch(path, {
      ...init,
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error(
      "Cannot reach the Wakeel API — check your connection and try again."
    );
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    let message = `Request failed (${res.status} ${res.statusText || "Error"})`;
    if (body && typeof body === "object" && "error" in body) {
      const err = (body as { error?: unknown }).error;
      if (typeof err === "string" && err.length > 0) message = err;
    }
    throw new ApiError(message, res.status);
  }

  return body as T;
}

/* ------------------------------- endpoints -------------------------------- */

export function createUser(body: {
  name: string;
  workspace: string;
  role?: string;
}) {
  return api<{ user: Operator }>("/api/users", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getUser(id: string) {
  return api<{ user: Operator; stats: UserStats }>(
    `/api/users/${encodeURIComponent(id)}`
  );
}

export function getSystems(userId: string) {
  return api<{ systems: AiSystem[] }>(
    `/api/users/${encodeURIComponent(userId)}/systems`
  );
}

export function runScan(body: { userId: string; target: string; notes?: string }) {
  return api<{ scan: ScanSession; systems: AiSystem[] }>(
    "/api/discovery/scan",
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function getScans(userId: string) {
  return api<{ scans: ScanSession[] }>(
    `/api/scans?userId=${encodeURIComponent(userId)}`
  );
}

export function forgeSystem(body: { userId: string; prompt: string }) {
  return api<{ system: AiSystem }>("/api/systems/forge", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getSystemDetail(id: string) {
  return api<{ system: AiSystem; records: SystemRecordDTO[] }>(
    `/api/systems/${encodeURIComponent(id)}`
  );
}

export function updateSystem(
  id: string,
  body: { status?: string; name?: string; description?: string }
) {
  return api<{ system: AiSystem }>(`/api/systems/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteSystem(id: string) {
  return api<{ ok: boolean }>(`/api/systems/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function createRecord(systemId: string, data: Record<string, unknown>) {
  return api<{ record: SystemRecordDTO }>(
    `/api/systems/${encodeURIComponent(systemId)}/records`,
    { method: "POST", body: JSON.stringify({ data }) }
  );
}

export function deleteRecord(id: string) {
  return api<{ ok: boolean }>(`/api/records/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function updateRecord(id: string, data: Record<string, unknown>) {
  return api<{ record: SystemRecordDTO }>(
    `/api/records/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ data }) }
  );
}

export function bulkDeleteRecords(ids: string[]) {
  return api<{ ok: boolean; deleted: number }>("/api/records/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export function runAutomation(
  systemId: string,
  automation: string,
  trigger: "MANUAL" | "SCHEDULE" | "EVENT" = "MANUAL"
) {
  return api<{ run: AutomationRun }>(
    `/api/systems/${encodeURIComponent(systemId)}/automations/run`,
    { method: "POST", body: JSON.stringify({ automation, trigger }) }
  );
}

export function getAutomationRuns(systemId: string) {
  return api<{ runs: AutomationRun[] }>(
    `/api/systems/${encodeURIComponent(systemId)}/automations/run`
  );
}

export function getActivity(userId: string) {
  return api<{ activities: Activity[] }>(
    `/api/activity?userId=${encodeURIComponent(userId)}`
  );
}

export function getChat(userId: string) {
  return api<{ messages: ChatMessage[] }>(
    `/api/agent/chat?userId=${encodeURIComponent(userId)}`
  );
}

export function sendChat(userId: string, message: string) {
  return api<{ reply: string; messageId: string }>("/api/agent/chat", {
    method: "POST",
    body: JSON.stringify({ userId, message }),
  });
}

/* --------------------------- defensive parsing ---------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      const rec = asRecord(item);
      if (rec) {
        const name = rec.name ?? rec.title ?? rec.description ?? rec.summary;
        if (typeof name === "string") return name;
      }
      return "";
    })
    .filter((s) => s.length > 0);
}

/** Safely parse a system blueprint (JSON string) into a normalized shape. */
export function parseBlueprint(raw: unknown): ParsedBlueprint {
  const empty: ParsedBlueprint = {
    summary: "",
    fields: [],
    automations: [],
    views: [],
    sampleRecords: [],
  };
  const obj = asRecord(raw);
  if (!obj) return empty;

  // fields may live at .fields, .entity.fields, .entities[0].fields or .columns
  const candidates: unknown[] = [
    obj.fields,
    asRecord(obj.entity)?.fields,
    Array.isArray(obj.entities) ? asRecord(obj.entities[0])?.fields : undefined,
    obj.columns,
  ];
  const rawFields = candidates.find(
    (c) => Array.isArray(c) && c.length > 0
  ) as unknown[] | undefined;

  const fields: BlueprintField[] = (rawFields ?? [])
    .map((f, i): BlueprintField | null => {
      if (typeof f === "string") {
        return { key: f, label: f, type: "text" };
      }
      const rec = asRecord(f);
      if (!rec) return null;
      const key =
        (typeof rec.key === "string" && rec.key) ||
        (typeof rec.name === "string" && rec.name) ||
        `field_${i + 1}`;
      const label =
        (typeof rec.label === "string" && rec.label) ||
        (typeof rec.name === "string" && rec.name) ||
        key;
      const type =
        (typeof rec.type === "string" && rec.type.toLowerCase()) || "text";
      const options = Array.isArray(rec.options)
        ? rec.options.map((o) => String(o))
        : undefined;
      return { key, label, type, options };
    })
    .filter((f): f is BlueprintField => f !== null);

  const summary =
    (typeof obj.summary === "string" && obj.summary) ||
    (typeof obj.description === "string" && obj.description) ||
    (typeof obj.purpose === "string" && obj.purpose) ||
    "";

  const automations = toStringArray(
    Array.isArray(obj.automations) && obj.automations.length > 0
      ? obj.automations
      : asRecord(obj.entity)?.automations
  );
  const views = toStringArray(obj.views);
  const sampleCandidates = [obj.sampleRecords, obj.sample_data, obj.samples];
  const rawSamples = sampleCandidates.find((c) => Array.isArray(c));
  const sampleRecords = ((rawSamples as unknown[]) ?? [])
    .map((s) => asRecord(s))
    .filter((s): s is Record<string, unknown> => s !== null);

  return { summary, fields, automations, views, sampleRecords };
}

/** Parse the capabilities JSON string into a list of short strings. */
export function parseCapabilities(raw: unknown): string[] {
  if (raw == null) return [];
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      // comma separated fallback
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return toStringArray(value);
}

/** Parse a record's `data` (string or object) into a plain object. */
export function parseRecordData(raw: unknown): Record<string, unknown> {
  return asRecord(raw) ?? {};
}

/** Parse an automation run's log JSON into normalized log lines. */
export function parseRunLog(raw: unknown): AutomationLogLine[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): AutomationLogLine | null => {
        if (!item || typeof item !== "object") return null;
        const rec = item as Record<string, unknown>;
        if (typeof rec.line !== "string") return null;
        const level =
          rec.level === "ok" || rec.level === "warn" || rec.level === "error"
            ? rec.level
            : "info";
        return {
          t: typeof rec.t === "number" ? rec.t : 0,
          line: rec.line,
          level,
        };
      })
      .filter((l): l is AutomationLogLine => l !== null);
  } catch {
    return [];
  }
}

/** Parse a scan result JSON into a readable summary line. */
export function parseScanSummary(raw: unknown, fallback: string): string {
  const obj = asRecord(raw);
  if (!obj) return fallback;
  const s =
    (typeof obj.summary === "string" && obj.summary) ||
    (typeof obj.notes === "string" && obj.notes) ||
    (typeof obj.overview === "string" && obj.overview) ||
    "";
  return s || fallback;
}

export function recordCount(system: AiSystem): number | null {
  if (typeof system.recordsCount === "number") return system.recordsCount;
  if (typeof system._count?.records === "number") return system._count.records;
  return null;
}

/* --------------------------------- sharing -------------------------------- */

export interface ShareLinkInfo {
  token: string;
  url: string;
  views: number;
  createdAt: string;
}

export interface SharedSystem {
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  origin: string;
  status: string;
  health: number;
  blueprint: {
    summary: string;
    fields: BlueprintField[];
    automations: string[];
    views: string[];
  };
  createdAt: string;
}

export interface SharedSystemPayload {
  system: SharedSystem;
  workspace: string;
  records: { data: string; createdAt: string }[];
  meta: { views: number; sharedAt: string };
}

/** GET /api/systems/[id]/share — the live link for a system (or null). */
export async function getShareLink(systemId: string): Promise<{ share: ShareLinkInfo | null }> {
  return api(`/api/systems/${systemId}/share`);
}

/** POST /api/systems/[id]/share — create (or fetch) the live read-only link. */
export async function createShareLink(systemId: string): Promise<{ share: ShareLinkInfo; created: boolean }> {
  return api(`/api/systems/${systemId}/share`, { method: "POST" });
}

/** DELETE /api/systems/[id]/share — revoke the live read-only link. */
export async function revokeShareLink(systemId: string): Promise<{ ok: boolean }> {
  return api(`/api/systems/${systemId}/share`, { method: "DELETE" });
}

/** GET /api/share/[token] — PUBLIC read-only payload (no auth). */
export async function getSharedSystem(token: string): Promise<SharedSystemPayload> {
  return api(`/api/share/${encodeURIComponent(token)}`);
}
