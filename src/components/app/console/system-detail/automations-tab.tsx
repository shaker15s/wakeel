"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  CornerDownRight,
  Loader2,
  Play,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusDot, timeAgo } from "@/components/app/bits";
import { MonoLabel } from "@/components/app/motion-bits";
import {
  getAutomationRuns,
  parseRunLog,
  runAutomation,
  suggestAutomations,
  wireAutomation,
} from "@/lib/api-client";
import type { AutomationLogLine, AutomationRun } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";

const NO_AUTOMATIONS_ART = `  ┌────────────────────────┐
  │ ░ NO WORKFLOWS ░░░░░░░ │
  │ blueprint has none     │
  └────────────────────────┘`;

interface Proposal {
  title: string;
  trigger: string;
  action: string;
  why: string;
}

/* ------------------------------ suggest button ----------------------------- */

function SuggestButton({
  pending,
  disabled,
  onClick,
}: {
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled || pending}
      onClick={onClick}
      aria-label={pending ? t.auto.suggesting : t.auto.suggest}
      className={cn(
        "h-7 shrink-0 gap-1.5 rounded-sm border border-gold/30 px-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-gold",
        "transition-all hover:border-gold/60 hover:bg-gold/10 hover:shadow-[0_0_18px_-6px_rgba(232,180,74,0.5)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-40"
      )}
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Sparkles className="size-3" />
      )}
      {pending ? t.auto.suggesting : t.auto.suggest}
    </Button>
  );
}

/* ------------------------------ proposal card ------------------------------ */

function ProposalCard({
  proposal,
  index,
  wiring,
  disabled,
  onWire,
  onDismiss,
}: {
  proposal: Proposal;
  index: number;
  wiring: boolean;
  disabled: boolean;
  onWire: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.985 }}
      transition={{ delay: index * 0.07, duration: 0.28 }}
      className="corner-frame relative overflow-hidden rounded-lg border border-dashed border-gold/40 bg-gold/[0.045]"
    >
      <div className="bg-blueprint pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative flex flex-col gap-2.5 px-3.5 py-3">
        {/* tag row */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-sm border border-gold/40 bg-gold/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-gold">
            <Sparkles className="size-2.5" />
            {t.auto.proposedTag}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            disabled={wiring}
            aria-label={t.auto.dismiss}
            className="ms-auto flex size-5 items-center justify-center rounded-sm text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold/50 disabled:opacity-40"
          >
            <X className="size-3" />
          </button>
        </div>

        {/* title */}
        <p dir="auto" className="text-[13px] font-medium leading-snug text-foreground">
          {proposal.title}
        </p>

        {/* trigger → action */}
        <div className="flex flex-col gap-1 font-mono text-[10px] leading-relaxed">
          {proposal.trigger && (
            <div className="flex items-start gap-2">
              <span className="w-10 shrink-0 uppercase tracking-[0.14em] text-muted-foreground/50">
                {t.auto.whenLabel}
              </span>
              <span dir="auto" className="min-w-0 flex-1 text-foreground/80">
                {proposal.trigger}
              </span>
            </div>
          )}
          {proposal.action && (
            <div className="flex items-start gap-2">
              <span className="flex w-10 shrink-0 items-center gap-0.5 uppercase tracking-[0.14em] text-muted-foreground/50">
                <CornerDownRight className="size-2.5 text-gold/50" />
                {t.auto.thenLabel}
              </span>
              <span dir="auto" className="min-w-0 flex-1 text-gold/90">
                {proposal.action}
              </span>
            </div>
          )}
        </div>

        {/* why + wire */}
        <div className="flex items-end justify-between gap-3 border-t border-gold/15 pt-2.5">
          <p dir="auto" className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
            <span className="me-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-gold/70">
              {t.auto.whyLabel}
            </span>
            {proposal.why}
          </p>
          <Button
            size="sm"
            disabled={disabled || wiring}
            onClick={onWire}
            className="h-7 shrink-0 gap-1.5 rounded-sm bg-primary font-mono text-[9px] uppercase tracking-[0.14em] text-primary-foreground shadow-[0_0_16px_-6px_rgba(232,180,74,0.6)] hover:bg-gold-pale"
          >
            {wiring ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />}
            {wiring ? t.auto.wiring : t.auto.wire}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------ log line color ----------------------------- */

function levelColor(level: AutomationLogLine["level"]): string {
  switch (level) {
    case "ok":
      return "text-live";
    case "warn":
      return "text-gold";
    case "error":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

/* ------------------------------ console viewer ----------------------------- */

function LogConsole({
  lines,
  stagger,
  status,
  failure,
}: {
  lines: AutomationLogLine[];
  stagger: boolean;
  status: "RUNNING" | "DONE" | "FAILED";
  failure?: string | null;
}) {
  const t = useT();
  return (
    <div
      className={cn(
        "wakeel-scrollbar relative overflow-y-auto rounded-lg border p-3.5 font-mono text-[11px] leading-[1.75]",
        status === "FAILED"
          ? "border-destructive/30 bg-destructive/[0.04]"
          : "border-border bg-black/40"
      )}
      role="log"
      aria-label={t.auto.logLabel}
      style={{ maxHeight: 240 }}
      dir="ltr"
    >
      {/* scanline sheen while running */}
      {status === "RUNNING" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden">
          <motion.div
            className="h-px w-full bg-gold/50 shadow-[0_0_12px_rgba(232,180,74,0.6)]"
            animate={{ top: ["0%", "100%", "0%"] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
          />
        </div>
      )}
      <motion.ul
        initial={stagger ? "hidden" : false}
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.07 } },
        }}
        className="flex flex-col gap-0.5"
      >
        {lines.map((l, i) => (
          <motion.li
            key={`${i}-${l.t}`}
            variants={{
              hidden: { opacity: 0, x: -6 },
              show: { opacity: 1, x: 0 },
            }}
            className="flex gap-3"
          >
            <span className="w-14 shrink-0 select-none text-right text-muted-foreground/40">
              +{String(l.t).padStart(3, "0")}ms
            </span>
            <span className={cn("min-w-0 break-words", levelColor(l.level))}>
              {l.line}
            </span>
          </motion.li>
        ))}
        {status === "RUNNING" && (
          <li className="flex gap-3">
            <span className="w-14 shrink-0" />
            <span className="inline-block h-3.5 w-2 animate-blink bg-gold" />
          </li>
        )}
        {status === "FAILED" && failure && (
          <li className="mt-1.5 flex gap-3 border-t border-destructive/20 pt-1.5">
            <span className="w-14 shrink-0" />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-destructive">
              {t.auto.exitCode(failure)}
            </span>
          </li>
        )}
      </motion.ul>
    </div>
  );
}

