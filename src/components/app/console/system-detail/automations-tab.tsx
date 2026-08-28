"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Loader2, Play, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusDot, timeAgo } from "@/components/app/bits";
import { MonoLabel } from "@/components/app/motion-bits";
import {
  getAutomationRuns,
  parseRunLog,
  runAutomation,
} from "@/lib/api-client";
import type { AutomationLogLine, AutomationRun } from "@/lib/api-client";
import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";

const NO_AUTOMATIONS_ART = `  ┌────────────────────────┐
  │ ░ NO WORKFLOWS ░░░░░░░ │
  │ blueprint has none     │
  └────────────────────────┘`;

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
  return (
    <div
      className={cn(
        "wakeel-scrollbar relative overflow-y-auto rounded-lg border p-3.5 font-mono text-[11px] leading-[1.75]",
        status === "FAILED"
          ? "border-destructive/30 bg-destructive/[0.04]"
          : "border-border bg-black/40"
      )}
      role="log"
      aria-label="Automation execution log"
      style={{ maxHeight: 240 }}
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
              EXIT CODE 1 · {failure}
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
  const queryClient = useQueryClient();
  const [liveRun, setLiveRun] = useState<AutomationRun | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

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
        toast.success("Automation executed", {
          description: `${res.run.durationMs}ms · logged to the ledger.`,
        });
      } else {
        toast.error("Automation run failed", {
          description: "Upstream timeout — no data was affected. Check the log.",
        });
      }
    },
    onError: (err: Error) =>
      toast.error("Could not run automation", { description: err.message }),
  });

  const runningAutomation = runMutation.isPending
    ? runMutation.variables
    : null;

  const successCount = useMemo(
    () => runs.filter((r) => r.status === "DONE").length,
    [runs]
  );

  if (automations.length === 0) {
    return (
      <section className="flex flex-col gap-2.5">
        <MonoLabel>AUTOMATIONS · 0</MonoLabel>
        <EmptyState
          art={NO_AUTOMATIONS_ART}
          title="NO WORKFLOWS"
          copy="This system's blueprint has no automations. Forge a richer system or edit its blueprint to add workflows."
          className="py-8"
        />
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-4">
      {/* workflow cards */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <MonoLabel>AUTOMATIONS · {automations.length}</MonoLabel>
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {runs.length > 0
              ? `${successCount}/${runs.length} RUNS OK · SIMULATED`
              : "SIMULATION MODE"}
          </span>
        </div>
        {automations.map((a, i) => {
          const isRunning = runningAutomation === a;
          const lastRun = runs.find((r) => r.automation === a);
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
                  : "border-border bg-secondary/30 hover:border-gold/25 hover:bg-secondary/50"
              )}
            >
              <span className="hidden font-mono text-[10px] text-muted-foreground/40 sm:block">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-foreground/90">
                  {a}
                </p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">
                  {isRunning
                    ? "EXECUTING…"
                    : lastRun
                      ? `LAST RUN ${timeAgo(lastRun.createdAt)} · ${
                          lastRun.status === "DONE"
                            ? `${lastRun.durationMs}ms OK`
                            : "FAILED"
                        }`
                      : "NEVER RUN"}
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
                {isRunning ? "RUNNING" : "RUN"}
              </Button>
            </motion.div>
          );
        })}
      </div>

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
                <Zap className="mr-1 inline size-3" />
                EXECUTION CONSOLE
              </MonoLabel>
              <span className="font-mono text-[10px] text-muted-foreground/60">
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
            RUN HISTORY · {runs.length}
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
                    <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/85">
                      {run.automation}
                    </span>
                    <span className="hidden font-mono text-[10px] text-muted-foreground/60 sm:block">
                      {run.durationMs}ms
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/60">
                      {timeAgo(run.createdAt)}
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
        WORKFLOW RUNS ARE SIMULATED AGAINST LIVE SYSTEM DATA — WAKEEL PLANS REAL
        CONNECTORS FOR {systemName.toUpperCase()} ON YOUR ROADMAP.
      </p>
    </section>
  );
}
