"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  ChartColumn,
  Loader2,
  Share2,
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
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { RecordsTab } from "./system-detail/records-tab";
import { AutomationsTab } from "./system-detail/automations-tab";
import { AnalyticsTab } from "./system-detail/analytics-tab";
import { ShareDialog } from "./share-dialog";

type DetailTab = "overview" | "records" | "automations" | "analytics";

/* ------------------------------ main dialog -------------------------------- */

export function SystemDetailDialog() {
  const t = useT();
  const lang = useWakeel((s) => s.lang);
  const systemId = useWakeel((s) => s.systemDetailId);
  const close = useWakeel((s) => s.closeSystemDetail);
  const userId = useWakeel((s) => s.userId);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<DetailTab>("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
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
    setShareOpen(false);
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
      toast.success(status === "ARCHIVED" ? t.detail.toastArchived : t.detail.toastRestored);
    },
    onError: (err: Error) =>
      toast.error(t.detail.toastUpdErr, { description: err.message }),
  });

  const destroySystem = useMutation({
    mutationFn: () => deleteSystem(systemId!),
    onSuccess: () => {
      invalidateAll();
      close();
      toast.success(t.detail.toastDelOk, {
        description: t.detail.toastDelDesc,
      });
    },
    onError: (err: Error) =>
      toast.error(t.detail.toastDelErr, { description: err.message }),
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
            <DialogTitle className="sr-only">{t.detail.loadingTitle}</DialogTitle>
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
        ) : !system ? (
          // Only a truly missing/unloadable system renders the error card.
          // Cached content stays visible when a background refetch fails
          // (e.g. a cancelled in-flight request resurfacing after a remount).
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <DialogTitle className="sr-only">{t.detail.unavailTitle}</DialogTitle>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-destructive">
              ⚠ {t.detail.unavailTitle}
            </p>
            <p className="text-sm text-muted-foreground">
              {error?.message ?? t.detail.unavailFallback}
            </p>
            <Button variant="ghost" size="sm" onClick={close} className="font-mono text-[11px] uppercase tracking-[0.12em]">
              {t.common.close}
            </Button>
          </div>
        ) : (
          (() => {
            const Icon = systemIcon(system.icon);
            const isArchived = system.status === "ARCHIVED";
            return (
              <div className="flex min-w-0 flex-col gap-5">
                {/* header */}
                <div className="flex items-start gap-3.5 pe-8">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-sm border border-gold/25 bg-gold/5 text-gold">
                    <Icon className="size-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <DialogTitle dir="auto" className="font-display text-xl font-bold tracking-tight">
                        {system.name}
                      </DialogTitle>
                      <OriginBadge origin={system.origin} />
                      <CategoryChip category={system.category} />
                      <StatusDot status={system.status} />
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {system.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShareOpen(true)}
                        className="ms-auto flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                        aria-label={t.share.button}
                      >
                        <Share2 className="size-3" />
                        {t.share.button}
                      </button>
                    </div>
                    {system.description && (
                      <p dir="auto" className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {system.description}
                      </p>
                    )}
                    {system.source && (
                      <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/60" dir="ltr">
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
                  aria-label={t.detail.tablistLabel}
                >
                  <div className="wakeel-scrollbar flex gap-1 overflow-x-auto">
                    {(
                      [
                        { id: "overview", label: t.detail.tabOverview, icon: Table2 },
                        { id: "records", label: t.detail.tabRecords, icon: Table2, count: records.length },
                        { id: "automations", label: t.detail.tabAutomations, icon: Workflow, count: blueprint.automations.length },
                        { id: "analytics", label: t.detail.tabAnalytics, icon: ChartColumn },
                      ] as { id: DetailTab; label: string; icon: typeof Table2; count?: number }[]
                    ).map((tb) => {
                      const count = tb.count !== undefined && tb.count > 0 ? tb.count : undefined;
                      const active = tab === tb.id;
                      return (
                        <button
                          key={tb.id}
                          role="tab"
                          aria-selected={active}
                          onClick={() => setTab(tb.id)}
                          className={cn(
                            "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
                            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold/50",
                            active
                              ? "text-gold"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <tb.icon className="size-3.5" />
                          {tb.label}
                          {count !== undefined && (
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
                          <MonoLabel>{t.detail.pulse}</MonoLabel>
                          <div className="grid gap-3 rounded-lg border border-border bg-secondary/40 p-4 sm:grid-cols-[1fr_auto]">
                            <div className="flex min-w-0 flex-col justify-between gap-3">
                              <div className="flex flex-wrap gap-x-6 gap-y-2">
                                <div className="flex flex-col">
                                  <span className="font-display text-xl font-bold tabular-nums text-foreground">
                                    {records.length}
                                  </span>
                                  <MonoLabel className="text-[9px]">{t.detail.recordsStat}</MonoLabel>
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-mono text-[13px] font-medium text-foreground">
                                    {records.length > 0
                                      ? timeAgo(
                                        records.reduce((a, b) =>
                                          a.updatedAt > b.updatedAt ? a : b
                                        ).updatedAt,
                                        lang
                                      )
                                      : "—"}
                                  </span>
                                  <MonoLabel className="text-[9px]">{t.detail.lastWrite}</MonoLabel>
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-mono text-[13px] font-medium text-foreground">
                                    {blueprint.fields.length || "—"}
                                  </span>
                                  <MonoLabel className="text-[9px]">{t.detail.typedFields}</MonoLabel>
                                </div>
                              </div>
                              <RecordsPulse records={records} />
                            </div>
                            <div
                              className="hidden flex-col items-end justify-center border-s border-border/60 ps-4 sm:flex"
                              aria-hidden
                            >
                              <ChartColumn className="size-5 text-gold/50" />
                            </div>
                          </div>
                        </section>

                        {/* blueprint summary */}
                        <section className="flex flex-col gap-2.5">
                          <MonoLabel>{t.detail.blueprint}</MonoLabel>
                          {blueprint.fields.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              {t.detail.noFields}
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
                              <MonoLabel className="mt-1.5">{t.detail.automations}</MonoLabel>
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
                                  {t.detail.moreAuto(blueprint.automations.length - 3)}
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
                    {t.detail.danger}
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
                        {t.detail.restore}
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
                        {t.detail.archive}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDelete(true)}
                      disabled={destroySystem.isPending}
                      className="h-9 gap-1.5 border border-destructive/40 font-mono text-[10px] uppercase tracking-[0.12em] text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3.5" /> {t.detail.delete}
                    </Button>
                    <span className="ms-auto self-center font-mono text-[10px] text-muted-foreground/60" dir="ltr">
                      {t.detail.created} {timeAgo(system.createdAt, lang)}
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
              {t.detail.delTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.detail.delDesc(system?.name)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-[11px] uppercase tracking-[0.12em]">
              {t.common.cancel}
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
                t.common.delete
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ShareDialog
        systemId={systemId}
        systemName={system?.name ?? ""}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </Dialog>
  );
}

/* ----------------------------- records pulse chart ------------------------- */

/** Tiny gold bar chart: records created per day over the last 14 days. */
function RecordsPulse({ records }: { records: SystemRecordDTO[] }) {
  const t = useT();
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
    <div className="flex flex-col gap-1" dir="ltr">
      <div
        className="flex h-12 items-end gap-[3px]"
        role="img"
        aria-label={t.detail.pulseAria}
      >
        {days.map(([day, n]) => (
          <div
            key={day}
            title={t.detail.pulseTip(day, n)}
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
        <span>{t.detail.d14}</span>
        <span>{t.detail.today}</span>
      </div>
    </div>
  );
}
