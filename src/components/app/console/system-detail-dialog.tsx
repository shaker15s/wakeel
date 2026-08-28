"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  ChartColumn,
  Loader2,
  Table2,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CategoryChip,
  OriginBadge,
  StatusDot,
  systemIcon,
  timeAgo,
} from "@/components/app/bits";
import { MonoLabel } from "@/components/app/motion-bits";
import {
  deleteSystem,
  getSystemDetail,
  parseBlueprint,
  parseRecordData,
  updateSystem,
} from "@/lib/api-client";
import type { SystemRecordDTO } from "@/lib/api-client";
import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";
import { RecordsTab } from "./system-detail/records-tab";
import { AutomationsTab } from "./system-detail/automations-tab";
import { AnalyticsTab } from "./system-detail/analytics-tab";

type DetailTab = "overview" | "records" | "automations" | "analytics";

const TABS: { id: DetailTab; label: string; icon: typeof Table2 }[] = [
  { id: "overview", label: "OVERVIEW", icon: Table2 },
  { id: "records", label: "RECORDS", icon: Table2 },
  { id: "automations", label: "AUTOMATIONS", icon: Workflow },
  { id: "analytics", label: "ANALYTICS", icon: ChartColumn },
];

/* ------------------------------ main dialog -------------------------------- */

