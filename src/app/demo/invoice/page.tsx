"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  Gavel,
  History,
  ListChecks,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { WakeelMark } from "@/components/app/logo";
import { MonoLabel } from "@/components/app/motion-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  createDemoTask,
  decideDemoApproval,
  type DemoInvoiceLine,
  type FaultInjection,
  type TaskView,
} from "@/lib/demo-invoice-client";
import { cn } from "@/lib/utils";

/* ------------------------------- step metadata ------------------------------ */

const STEP_META: Record<string, { label: string; icon: typeof ShieldCheck }> = {
  validate_input: { label: "Validate", icon: ListChecks },
  policy_check: { label: "Policy", icon: Gavel },
  await_approval: { label: "Approval", icon: UserCheck },
  execute_write: { label: "Execute", icon: Send },
  verify: { label: "Verify", icon: ShieldCheck },
};

const STEP_ORDER = ["validate_input", "policy_check", "await_approval", "execute_write", "verify"];

function stepTone(status: string): string {
  switch (status) {
    case "succeeded":
      return "border-live bg-live/10 text-live";
    case "failed":
      return "border-destructive bg-destructive/10 text-destructive";
    case "running":
      return "border-gold bg-gold/10 text-gold animate-pulse";
    case "waiting_for_approval":
      return "border-gold bg-gold/10 text-gold";
    case "skipped":
      return "border-border bg-transparent text-muted-foreground line-through opacity-50";
    default:
      return "border-border bg-transparent text-muted-foreground";
  }
}

function taskToneBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "succeeded":
      return { label: "Succeeded", className: "bg-live/15 text-live border-live/40" };
    case "partially_succeeded":
      return { label: "Partially succeeded", className: "bg-gold/15 text-gold border-gold/40" };
    case "failed":
      return { label: "Failed", className: "bg-destructive/15 text-destructive border-destructive/40" };
    case "waiting_for_approval":
      return { label: "Waiting for approval", className: "bg-gold/15 text-gold border-gold/40" };
    case "expired":
      return { label: "Expired", className: "bg-destructive/15 text-destructive border-destructive/40" };
    default:
      return { label: status, className: "bg-secondary text-secondary-foreground border-border" };
  }
}

/* --------------------------------- step tracker ------------------------------ */

