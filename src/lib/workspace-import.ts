/**
 * Client-side workspace import — shared by the operator menu (status bar)
 * and the onboarding dialog.
 *
 * Flow: parseWorkspaceFile() does the cheap client-side sanity check
 * (JSON + format marker) and powers the PREVIEW dialog; confirmImport()
 * then POSTs the payload to /api/workspace/import, which re-validates and
 * restores everything server-side into a brand-new operator workspace.
 */

import { importWorkspace } from "@/lib/api-client";

export type WorkspacePayload = {
  format: "wakeel.workspace/v1";
  exportedAt?: string;
  operator: { name: string; workspace: string; role?: string | null };
  systems: Record<string, unknown>[];
};

export type ParsedWorkspaceFile =
  | { ok: true; payload: WorkspacePayload }
  | { ok: false };

/** Cheap client-side parse — the server re-validates everything. */
export async function parseWorkspaceFile(
  file: File
): Promise<ParsedWorkspaceFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return { ok: false };
  }
  const rec =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  if (rec?.format !== "wakeel.workspace/v1" || !Array.isArray(rec?.systems)) {
    return { ok: false };
  }
  const operator = rec.operator;
  if (!operator || typeof operator !== "object" || Array.isArray(operator)) {
    return { ok: false };
  }
  const op = operator as Record<string, unknown>;
  if (typeof op.name !== "string" || typeof op.workspace !== "string") {
    return { ok: false };
  }
  return {
    ok: true,
    payload: {
      format: "wakeel.workspace/v1",
      exportedAt: typeof rec.exportedAt === "string" ? rec.exportedAt : undefined,
      operator: {
        name: op.name,
        workspace: op.workspace,
        role: typeof op.role === "string" ? op.role : null,
      },
      systems: rec.systems as Record<string, unknown>[],
    },
  };
}

export type WorkspaceImportResult =
  | { ok: true; userId: string; systems: number; records: number }
  | { ok: false; reason: "invalid" | "error"; message?: string };

/** POST the payload — restores into a fresh operator. */
export async function confirmImport(
  payload: WorkspacePayload
): Promise<WorkspaceImportResult> {
  try {
    const res = await importWorkspace(
      payload as Parameters<typeof importWorkspace>[0]
    );
    return {
      ok: true,
      userId: res.user.id,
      systems: res.systems,
      records: res.records,
    };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : undefined,
    };
  }
}