/* ------------------------------ automations tab ---------------------------- */

export function AutomationsTab({
  systemId,
  automations,
  systemName,
  isArchived,
  invalidateAll,
}: {
  systemId: string;
  automations: string[];
  systemName: string;
  isArchived: boolean;
  invalidateAll: () => void;
}) {
  const userId = useWakeel((s) => s.userId);
  const lang = useWakeel((s) => s.lang);
  const t = useT();
  const queryClient = useQueryClient();
  const [liveRun, setLiveRun] = useState<AutomationRun | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  /* AUTOMATION LAB state */
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [justWired, setJustWired] = useState<string | null>(null);

  const runsQuery = useQuery({
    queryKey: ["automation-runs", systemId],
    queryFn: () => getAutomationRuns(systemId),
    refetchInterval: 30_000,
  });
  const runs = runsQuery.data?.runs ?? [];

  const runMutation = useMutation({
    mutationFn: (automation: string) => runAutomation(systemId, automation),
    onSuccess: (res) => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["automation-runs", systemId] });
      setLiveRun(res.run);
      setExpanded(null);
      if (res.run.status === "DONE") {
        toast.success(t.auto.toastOk, {
          description: t.auto.toastOkDesc(res.run.durationMs),
        });
      } else {
        toast.error(t.auto.toastFail, {
          description: t.auto.toastFailDesc,
        });
      }
    },
    onError: (err: Error) =>
      toast.error(t.auto.toastErr, { description: err.message }),
  });

  const runningAutomation = runMutation.isPending
    ? runMutation.variables
    : null;

  /* ------------------------------ AUTOMATION LAB ------------------------------ */

  const suggest = useMutation({
    mutationFn: () => suggestAutomations(systemId, lang),
    onSuccess: (res) => {
      const fresh = res.proposals.filter(
        (p) => !automations.some((a) => a.toLowerCase() === p.title.toLowerCase())
      );
      if (fresh.length === 0) {
        toast.info(t.auto.suggestErr);
        return;
      }
      setProposals(fresh);
    },
    onError: (err: Error) =>
      toast.error(t.auto.suggestErr, { description: err.message }),
  });

  const wire = useMutation({
    mutationFn: (title: string) => wireAutomation(systemId, title),
    onSuccess: (res) => {
      invalidateAll();
      setProposals((prev) =>
        prev ? prev.filter((p) => p.title !== res.wired) : prev
      );
      setJustWired(res.wired);
      window.setTimeout(() => setJustWired(null), 3200);
      toast.success(t.auto.wireOk, { description: t.auto.wireOkDesc });
    },
    onError: (err: Error) =>
      toast.error(t.auto.wireErr, { description: err.message }),
  });

  const wiringTitle = wire.isPending ? wire.variables : null;

  const successCount = useMemo(
    () => runs.filter((r) => r.status === "DONE").length,
    [runs]
  );

  if (automations.length === 0) {
    return (
      <section className="flex flex-col gap-2.5">
        <MonoLabel>{t.auto.zero}</MonoLabel>
        <EmptyState
          art={NO_AUTOMATIONS_ART}
          title={t.auto.noWorkflowsT}
          copy={t.auto.noWorkflowsC}
          className="py-8"
        />
        {/* AUTOMATION LAB — Wakeel can bootstrap the blueprint from here too */}
        <div className="flex flex-col items-center gap-2.5 pb-2">
          <SuggestButton
            pending={suggest.isPending}
            disabled={isArchived}
            onClick={() => suggest.mutate()}
          />
          <AnimatePresence mode="wait">
            {suggest.isPending && (
              <motion.div
                key="thinking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 font-mono text-[10px] text-gold/80"
              >
                <span className="inline-block h-3 w-1.5 animate-blink bg-gold" />
                {t.auto.suggesting}
              </motion.div>
            )}
          </AnimatePresence>
          {proposals && proposals.length > 0 && (
            <div className="mt-1 flex w-full flex-col gap-2.5">
              <MonoLabel gold className="text-[9px]">
                <Sparkles className="me-1 inline size-3" />
                {t.auto.proposals(proposals.length)}
              </MonoLabel>
              <AnimatePresence initial={false}>
                {proposals.map((p, i) => (
                  <ProposalCard
                    key={p.title}
                    proposal={p}
                    index={i}
                    wiring={wiringTitle === p.title}
                    disabled={isArchived || wire.isPending}
                    onWire={() => wire.mutate(p.title)}
                    onDismiss={() =>
                      setProposals((prev) =>
                        prev ? prev.filter((q) => q.title !== p.title) : prev
                      )
                    }
                  />
                ))}
              </AnimatePresence>
              <p className="font-mono text-[9px] leading-relaxed text-muted-foreground/50">
                {t.auto.labHint}
              </p>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-4">
      {/* workflow cards */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <MonoLabel>{t.auto.count(automations.length)}</MonoLabel>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {runs.length > 0
                ? t.auto.runsOk(successCount, runs.length)
                : t.auto.simMode}
            </span>
            <SuggestButton
              pending={suggest.isPending}
              disabled={isArchived}
              onClick={() => suggest.mutate()}
            />
          </div>
        </div>
        {automations.map((a, i) => {
          const isRunning = runningAutomation === a;
          const lastRun = runs.find((r) => r.automation === a);
          const isNew = justWired === a;
          return (
            <motion.div
              key={a}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn(
                "group relative flex items-center gap-3 overflow-hidden rounded-lg border px-3.5 py-3 transition-colors",
                isRunning
                  ? "border-gold/50 bg-gold/[0.06]"
                  : isNew
                    ? "border-gold/60 bg-gold/[0.08] shadow-[0_0_24px_-8px_rgba(232,180,74,0.45)]"
                    : "border-border bg-secondary/30 hover:border-gold/25 hover:bg-secondary/50"
              )}
            >
              {isNew && (
                <motion.span
                  initial={{ opacity: 0.9 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 1.4, repeat: 1 }}
                  className="pointer-events-none absolute inset-0 bg-gradient-to-r from-gold/15 via-transparent to-transparent"
                  aria-hidden
                />
              )}
              <span className="hidden font-mono text-[10px] text-muted-foreground/40 sm:block">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-foreground/90">
                  {a}
                </p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">
                  {isRunning
                    ? t.auto.executing
                    : lastRun
                      ? t.auto.lastRun(timeAgo(lastRun.createdAt, lang), lastRun.status === "DONE", lastRun.durationMs)
                      : t.auto.neverRun}
                </p>
              </div>
              <Button
                size="sm"
                disabled={isArchived || runMutation.isPending}
                onClick={() => runMutation.mutate(a)}
                className={cn(
                  "h-8 shrink-0 gap-1.5 rounded-sm font-mono text-[10px] uppercase tracking-[0.12em]",
                  isRunning
                    ? "bg-gold/20 text-gold"
                    : "bg-primary text-primary-foreground hover:bg-gold-pale"
                )}
              >
                {isRunning ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Play className="size-3" />
                )}
                {isRunning ? t.auto.running : t.auto.run}
              </Button>
            </motion.div>
          );
        })}
      </div>

      {/* AUTOMATION LAB — Wakeel's proposals */}
      <AnimatePresence>
        {proposals && proposals.length > 0 && (
          <motion.div
            key="lab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-col gap-2.5"
          >
            <MonoLabel gold className="text-[9px]">
              <Sparkles className="me-1 inline size-3" />
              {t.auto.proposals(proposals.length)}
            </MonoLabel>
            <AnimatePresence initial={false}>
              {proposals.map((p, i) => (
                <ProposalCard
                  key={p.title}
                  proposal={p}
                  index={i}
                  wiring={wiringTitle === p.title}
                  disabled={isArchived || wire.isPending}
                  onWire={() => wire.mutate(p.title)}
                  onDismiss={() =>
                    setProposals((prev) =>
                      prev ? prev.filter((q) => q.title !== p.title) : prev
                    )
                  }
                />
              ))}
            </AnimatePresence>
            <p className="font-mono text-[9px] leading-relaxed text-muted-foreground/50">
              {t.auto.labHint}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* live console */}
      <AnimatePresence mode="wait">
        {liveRun && (
          <motion.div
            key={liveRun.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-2">
              <MonoLabel gold className="text-[9px]">
                <Zap className="me-1 inline size-3" />
                {t.auto.console}
              </MonoLabel>
              <span className="font-mono text-[10px] text-muted-foreground/60" dir="ltr">
                {liveRun.trigger} · {liveRun.durationMs}MS
              </span>
            </div>
            <LogConsole
              lines={parseRunLog(liveRun.log)}
              stagger
              status={liveRun.status}
              failure={null}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* run history */}
      {runs.length > 0 && (
        <div className="flex flex-col gap-2">
          <MonoLabel className="text-muted-foreground/70">
            {t.auto.history(runs.length)}
          </MonoLabel>
          <div className="wakeel-scrollbar flex max-h-72 flex-col overflow-y-auto rounded-lg border border-border">
            {runs.map((run, i) => {
              const lines = parseRunLog(run.log);
              const isOpen = expanded === run.id;
              return (
                <div
                  key={run.id}
                  className={cn(
                    "flex flex-col",
                    i > 0 && "border-t border-border/60"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setExpanded(isOpen ? null : run.id);
                      if (!isOpen) setLiveRun(null);
                    }}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-gold/50"
                  >
                    <StatusDot status={run.status} />
                    <span dir="auto" className="min-w-0 flex-1 truncate text-[12px] text-foreground/85">
                      {run.automation}
                    </span>
                    <span className="hidden font-mono text-[10px] text-muted-foreground/60 sm:block" dir="ltr">
                      {run.durationMs}ms
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/60" dir="ltr">
                      {timeAgo(run.createdAt, lang)}
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-180"
                      )}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3">
                          <LogConsole
                            lines={lines}
                            stagger={false}
                            status={run.status}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="font-mono text-[10px] leading-relaxed text-muted-foreground/50">
        {t.auto.footer(systemName)}
      </p>
    </section>
  );
}
