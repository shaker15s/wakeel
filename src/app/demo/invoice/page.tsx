"use client";

import { useId, useMemo, useState } from "react";
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
  Sparkles,
  Trash2,
  UserCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AgentOrb, type AgentOrbState } from "@/components/app/agent-orb";
import { WakeelMark } from "@/components/app/logo";
import {
  MonoLabel,
  Reveal,
  ScrambleText,
  Stagger,
  StaggerItem,
  usePrefersReducedMotion,
} from "@/components/app/motion-bits";
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

/** What the agent is "thinking" while a given step is active — this is the
 * whole point of the console below: make the otherwise-invisible runtime
 * legible as something reasoning, not a spinner. */
const THOUGHTS: Record<string, string[]> = {
  validate_input: ["Parsing the invoice payload against the input schema…", "Checking customer id and line totals are well-formed…"],
  policy_check: ["Evaluating this write against the approval policy…", "Classifying risk tier from amount and customer…"],
  await_approval: ["Holding — nothing executes until a human decides, explicitly.", "Action hash computed and bound to this exact request."],
  execute_write: ["Issuing an idempotent write to the ERP connector…", "This call is keyed — replaying it is safe, never duplicated."],
  verify: ["Reading the record back from the source of truth…", "Confirming the write actually landed as claimed."],
};

function stepTone(status: string): string {
  switch (status) {
    case "succeeded":
      return "border-live bg-live/10 text-live shadow-[0_0_0_4px_rgba(62,207,142,0.1)]";
    case "failed":
      return "border-destructive bg-destructive/10 text-destructive shadow-[0_0_0_4px_rgba(229,83,61,0.1)]";
    case "running":
      return "border-gold bg-gold/10 text-gold shadow-[0_0_0_4px_rgba(232,180,74,0.15)]";
    case "waiting_for_approval":
      return "border-gold bg-gold/10 text-gold shadow-[0_0_0_4px_rgba(232,180,74,0.15)]";
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

function orbStateForTask(task: TaskView | null): AgentOrbState {
  if (!task) return "idle";
  if (task.result?.outcome === "failed") return "error";
  if (task.result?.outcome === "succeeded" || task.result?.outcome === "partially_succeeded") return "success";
  if (task.status === "waiting_for_approval") return "waiting";
  return "thinking";
}

function statusAnnouncement(task: TaskView | null): string {
  if (!task) return "";
  if (task.status === "waiting_for_approval") return "The agent is waiting for your approval decision.";
  if (task.result) return task.result.summary;
  return "The agent is working on your request.";
}

/* --------------------------------- ambient backdrop ------------------------------ */

const PARTICLES = [
  { x: 10, y: 18, d: 1.1, delay: 0 },
  { x: 86, y: 14, d: 1.8, delay: 0.6 },
  { x: 22, y: 72, d: 0.6, delay: 1.2 },
  { x: 72, y: 62, d: 1.4, delay: 0.3 },
  { x: 92, y: 82, d: 0.9, delay: 1 },
  { x: 6, y: 54, d: 1.2, delay: 1.6 },
  { x: 50, y: 88, d: 0.7, delay: 0.8 },
];

function AmbientBackdrop() {
  const reduced = usePrefersReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <motion.div
        className="absolute left-1/2 top-[-22rem] h-[640px] w-[960px] -translate-x-1/2 rounded-full opacity-[0.15] blur-[130px]"
        style={{ background: "radial-gradient(closest-side, var(--gold), transparent)" }}
        animate={reduced ? undefined : { x: [0, 40, -30, 0], y: [0, 24, -12, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
      {!reduced && (
        <motion.div
          className="absolute left-1/2 top-16 size-[640px] -translate-x-1/2 rounded-full opacity-[0.06]"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, var(--gold) 10deg, transparent 50deg, transparent 360deg)",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
        />
      )}
      <motion.div
        className="absolute inset-0 opacity-[0.045]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--foreground) 1px, transparent 1px), linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
        }}
        animate={reduced ? undefined : { backgroundPositionY: ["0px", "46px"] }}
        transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
      />
      {!reduced &&
        PARTICLES.map((p, i) => (
          <motion.span
            key={i}
            className="absolute size-1 rounded-full bg-gold/50"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            animate={{ y: [0, -18, 0], opacity: [0.15, 0.75, 0.15] }}
            transition={{ duration: 5 + p.d, repeat: Infinity, ease: "easeInOut", delay: p.delay }}
          />
        ))}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 60% 50% at 50% 20%, transparent 40%, var(--background) 100%)" }}
      />
    </div>
  );
}

