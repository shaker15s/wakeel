import { z } from "zod";

export const toolNames = [
  "memory.search",
  "memory.read",
  "memory.workpaper",
  "sheet.profile",
  "finance.reconcile",
  "finance.ledger_check",
  "finance.budget_variance",
  "finance.table_summary",
  "finance.aggregate",
  "odoo.read",
  "finance.calculate",
  "finance.ageing",
  "odoo.propose_journal",
] as const;
export const stepSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
  title: z.string().min(1).max(160),
  tool: z.enum(toolNames),
  dependsOn: z.array(z.string()).max(10),
  input: z.record(z.string(), z.unknown()),
});
export const planSchema = z
  .object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(1000),
    clarification: z.string().max(2000).nullable(),
    steps: z.array(stepSchema).max(10),
  })
  .superRefine((plan, ctx) => {
    const seen = new Set<string>();
    for (const step of plan.steps) {
      if (seen.has(step.id) || step.dependsOn.some((id) => !seen.has(id)))
        ctx.addIssue({
          code: "custom",
          message: "Plan must be ordered, acyclic and have unique step IDs",
        });
      seen.add(step.id);
    }
  });
export const reviewSchema = z
  .object({
    summary: z.string().min(1).max(1200),
    decision: z.enum(["ready", "extend", "clarify"]),
    question: z.string().max(2000).nullable(),
    steps: z.array(stepSchema).max(5),
  })
  .superRefine((r, ctx) => {
    if (
      (r.decision === "extend" && !r.steps.length) ||
      (r.decision !== "extend" && r.steps.length) ||
      (r.decision === "clarify" && !r.question) ||
      (r.decision !== "clarify" && r.question)
    )
      ctx.addIssue({ code: "custom", message: "Inconsistent review decision" });
  });
export type Review = z.infer<typeof reviewSchema>;
export type Plan = z.infer<typeof planSchema>;
export interface Step extends z.infer<typeof stepSchema> {
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  startedAt?: string;
  finishedAt?: string;
  output?: unknown;
  error?: string;
}
export interface Activity {
  id: string;
  kind:
    | "understanding"
    | "memory"
    | "planning"
    | "odoo"
    | "calculation"
    | "review"
    | "report"
    | "approval"
    | "error";
  label: string;
  at: string;
}
export interface Turn {
  id: string;
  request: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "blocked"
    | "interrupted"
    | "failed";
  reviewCount?: number;
  reviewComplete?: boolean;
  reviews?: {
    at: string;
    summary: string;
    decision: Review["decision"];
    stepIds: string[];
  }[];
  phase: string;
  reply: string;
  clarification?: string | null;
  steps: Step[];
  activities: Activity[];
  sources: { id: string; title: string; hash: string; excerpt: string }[];
  odooFingerprint?: string;
  documentIds?: string[];
  createdAt: string;
  finishedAt?: string;
}
export interface FinanceSession {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: Turn[];
}
export interface MemoryDocument {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  hash: string;
  kind: "document" | "policy";
  createdAt: string;
}
export const modelConfigSchema = z.object({
  baseUrl: z.url().max(300),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().min(1).max(2000),
});
export const odooConfigSchema = z.object({
  url: z.url().max(300),
  database: z.string().min(1).max(150),
  username: z.string().min(1).max(150),
  apiKey: z.string().min(1).max(2000),
  companyId: z.number().int().positive(),
});
export type ModelConfig = z.infer<typeof modelConfigSchema>;
export type OdooConfig = z.infer<typeof odooConfigSchema>;
export interface Connections {
  model?: ModelConfig;
  odoo?: OdooConfig;
  modelVerifiedAt?: string;
  odooVerifiedAt?: string;
}
export const journalSchema = z
  .object({
    journalId: z.number().int().positive(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (d) =>
          Number.isFinite(Date.parse(d)) &&
          new Date(d).toISOString().slice(0, 10) === d,
        "Invalid calendar date",
      ),
    description: z.string().min(1).max(200),
    lines: z
      .array(
        z.object({
          accountId: z.number().int().positive(),
          label: z.string().min(1).max(200),
          debit: z.number().nonnegative().max(1e10),
          credit: z.number().nonnegative().max(1e10),
        }),
      )
      .min(2)
      .max(50),
  })
  .superRefine((entry, ctx) => {
    const cents = (n: number) => Math.round(n * 100);
    if (
      entry.lines.some(
        (l) =>
          l.debit > 0 === l.credit > 0 ||
          Math.abs(l.debit * 100 - cents(l.debit)) > 1e-6 ||
          Math.abs(l.credit * 100 - cents(l.credit)) > 1e-6,
      )
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Each line needs either debit or credit, with at most two decimals",
      });
    if (
      entry.lines.reduce((s, l) => s + cents(l.debit) - cents(l.credit), 0) !==
      0
    )
      ctx.addIssue({
        code: "custom",
        message: "Journal must balance exactly to cents",
      });
  });
export interface JournalApproval {
  id: string;
  workspaceId: string;
  sessionId: string;
  turnId: string;
  stepId: string;
  action: z.infer<typeof journalSchema>;
  actionHash: string;
  connectionHash: string;
  review?: {
    companyId: number;
    database: string;
    host: string;
    journalName: string;
    accounts: { id: number; name: string; code: string }[];
  };
  status:
    | "pending"
    | "rejected"
    | "executing"
    | "verified"
    | "unknown"
    | "failed";
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
  evidence?: unknown;
  error?: string;
}
export class FinanceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "FinanceError";
  }
}
