/** Honest, deterministic routing. Not an LLM and never an authorization boundary. */
export type WorkspaceIntent =
  "invoice" | "summary" | "capabilities" | "unsupported";
export function classifyWorkspaceIntent(text: string): WorkspaceIntent {
  const value = text.trim().normalize("NFKC").toLowerCase();
  if (/فاتور|فواتير|invoice/.test(value)) return "invoice";
  if (/مهام|مهامي|تقرير|ملخص|لخص|summary|tasks/.test(value)) return "summary";
  if (/مهار|قدرات|تقدر|skills|capabilit/.test(value)) return "capabilities";
  return "unsupported";
}
export function normalizeDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace("٫", ".");
}
export const WORKFLOW_LABELS: Record<string, string> = {
  validate_input: "مراجعة البيانات",
  policy_check: "فحص الصلاحيات",
  await_approval: "موافقتك أولًا",
  execute_write: "إنشاء المسودة",
  verify: "التحقق من النتيجة",
};
export const TASK_LABELS: Record<string, string> = {
  queued: "في الانتظار",
  running: "قيد التنفيذ",
  waiting_for_approval: "بانتظار موافقتك",
  verifying: "جارٍ التحقق",
  succeeded: "مكتملة ومتحققة",
  partially_succeeded: "تحتاج مراجعة",
  failed: "لم تكتمل",
  cancelled: "ملغاة",
  expired: "انتهت المهلة",
};