export function SystemDetailDialog() {
  const systemId = useWakeel((s) => s.systemDetailId);
  const close = useWakeel((s) => s.closeSystemDetail);
  const userId = useWakeel((s) => s.userId);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<DetailTab>("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["records", systemId],
    queryFn: () => getSystemDetail(systemId!),
    enabled: !!systemId,
  });

  const system = data?.system;
  const records = data?.records ?? [];
  const blueprint = useMemo(
    () => parseBlueprint(system?.blueprint),
    [system?.blueprint]
  );
  const columns = useMemo(
    () =>
      blueprint.fields.length > 0
        ? blueprint.fields
        : records.length > 0
          ? Object.keys(parseRecordData(records[0].data)).map((key) => ({
              key,
              label: key,
              type: "text",
            }))
          : [],
    [blueprint.fields, records]
  );

  // reset local state whenever the dialog target changes
  // (adjust-state-during-render pattern — no effect needed)
  const [prevSystemId, setPrevSystemId] = useState(systemId);
  if (prevSystemId !== systemId) {
    setPrevSystemId(systemId);
    setTab("overview");
    setConfirmDelete(false);
  }

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["records", systemId] });
    queryClient.invalidateQueries({ queryKey: ["systems", userId] });
    queryClient.invalidateQueries({ queryKey: ["activity", userId] });
    queryClient.invalidateQueries({ queryKey: ["user", userId] });
  };

  const patchSystem = useMutation({
    mutationFn: (status: "ACTIVE" | "ARCHIVED") =>
      updateSystem(systemId!, { status }),
    onSuccess: (_data, status) => {
      invalidateAll();
      toast.success(status === "ARCHIVED" ? "System archived" : "System restored");
    },
    onError: (err: Error) =>
      toast.error("Update failed", { description: err.message }),
  });

  const destroySystem = useMutation({
    mutationFn: () => deleteSystem(systemId!),
    onSuccess: () => {
      invalidateAll();
      close();
      toast.success("System deleted", {
        description: "It and all of its records are gone. Logged to the ledger.",
      });
    },
    onError: (err: Error) =>
      toast.error("Delete failed", { description: err.message }),
  });

  // scroll the dialog body so the tab bar is at the top whenever the tab changes
  const tabBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = tabBarRef.current;
    if (!bar) return;
    const scroller = bar.closest('[data-slot="dialog-content"]');
    if (!(scroller instanceof HTMLElement)) return;
    const delta =
      bar.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    if (delta > 0) scroller.scrollTop += delta - 1;
  }, [tab]);

  return (
    <Dialog
      open={!!systemId}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[88vh] overflow-y-auto border-border bg-card sm:max-w-3xl"
        showCloseButton={!destroySystem.isPending}
      >
        {isLoading ? (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-sm" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ) : isError || !system ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-destructive">
              ⚠ SYSTEM UNAVAILABLE
            </p>
            <p className="text-sm text-muted-foreground">
              {error?.message ?? "This system could not be loaded."}
            </p>
            <Button variant="ghost" size="sm" onClick={close} className="font-mono text-[11px] uppercase tracking-[0.12em]">
              Close
            </Button>
          </div>
        ) : (
          (() => {
            const Icon = systemIcon(system.icon);
            const isArchived = system.status === "ARCHIVED";
            return (
              <div className="flex min-w-0 flex-col gap-5">
                {/* header */}
                <div className="flex items-start gap-3.5 pr-8">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-sm border border-gold/25 bg-gold/5 text-gold">
                    <Icon className="size-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <DialogTitle className="font-display text-xl font-bold tracking-tight">
                        {system.name}
                      </DialogTitle>
                      <OriginBadge origin={system.origin} />
                      <CategoryChip category={system.category} />
                      <StatusDot status={system.status} />
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {system.status}
                      </span>
                    </div>
                    {system.description && (
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {system.description}
                      </p>
                    )}
                    {system.source && (
                      <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/60">
                        SRC · {system.source}
                      </p>
                    )}
                  </div>
                </div>

                {/* sticky tab bar */}
                <div
                  ref={tabBarRef}
                  className="sticky top-0 z-10 -mx-6 border-b border-border bg-card/95 px-6 backdrop-blur-sm"
                  role="tablist"
                  aria-label="System detail sections"
                >
                  <div className="wakeel-scrollbar flex gap-1 overflow-x-auto">
                    {TABS.map((t) => {
                      const count =
                        t.id === "records"
                          ? records.length
                          : t.id === "automations"
                            ? blueprint.automations.length
                            : undefined;
                      const active = tab === t.id;
                      return (
                        <button
                          key={t.id}
                          role="tab"
                          aria-selected={active}
                          onClick={() => setTab(t.id)}
                          className={cn(
                            "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
                            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold/50",
                            active
                              ? "text-gold"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <t.icon className="size-3.5" />
                          {t.label}
                          {count !== undefined && count > 0 && (
                            <span
                              className={cn(
                                "rounded-sm px-1 py-px text-[9px] tabular-nums",
                                active
                                  ? "bg-gold/15 text-gold"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              {count}
                            </span>
                          )}
                          {active && (
                            <motion.span
                              layoutId="system-detail-tab-underline"
                              className="absolute inset-x-2 -bottom-px h-px bg-gold shadow-[0_0_8px_rgba(232,180,74,0.7)]"
                              transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* tab panels */}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="min-w-0"
                    role="tabpanel"
                  >
                    {tab === "overview" && (
                      <div className="flex min-w-0 flex-col gap-5">
                        {/* mini dashboard */}
                        <section className="flex flex-col gap-2.5">
                          <MonoLabel>PULSE · LAST 14 DAYS</MonoLabel>
                          <div className="grid gap-3 rounded-lg border border-border bg-secondary/40 p-4 sm:grid-cols-[1fr_auto]">
                            <div className="flex min-w-0 flex-col justify-between gap-3">
                              <div className="flex flex-wrap gap-x-6 gap-y-2">
                                <div className="flex flex-col">
                                  <span className="font-display text-xl font-bold tabular-nums text-foreground">
                                    {records.length}
                                  </span>
                                  <MonoLabel className="text-[9px]">RECORDS</MonoLabel>
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-mono text-[13px] font-medium text-foreground">
                                    {records.length > 0
                                      ? timeAgo(
                                        records.reduce((a, b) =>
                                          a.updatedAt > b.updatedAt ? a : b
                                        ).updatedAt
                                      )
                                      : "—"}
                                  </span>
                                  <MonoLabel className="text-[9px]">LAST WRITE</MonoLabel>
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-mono text-[13px] font-medium text-foreground">
                                    {blueprint.fields.length || "—"}
                                  </span>
                                  <MonoLabel className="text-[9px]">TYPED FIELDS</MonoLabel>
                                </div>
                              </div>
                              <RecordsPulse records={records} />
                            </div>
                            <div
                              className="hidden flex-col items-end justify-center border-l border-border/60 pl-4 sm:flex"
                              aria-hidden
                            >
                              <ChartColumn className="size-5 text-gold/50" />
                            </div>
                          </div>
                        </section>

                        {/* blueprint summary */}
                        <section className="flex flex-col gap-2.5">
                          <MonoLabel>BLUEPRINT · ENTITY FIELDS</MonoLabel>
                          {blueprint.fields.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No typed fields were specified for this system.
                            </p>
                          ) : (
                            <div className="overflow-hidden rounded-lg border border-border">
                              {blueprint.fields.map((f, i) => (
                                <div
                                  key={f.key}
                                  className={cn(
                                    "grid grid-cols-[1fr_auto] items-center gap-3 px-3.5 py-2.5",
                                    i > 0 && "border-t border-border/60"
                                  )}
                                >
                                  <div className="flex min-w-0 flex-col">
                                    <span className="truncate text-sm text-foreground">
                                      {f.label}
                                    </span>
                                    <span className="truncate font-mono text-[10px] text-muted-foreground/70">
                                      {f.key}
                                    </span>
                                  </div>
                                  <span className="rounded-sm border border-gold/30 bg-gold/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-gold">
                                    {f.type}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {blueprint.automations.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              <MonoLabel className="mt-1.5">AUTOMATIONS</MonoLabel>
                              <ul className="flex flex-col gap-1">
                                {blueprint.automations.slice(0, 3).map((a) => (
                                  <li
                                    key={a}
                                    className="flex items-start gap-2 text-[13px] text-muted-foreground"
                                  >
                                    <span className="mt-1 size-1 shrink-0 rounded-full bg-gold" />
                                    {a}
                                  </li>
                                ))}
                              </ul>
                              {blueprint.automations.length > 3 && (
                                <button
                                  type="button"
                                  onClick={() => setTab("automations")}
                                  className="self-start font-mono text-[10px] uppercase tracking-[0.14em] text-gold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold/50"
                                >
                                  +{blueprint.automations.length - 3} MORE · OPEN AUTOMATIONS →
                                </button>
                              )}
                            </div>
                          )}
                        </section>
                      </div>
                    )}

                    {tab === "records" && (
                      <RecordsTab
                        systemId={system.id}
                        systemName={system.name}
                        isArchived={isArchived}
                        records={records}
                        columns={columns}
                        invalidateAll={invalidateAll}
                      />
                    )}

                    {tab === "automations" && (
                      <AutomationsTab
                        systemId={system.id}
                        automations={blueprint.automations}
                        systemName={system.name}
                        isArchived={isArchived}
                        invalidateAll={invalidateAll}
                      />
                    )}

                    {tab === "analytics" && (
                      <AnalyticsTab
                        systemName={system.name}
                        records={records}
                        columns={columns}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>

                {/* danger zone */}
                <section className="flex flex-col gap-2 border-t border-border pt-4">
                  <MonoLabel className="text-muted-foreground/70">
                    DANGER ZONE
                  </MonoLabel>
                  <div className="flex flex-wrap gap-2">
                    {isArchived ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => patchSystem.mutate("ACTIVE")}
                        disabled={patchSystem.isPending}
                        className="h-9 gap-1.5 border border-live/40 font-mono text-[10px] uppercase tracking-[0.12em] text-live hover:bg-live/10"
                      >
                        {patchSystem.isPending ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <ArchiveRestore className="size-3.5" />
                        )}
                        Restore system
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => patchSystem.mutate("ARCHIVED")}
                        disabled={patchSystem.isPending}
                        className="h-9 gap-1.5 border border-border font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        {patchSystem.isPending ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Archive className="size-3.5" />
                        )}
                        Archive system
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDelete(true)}
                      disabled={destroySystem.isPending}
                      className="h-9 gap-1.5 border border-destructive/40 font-mono text-[10px] uppercase tracking-[0.12em] text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3.5" /> Delete system
                    </Button>
                    <span className="ml-auto self-center font-mono text-[10px] text-muted-foreground/60">
                      CREATED {timeAgo(system.createdAt)}
                    </span>
                  </div>
                </section>
              </div>
            );
          })()
        )}
      </DialogContent>

      {/* delete system confirm */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              Delete this system?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {system?.name} and all of its records will be permanently
              removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-[11px] uppercase tracking-[0.12em]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                destroySystem.mutate();
                setConfirmDelete(false);
              }}
              className="bg-destructive font-mono text-[11px] uppercase tracking-[0.12em] text-white hover:bg-destructive/90"
            >
              {destroySystem.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                "DELETE"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

/* ----------------------------- records pulse chart ------------------------- */

/** Tiny gold bar chart: records created per day over the last 14 days. */
function RecordsPulse({ records }: { records: SystemRecordDTO[] }) {
  const days = useMemo(() => {
    const buckets = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const rec of records) {
      const key = new Date(rec.createdAt).toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return [...buckets.entries()];
  }, [records]);

  const max = Math.max(1, ...days.map(([, n]) => n));
  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex h-12 items-end gap-[3px]"
        role="img"
        aria-label="Records created per day, last 14 days"
      >
        {days.map(([day, n]) => (
          <div
            key={day}
            title={`${day} · ${n} record${n === 1 ? "" : "s"}`}
            className="group relative flex-1 rounded-t-[2px] transition-colors"
            style={{ height: `${Math.max(8, (n / max) * 100)}%` }}
          >
            <div
              className={cn(
                "absolute inset-0 rounded-t-[2px] transition-colors",
                n > 0 ? "bg-gold/70 group-hover:bg-gold" : "bg-foreground/10"
              )}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/50">
        <span>D-14</span>
        <span>TODAY</span>
      </div>
    </div>
  );
}
