/**
 * Client-side workspace import — shared by the operator menu (status bar)
 * and the onboarding dialog.
 *
 * Does the cheap client-side sanity check (JSON + format marker) before
 * hitting POST /api/workspace/import, which re-validates and restores
 * everything server-side into a brand-new operator workspace.
 */

import { importWorkspace } from "@/lib/api-client";

export type WorkspaceImportResult =
  | { ok: true; userId: string; systems: number; records: number }
  | { ok: false; reason: "invalid" | "error"; message?: string };

export async function importWorkspaceFile(
  file: File
): Promise<WorkspaceImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const rec =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  if (rec?.format !== "wakeel.workspace/v1" || !Array.isArray(rec?.systems)) {
    return { ok: false, reason: "invalid" };
  }
  try {
    const res = await importWorkspace(
      parsed as Parameters<typeof importWorkspace>[0]
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