function StepTracker({ task }: { task: TaskView }) {
  const stepsByName = useMemo(() => new Map(task.steps.map((s) => [s.name, s])), [task.steps]);
  return (
    <div className="flex items-center gap-0">
      {STEP_ORDER.map((name, i) => {
        const step = stepsByName.get(name);
        const meta = STEP_META[name];
        const Icon = meta.icon;
        const status = step?.status ?? "pending";
        return (
          <div key={name} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                initial={false}
                animate={{ scale: status === "running" ? [1, 1.08, 1] : 1 }}
                transition={{ duration: 1.2, repeat: status === "running" ? Infinity : 0 }}
                className={cn(
                  "flex size-10 items-center justify-center rounded-full border-2 transition-colors",
                  stepTone(status),
                )}
              >
                {status === "running" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : status === "succeeded" ? (
                  <CheckCircle2 className="size-4" />
                ) : status === "failed" ? (
                  <XCircle className="size-4" />
                ) : (
                  <Icon className="size-4" />
                )}
              </motion.div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {meta.label}
              </span>
            </div>
            {i < STEP_ORDER.length - 1 && (
              <div className="relative mx-1 h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gold"
                  initial={{ width: 0 }}
                  animate={{ width: status === "succeeded" ? "100%" : "0%" }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- approval card ------------------------------ */

function ApprovalCard({
  task,
  onDecide,
  deciding,
}: {
  task: TaskView;
  onDecide: (decision: "approved" | "rejected", reason?: string, fault?: FaultInjection) => void;
  deciding: boolean;
}) {
  const approval = task.pendingApproval!;
  const [reason, setReason] = useState("");
  const [fault, setFault] = useState<FaultInjection>("none");
  const input = task.input as { customerId: string; lines: DemoInvoiceLine[]; memo?: string };
  const amount = input.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
      <Card className="gap-4 border-gold/40 bg-gold/5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserCheck className="size-5 text-gold" />
            <div>
              <div className="font-display text-sm font-semibold text-foreground">Human approval required</div>
              <div className="text-xs text-muted-foreground">
                This is the real gate — nothing executes against the ERP without an explicit decision here.
              </div>
            </div>
          </div>
          <Badge variant="outline" className="border-gold/40 text-gold">
            {approval.riskLevel}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background/40 p-3 font-mono text-xs">
          <div>
            <div className="text-muted-foreground">Customer</div>
            <div className="text-foreground">{String(input.customerId)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Amount</div>
            <div className="text-foreground">{amount.toLocaleString()} EGP</div>
          </div>
          <div className="col-span-2">
            <div className="text-muted-foreground">Action hash (what you're approving, exactly)</div>
            <div className="truncate text-foreground" title={approval.actionHash}>
              {approval.actionHash}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Simulate an ERP fault on write (optional, to see the runtime's reliability behavior)
          </label>
          <select
            value={fault}
            onChange={(e) => setFault(e.target.value as FaultInjection)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="none">No fault — write normally</option>
            <option value="transient_once">Transient failure once, then succeed</option>
            <option value="crash_after_write">Crash after the write actually succeeded (reconciliation test)</option>
            <option value="exhaust_retries">Fail every attempt (exhaust retry budget)</option>
          </select>
        </div>

        <Textarea
          placeholder="Reason (required if rejecting, optional if approving)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-12 text-sm"
        />

        <div className="flex gap-2">
          <Button
            disabled={deciding}
            onClick={() => onDecide("approved", reason || undefined, fault)}
            className="flex-1 gap-1.5"
          >
            {deciding ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Approve
          </Button>
          <Button
            disabled={deciding}
            variant="outline"
            onClick={() => onDecide("rejected", reason || "Rejected from the demo console")}
            className="flex-1 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <XCircle className="size-4" />
            Reject
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

/* --------------------------------- result card ------------------------------ */

function ResultCard({ task }: { task: TaskView }) {
  if (!task.result) return null;
  const tone =
    task.result.outcome === "succeeded"
      ? { icon: CheckCircle2, className: "border-live/40 bg-live/5 text-live" }
      : task.result.outcome === "partially_succeeded"
        ? { icon: AlertTriangle, className: "border-gold/40 bg-gold/5 text-gold" }
        : { icon: XCircle, className: "border-destructive/40 bg-destructive/5 text-destructive" };
  const Icon = tone.icon;

  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
      <Card className={cn("gap-2 p-5", tone.className)}>
        <div className="flex items-center gap-2">
          <Icon className="size-5" />
          <span className="font-display text-sm font-semibold capitalize">
            {task.result.outcome.replace(/_/g, " ")}
          </span>
        </div>
        <p className="text-sm text-foreground/90">{task.result.summary}</p>
        {task.result.unresolvedIssues.length > 0 && (
          <ul className="mt-1 list-inside list-disc space-y-0.5 font-mono text-xs text-muted-foreground">
            {task.result.unresolvedIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
      </Card>
    </motion.div>
  );
}

/* --------------------------------- audit trail ------------------------------ */

function AuditTrail({ task }: { task: TaskView }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <History className="size-3.5" /> Audit trail ({task.events.length} events)
        </span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1.5 rounded-md border border-border bg-background/40 p-3">
              {task.events.map((e) => (
                <div key={e.id} className="flex items-baseline gap-2 font-mono text-[11px]">
                  <span className="text-muted-foreground">#{e.sequence}</span>
                  <span className="text-gold">{e.type}</span>
                  <span className="truncate text-muted-foreground">{JSON.stringify(e.payload)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------ page ----------------------------------- */

export default function DemoInvoicePage() {
  const [customerId, setCustomerId] = useState("cust-1042");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DemoInvoiceLine[]>([
    { description: "Consulting — October retainer", quantity: 1, unitPrice: 15000 },
  ]);
  const [task, setTask] = useState<TaskView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deciding, setDeciding] = useState(false);

  const amount = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);

  function updateLine(i: number, patch: Partial<DemoInvoiceLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit() {
    setSubmitting(true);
    try {
      const { task: created } = await createDemoTask({ customerId, lines, memo: memo || undefined });
      setTask(created);
      if (created.status === "failed") {
        toast.error(created.result?.summary ?? "The task failed validation or policy checks.");
      } else {
        toast.success("Task created — awaiting your approval decision.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the task.");
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(decision: "approved" | "rejected", reason?: string, fault?: FaultInjection) {
    if (!task) return;
    setDeciding(true);
    try {
      const { task: updated } = await decideDemoApproval(task.id, decision, { reason, faultInjection: fault });
      setTask(updated);
      if (updated.result?.outcome === "succeeded") toast.success(updated.result.summary);
      else if (updated.result?.outcome === "partially_succeeded") toast.warning(updated.result.summary);
      else if (updated.result?.outcome === "failed") toast.error(updated.result.summary);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record the decision.");
    } finally {
      setDeciding(false);
    }
  }

  function reset() {
    setTask(null);
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-3">
          <div className="flex items-center gap-2">
            <WakeelMark className="size-7" />
            <span className="font-display text-lg font-bold tracking-tight">Wakeel</span>
            <Badge variant="outline" className="gap-1 border-gold/40 text-gold">
              <FlaskConical className="size-3" /> Runtime demo
            </Badge>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Draft-invoice runtime — live, sandboxed, no Odoo required
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            This page talks to the actual durable Task/Approval/Idempotency runtime (
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">src/server/runtime</code>) over a
            real HTTP API — nothing here is mocked in the frontend. It runs against an in-memory fake ERP connector
            instead of a real Odoo instance, so you can see every safety property (mandatory approval, idempotent
            writes, crash recovery, verified results) actually execute without needing real ERP credentials.
          </p>
        </header>

        <Card className="gap-4 p-5">
          <MonoLabel gold>[ Step 1 — describe the invoice ]</MonoLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Customer ID</label>
              <Input value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!!task} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Memo (optional)</label>
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} disabled={!!task} placeholder="e.g. PO-2291" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Line items</label>
            {lines.map((line, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  className="min-w-[10rem] flex-1"
                  placeholder="Description"
                  value={line.description}
                  disabled={!!task}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                />
                <Input
                  type="number"
                  className="w-24"
                  placeholder="Qty"
                  value={line.quantity}
                  disabled={!!task}
                  onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                />
                <Input
                  type="number"
                  className="w-32"
                  placeholder="Unit price"
                  value={line.unitPrice}
                  disabled={!!task}
                  onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!!task || lines.length === 1}
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={!!task}
              className="gap-1.5"
              onClick={() => setLines((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0 }])}
            >
              <Plus className="size-3.5" /> Add line
            </Button>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="font-mono text-sm text-muted-foreground">
              Total: <span className="text-foreground">{amount.toLocaleString()} EGP</span>
            </span>
            {!task ? (
              <Button onClick={submit} disabled={submitting} className="gap-1.5">
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Submit for approval
              </Button>
            ) : (
              <Button variant="outline" onClick={reset}>
                Start another request
              </Button>
            )}
          </div>
        </Card>

        <AnimatePresence>
          {task && (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <Card className="gap-4 p-5">
                <div className="flex items-center justify-between">
                  <MonoLabel gold>[ Step 2 — runtime execution ]</MonoLabel>
                  <Badge variant="outline" className={taskToneBadge(task.status).className}>
                    {taskToneBadge(task.status).label}
                  </Badge>
                </div>
                <StepTracker task={task} />
              </Card>

              <AnimatePresence mode="wait">
                {task.pendingApproval && (
                  <ApprovalCard key="approval" task={task} onDecide={decide} deciding={deciding} />
                )}
                {task.result && <ResultCard key="result" task={task} />}
              </AnimatePresence>

              <AuditTrail task={task} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
