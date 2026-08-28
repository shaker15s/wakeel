"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Radar, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  CategoryChip,
  ConfidenceRing,
  EmptyState,
  HealthBar,
  systemIcon,
  timeAgo,
} from "@/components/app/bits";
import { MonoLabel } from "@/components/app/motion-bits";
import {
  getScans,
  parseCapabilities,
  parseScanSummary,
  runScan,
} from "@/lib/api-client";
import type { AiSystem } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";

const RADAR_ART = `      ·  ·  ·  ·  ·
   ·    ╭─────╮    ·
       ╭┼─────┼╭─┐
 ·  ·  │  ⊙→  │  ·  ·
       ╰┼─────┼╰─┘
   ·    ╰─────╯    ·
      ·  ·  ·  ·  ·`;

/** Sequential mono status lines while a scan runs. */
function ScanProgress({ stages }: { stages: string[] }) {
  return (
    <div className="flex items-start gap-5 rounded-lg border border-border bg-card p-5">
      {/* radar sweep circle */}
      <div className="relative size-20 shrink-0" aria-hidden>
        <span className="absolute inset-0 rounded-full border border-gold/30" />
        <span className="absolute inset-2.5 rounded-full border border-gold/20" />
        <span className="absolute inset-[38%] rounded-full bg-gold shadow-[0_0_12px_rgba(232,180,74,0.9)]" />
        <span
          className="animate-radar absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, rgba(232,180,74,0.5), transparent 80deg)",
          }}
        />
      </div>
      <ul className="flex flex-col gap-1.5 pt-1">
        {stages.map((stage, i) => (
          <motion.li
            key={stage}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
              "font-mono text-[12px] tracking-[0.06em] rtl:font-arabic",
              i === stages.length - 1 ? "text-gold" : "text-muted-foreground"
            )}
          >
            <span className="me-2 text-live">▸</span>
            {stage}
            {i === stages.length - 1 && (
              <span className="animate-blink ms-1 text-gold">▌</span>
            )}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function DetectedSystemCard({ system, index }: { system: AiSystem; index: number }) {
  const t = useT();
  const Icon = systemIcon(system.icon);
  const capabilities = parseCapabilities(system.capabilities).slice(0, 3);
  const confidence = system.confidence ?? system.health ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-gold/25 bg-gold/5 text-gold">
            {/* eslint-disable-next-line react-hooks/static-components -- existing lucide icon reference, not a render-created component */}
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {system.name}
            </p>
            <CategoryChip category={system.category} className="mt-1" />
          </div>
        </div>
        <ConfidenceRing value={confidence} />
      </div>

      {system.description && (
        <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
          {system.description}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <MonoLabel className="text-[9px]">{t.disc.health}</MonoLabel>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground" dir="ltr">
            {system.health}%
          </span>
        </div>
        <HealthBar value={system.health} />
      </div>

      {capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {capabilities.map((cap) => (
            <span
              key={cap}
              className="rounded-sm border border-border bg-secondary px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground"
            >
              {cap}
            </span>
          ))}
        </div>
      )}

      {system.source && (
        <p className="truncate font-mono text-[10px] text-muted-foreground/60" dir="ltr">
          SRC · {system.source}
        </p>
      )}
    </motion.div>
  );
}

export function DiscoveryView() {
  const t = useT();
  const lang = useWakeel((s) => s.lang);
  const userId = useWakeel((s) => s.userId);
  const lastScan = useWakeel((s) => s.lastScan);
  const setLastScan = useWakeel((s) => s.setLastScan);
  const queryClient = useQueryClient();

  const [target, setTarget] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stageCount, setStageCount] = useState(0);

  const { data: scansData } = useQuery({
    queryKey: ["scans", userId],
    queryFn: () => getScans(userId!),
    enabled: !!userId,
    refetchInterval: 20_000,
  });
  const scans = scansData?.scans ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      runScan({ userId: userId!, target: target.trim(), notes: notes.trim() || undefined }),
    onSuccess: (data) => {
      const summary = parseScanSummary(
        data.scan?.result,
        t.disc.fallbackSummary(data.systems.length, data.scan?.target ?? target)
      );
      setLastScan({
        target: data.scan?.target ?? target,
        summary,
        systems: data.systems ?? [],
      });
      queryClient.invalidateQueries({ queryKey: ["systems", userId] });
      queryClient.invalidateQueries({ queryKey: ["scans", userId] });
      queryClient.invalidateQueries({ queryKey: ["activity", userId] });
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
      toast.success(t.disc.toastOk, {
        description: t.disc.toastOkDesc(data.systems.length, data.scan?.target ?? target),
      });
      setTarget("");
      setNotes("");
    },
    onError: (err: Error) => {
      toast.error(t.disc.toastErr, { description: err.message });
    },
  });

  // advance the mono pipeline stages while the real request is in flight
  // (submit() seeds stage 1; the interval — an external timer — advances the rest)
  useEffect(() => {
    if (!mutation.isPending) return;
    const SCAN_STAGES = [t.disc.stage1, t.disc.stage2, t.disc.stage3, t.disc.stage4, t.disc.stage5];
    const timer = setInterval(() => {
      setStageCount((c) => Math.min(c + 1, SCAN_STAGES.length));
    }, 1400);
    return () => clearInterval(timer);
  }, [mutation.isPending, t]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim()) {
      setError(t.disc.errTarget);
      return;
    }
    setError(null);
    setStageCount(1);
    mutation.mutate();
  };

  const scanStages = [t.disc.stage1, t.disc.stage2, t.disc.stage3, t.disc.stage4, t.disc.stage5];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <MonoLabel gold>[ {t.disc.eyebrow} ]</MonoLabel>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {t.disc.title}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t.disc.sub}
        </p>
      </div>

      {/* scan form */}
      <form
        onSubmit={submit}
        noValidate
        className="corner-frame flex flex-col gap-4 border border-border bg-card p-5"
      >
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="scan-target"
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
          >
            {t.disc.target}
          </Label>
          <Input
            id="scan-target"
            placeholder={t.disc.targetPh}
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={!!error}
            disabled={mutation.isPending}
            className="h-10 min-h-11 border-border bg-secondary/60 focus-visible:ring-gold/50 md:min-h-0"
          />
          {error && (
            <p className="font-mono text-[11px] text-destructive">⚠ {error}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="scan-notes"
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
          >
            {t.disc.notes}
          </Label>
          <Textarea
            id="scan-notes"
            placeholder={t.disc.notesPh}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={mutation.isPending}
            rows={3}
            className="resize-none border-border bg-secondary/60 focus-visible:ring-gold/50"
          />
        </div>

        <Button
          type="submit"
          disabled={mutation.isPending}
          className="h-11 bg-primary font-mono text-[11px] uppercase tracking-[0.14em] text-primary-foreground hover:bg-gold-pale"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="animate-spin" /> {t.disc.scanning}
            </>
          ) : (
            <>
              <Radar className="size-4" /> {t.disc.runScan}
            </>
          )}
        </Button>
      </form>

      {/* in-flight pipeline */}
      {mutation.isPending && <ScanProgress stages={scanStages.slice(0, stageCount)} />}

      {/* error inline */}
      {mutation.isError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-destructive">
            {t.disc.errTitle}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {mutation.error.message}
          </p>
        </div>
      )}

      {/* results */}
      <AnimatePresence>
        {lastScan && !mutation.isPending && (
          <motion.section
            key={`${lastScan.target}-${lastScan.systems.length}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-4"
            aria-label={t.disc.resultsLabel}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[12px] text-gold">
                {"// "}{lastScan.summary}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLastScan(null)}
                className="h-8 gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="size-3" /> {t.disc.clear}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {lastScan.systems.map((system, i) => (
                <DetectedSystemCard key={system.id} system={system} index={i} />
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* empty state */}
      {!lastScan && !mutation.isPending && scans.length === 0 && (
        <EmptyState
          art={RADAR_ART}
          title={t.disc.noScansT}
          copy={t.disc.noScansC}
        />
      )}

      {/* scan history */}
      {scans.length > 0 && (
        <section className="flex flex-col gap-3" aria-label={t.disc.historyLabel}>
          <MonoLabel>{t.disc.history}</MonoLabel>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {scans.map((scan, i) => (
              <div
                key={scan.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3",
                  i > 0 && "border-t border-border/60"
                )}
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">
                  {scan.target}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {scan.systemsFound} {t.disc.found}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground" dir="ltr">
                  {timeAgo(scan.createdAt, lang)}
                </span>
                <span
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em]",
                    scan.status === "COMPLETE" &&
                      "bg-live/10 text-live",
                    scan.status === "RUNNING" && "bg-gold/10 text-gold animate-blink",
                    scan.status === "FAILED" && "bg-destructive/10 text-destructive"
                  )}
                >
                  {scan.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