/* --------------------------------- reasoning console ------------------------------ */

function ReasoningConsole({ task }: { task: TaskView }) {
  const running = task.steps.find((s) => s.status === "running");
  const activeName = running?.name ?? (task.status === "waiting_for_approval" ? "await_approval" : null);
  const lines = activeName ? (THOUGHTS[activeName] ?? []) : [];
  if (!activeName || lines.length === 0) return null;

  return (
    <motion.div
      key={activeName}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-lg border border-gold/20 bg-black/30 p-4 font-mono text-xs text-gold/90 shadow-[inset_0_1px_18px_rgba(0,0,0,0.45)]"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-gold" />
        </span>
        Agent reasoning
      </div>
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <div key={line} className="flex gap-1.5">
            <span className="shrink-0 text-gold/50">›</span>
            <ScrambleText text={line} speed={12} startDelay={i * 550} />
          </div>
        ))}
        <motion.span
          aria-hidden
          className="inline-block h-3 w-1.5 translate-y-0.5 bg-gold/70"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </div>
    </motion.div>
  );
}

/* --------------------------------- step tracker ------------------------------ */

function StepTracker({ task }: { task: TaskView }) {
  const reduced = usePrefersReducedMotion();
  const stepsByName = useMemo(() => new Map(task.steps.map((s) => [s.name, s])), [task.steps]);
  return (
    <div className="flex items-center gap-0">
      {STEP_ORDER.map((name, i) => {
        const step = stepsByName.get(name);
        const meta = STEP_META[name];
        const Icon = meta.icon;
        const status = step?.status ?? "pending";
        const nextStep = stepsByName.get(STEP_ORDER[i + 1]);
        const isActiveConnector = status === "running" || nextStep?.status === "running";
        return (
          <div key={name} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                layout
                initial={false}
                animate={status === "running" && !reduced ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                transition={{ duration: 1.3, repeat: status === "running" && !reduced ? Infinity : 0, ease: "easeInOut" }}
                className={cn(
                  "flex size-10 items-center justify-center rounded-full border-2 transition-colors duration-300",
                  stepTone(status),
                )}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={status === "running" ? "running" : status === "succeeded" ? "succeeded" : status === "failed" ? "failed" : "idle"}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center justify-center"
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
                  </motion.span>
                </AnimatePresence>
              </motion.div>
              <span
                className={cn(
                  "text-[10px] font-mono uppercase tracking-wider transition-colors",
                  status === "pending" ? "text-muted-foreground/60" : "text-muted-foreground",
                )}
              >
                {meta.label}
              </span>
            </div>
            {i < STEP_ORDER.length - 1 && (
              <div className="relative mx-1 h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gold"
                  initial={{ width: 0 }}
                  animate={{ width: status === "succeeded" ? "100%" : "0%" }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
                {!reduced && isActiveConnector && status !== "succeeded" && (
                  <motion.span
                    aria-hidden
                    className="absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-gold shadow-[0_0_8px_2px_rgba(232,180,74,0.7)]"
                    animate={{ left: ["0%", "100%"] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
                  />
                )}
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
  const reasonId = useId();
  const faultId = useId();
  const input = task.input as { customerId: string; lines: DemoInvoiceLine[]; memo?: string };
  const amount = input.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="relative gap-4 overflow-hidden border-gold/40 bg-gold/5 p-5">
        <motion.div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-gold to-transparent"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <motion.div animate={{ rotate: [0, -8, 8, 0] }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2 }}>
              <UserCheck className="size-5 text-gold" />
            </motion.div>
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
            <div className="text-muted-foreground">Action hash (what you&apos;re approving, exactly)</div>
            <div className="truncate text-foreground" title={approval.actionHash}>
              {approval.actionHash}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={faultId} className="text-xs font-medium text-muted-foreground">
            Simulate an ERP fault on write (optional, to see the runtime&apos;s reliability behavior)
          </label>
          <select
            id={faultId}
            value={fault}
            onChange={(e) => setFault(e.target.value as FaultInjection)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="none">No fault — write normally</option>
            <option value="transient_once">Transient failure once, then succeed</option>
            <option value="crash_after_write">Crash after the write actually succeeded (reconciliation test)</option>
            <option value="exhaust_retries">Fail every attempt (exhaust retry budget)</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={reasonId} className="sr-only">
            Reason for your decision
          </label>
          <Textarea
            id={reasonId}
            placeholder="Reason (required if rejecting, optional if approving)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-12 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <motion.div className="flex-1" whileTap={{ scale: 0.97 }}>
            <Button disabled={deciding} onClick={() => onDecide("approved", reason || undefined, fault)} className="w-full gap-1.5">
              {deciding ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Approve
            </Button>
          </motion.div>
          <motion.div className="flex-1" whileTap={{ scale: 0.97 }}>
            <Button
              disabled={deciding}
              variant="outline"
              onClick={() => onDecide("rejected", reason || "Rejected from the demo console")}
              className="w-full gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <XCircle className="size-4" />
              Reject
            </Button>
          </motion.div>
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
  const isSuccess = task.result.outcome === "succeeded";
  const isFailure = task.result.outcome === "failed";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={isFailure ? { opacity: 1, scale: 1, x: [0, -6, 6, -4, 4, 0] } : { opacity: 1, scale: 1 }}
      transition={{ duration: isFailure ? 0.45 : 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className={cn("gap-2 p-5", tone.className)}>
        <div className="flex items-center gap-2">
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 16, delay: 0.1 }}
          >
            <Icon className="size-5" />
          </motion.div>
          <span className="font-display text-sm font-semibold capitalize">{task.result.outcome.replace(/_/g, " ")}</span>
          {isSuccess && (
            <motion.span initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="ml-auto">
              <Sparkles className="size-4 text-live" />
            </motion.span>
          )}
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
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground transition-colors hover:border-gold/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <span className="flex items-center gap-1.5">
          <History className="size-3.5" /> Audit trail ({task.events.length} events)
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="size-3.5" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <motion.div
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
              className="mt-2 space-y-1.5 rounded-md border border-border bg-background/40 p-3"
            >
              {task.events.map((e) => (
                <motion.div
                  key={e.id}
                  variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }}
                  className="flex items-baseline gap-2 font-mono text-[11px]"
                >
                  <span className="text-muted-foreground">#{e.sequence}</span>
                  <span className="text-gold">{e.type}</span>
                  <span className="truncate text-muted-foreground">{JSON.stringify(e.payload)}</span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------ page ----------------------------------- */

export default function DemoInvoicePage() {
  const [tenantId] = useState(() => `demo-${crypto.randomUUID()}`);
  const [customerId, setCustomerId] = useState("cust-1042");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DemoInvoiceLine[]>([
    { description: "Consulting — October retainer", quantity: 1, unitPrice: 15000 },
  ]);
  const [task, setTask] = useState<TaskView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const customerIdFieldId = useId();
  const memoFieldId = useId();

  const amount = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const orbState = orbStateForTask(task);

  function updateLine(i: number, patch: Partial<DemoInvoiceLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit() {
    setSubmitting(true);
    try {
      const { task: created } = await createDemoTask(tenantId, { customerId, lines, memo: memo || undefined });
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
      const { task: updated } = await decideDemoApproval(tenantId, task.id, decision, { reason, faultInjection: fault });
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
    <main className="relative min-h-screen bg-background px-4 py-10 text-foreground sm:px-8">
      <AmbientBackdrop />
      {/* One clear, non-visual status announcement per change — kept separate
          from the orb (decorative) and the badge (re-renders constantly). */}
      <div role="status" aria-live="polite" className="sr-only">
        {statusAnnouncement(task)}
      </div>
      <div className="relative mx-auto max-w-4xl space-y-8">
        <Reveal>
          <header className="space-y-4">
            <div className="flex items-center gap-2">
              <WakeelMark className="size-6" />
              <span className="font-display text-base font-bold tracking-tight">Wakeel</span>
              <Badge variant="outline" className="gap-1 border-gold/40 text-gold">
                <FlaskConical className="size-3" /> Runtime demo
              </Badge>
              <span className="ml-auto flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-live" />
                </span>
                Live
              </span>
            </div>

            <div className="flex items-center gap-4">
              <AgentOrb state={orbState} size={72} />
              <div className="space-y-1.5">
                <h1 className="font-display text-2xl font-bold tracking-tight sm:text-4xl">
                  <span
                    className="bg-gradient-to-br from-gold-pale via-gold to-gold-deep bg-clip-text text-transparent"
                  >
                    Watch the agent work
                  </span>
                  , not just the result.
                </h1>
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  create_draft_invoice · durable runtime · zero mocked network calls
                </p>
              </div>
            </div>

            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              This page talks to the actual durable Task/Approval/Idempotency runtime (
              <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">src/server/runtime</code>) over a
              real HTTP API. It runs against an in-memory fake ERP connector instead of a real Odoo instance, so every
              safety property — mandatory approval, idempotent writes, crash recovery, verified results — actually
              executes in front of you, with the agent&apos;s reasoning visible at each step.
            </p>
          </header>
        </Reveal>

        <Reveal delay={0.08}>
          <Card className="gap-4 p-5 transition-shadow hover:shadow-[0_0_0_1px_rgba(232,180,74,0.08)]">
            <MonoLabel gold>[ Step 1 — describe the invoice ]</MonoLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={customerIdFieldId} className="text-xs font-medium text-muted-foreground">
                  Customer ID
                </label>
                <Input id={customerIdFieldId} value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!!task} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={memoFieldId} className="text-xs font-medium text-muted-foreground">
                  Memo (optional)
                </label>
                <Input id={memoFieldId} value={memo} onChange={(e) => setMemo(e.target.value)} disabled={!!task} placeholder="e.g. PO-2291" />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-muted-foreground">Line items</legend>
              <AnimatePresence initial={false}>
                {lines.map((line, i) => (
                  <motion.div
                    key={i}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Input
                      aria-label={`Line ${i + 1} description`}
                      className="min-w-[10rem] flex-1"
                      placeholder="Description"
                      value={line.description}
                      disabled={!!task}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                    />
                    <Input
                      aria-label={`Line ${i + 1} quantity`}
                      type="number"
                      className="w-24"
                      placeholder="Qty"
                      value={line.quantity}
                      disabled={!!task}
                      onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                    />
                    <Input
                      aria-label={`Line ${i + 1} unit price`}
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
                      aria-label={`Remove line ${i + 1}`}
                      disabled={!!task || lines.length === 1}
                      onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
              <Button
                variant="outline"
                size="sm"
                disabled={!!task}
                className="gap-1.5"
                onClick={() => setLines((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0 }])}
              >
                <Plus className="size-3.5" /> Add line
              </Button>
            </fieldset>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="font-mono text-sm text-muted-foreground">
                Total: <motion.span key={amount} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="text-foreground">
                  {amount.toLocaleString()} EGP
                </motion.span>
              </span>
              {!task ? (
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Button onClick={submit} disabled={submitting} className="gap-1.5">
                    {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Submit for approval
                  </Button>
                </motion.div>
              ) : (
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Button variant="outline" onClick={reset}>
                    Start another request
                  </Button>
                </motion.div>
              )}
            </div>
          </Card>
        </Reveal>

        <AnimatePresence>
          {task && (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-4"
            >
              <Card className="gap-4 p-5">
                <div className="flex items-center justify-between">
                  <MonoLabel gold>[ Step 2 — runtime execution ]</MonoLabel>
                  <motion.div key={task.status} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}>
                    <Badge variant="outline" className={taskToneBadge(task.status).className}>
                      {taskToneBadge(task.status).label}
                    </Badge>
                  </motion.div>
                </div>
                <StepTracker task={task} />
              </Card>

              <AnimatePresence mode="wait">
                <ReasoningConsole key={`console-${task.id}-${task.status}`} task={task} />
              </AnimatePresence>

              <AnimatePresence mode="wait">
                {task.pendingApproval && <ApprovalCard key="approval" task={task} onDecide={decide} deciding={deciding} />}
                {task.result && <ResultCard key="result" task={task} />}
              </AnimatePresence>

              <AuditTrail task={task} />
            </motion.div>
          )}
        </AnimatePresence>

        <Stagger className="grid gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:grid-cols-3">
          <StaggerItem>
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-gold" />
              <span>Every approval is bound to a sha256 action hash — tamper with it and execution refuses to run.</span>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="flex items-start gap-2">
              <Gavel className="mt-0.5 size-3.5 shrink-0 text-gold" />
              <span>Idempotent writes with crash-after-side-effect reconciliation — never a duplicate invoice.</span>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="flex items-start gap-2">
              <ListChecks className="mt-0.5 size-3.5 shrink-0 text-gold" />
              <span>Read-after-write verification — a mismatch is reported honestly, never silently as success.</span>
            </div>
          </StaggerItem>
        </Stagger>
      </div>
    </main>
  );
}
