"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, Clock3, Database, Workflow, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CategoryChip,
  EmptyState,
  HealthBar,
  OriginBadge,
  systemIcon,
  timeAgo,
} from "@/components/app/bits";
import { CountUp, MonoLabel } from "@/components/app/motion-bits";
import { getSharedSystem } from "@/lib/api-client";
import type { SharedSystemPayload } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Public read-only view for a shared system, reached via `/#share=<token>`.
 * Mirrors the OPS-DECK console language but strips every mutation surface —
 * it is a glass case, not a cockpit.
 */
export function SharedSystemView({ token }: { token: string }) {
  const t = useT();

  const goHome = () => {
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      /* noop */
    }
    window.location.href = "/";
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["shared", token],
    queryFn: () => getSharedSystem(token),
    retry: false,
    refetchInterval: 30_000, // the snapshot stays live for viewers
  });

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <button
            onClick={goHome}
            className="group flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            aria-label="WAKEEL"
          >
            <span className="flex size-7 items-center justify-center rounded-sm border border-gold/30 bg-gold/10 font-display text-sm font-bold text-gold">
              و
            </span>
            <span className="font-display text-sm font-bold tracking-wide text-foreground transition-colors group-hover:text-gold">
              WAKEEL
            </span>
            <span className="font-arabic text-xs text-muted-foreground">وكيل</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-sm border border-gold/25 bg-gold/5 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-gold sm:flex">
              <ShieldCheck className="size-3" />
              {t.share.pubEyebrow}
            </span>
            <Button
              size="sm"
              onClick={goHome}
              className="h-8 bg-gold font-mono text-[10px] uppercase tracking-[0.12em] text-[#0A0908] hover:bg-gold-pale"
            >
              {t.share.pubCta}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {isLoading ? (
          <ShareSkeleton />
        ) : isError || !data ? (
          <EmptyState
            art={t.share.notFoundArt}
            title={t.share.notFoundTitle}
            copy={t.share.notFoundCopy}
            className="border-gold/15"
          >
            <Button
              onClick={goHome}
              className="bg-gold font-mono text-[11px] uppercase tracking-[0.12em] text-[#0A0908] hover:bg-gold-pale"
            >
              {t.share.pubCta}
            </Button>
          </EmptyState>
        ) : (
          <SharedSnapshot data={data} />
        )}
      </main>

      {/* sticky footer */}
      <footer className="mt-auto border-t border-border/80 bg-card/40">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 sm:flex-row sm:px-6">
          <p className="max-w-md text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground sm:text-start">
            {t.share.pubFooter}
          </p>
          <button
            onClick={goHome}
            className="group flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-gold transition-colors hover:text-gold-pale focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {t.share.backToSite}
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
          </button>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------- the snapshot ------------------------------ */

function SharedSnapshot({ data }: { data: SharedSystemPayload }) {
  const t = useT();
  const lang = useWakeel((s) => s.lang);
  const sys = data.system;
  const Icon = systemIcon(sys.icon);
  const fields = sys.blueprint.fields ?? [];
  const records = data.records;
  const automations = sys.blueprint.automations ?? [];

  // mini pulse: records per day over the last 14 days
  const pulse = buildPulse(records);

  return (
    <div className="flex flex-col gap-8">
      {/* hero */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative overflow-hidden rounded-xl border border-gold/15 bg-card p-6 sm:p-8"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(232,180,74,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(232,180,74,0.05) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative flex flex-col gap-5">
          <MonoLabel gold>[ {t.share.pubEyebrow} ]</MonoLabel>
          <div className="flex flex-wrap items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
              {/* eslint-disable-next-line react-hooks/static-components -- existing lucide icon reference, not a render-created component */}
              <Icon className="size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <h1
                dir="auto"
                className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
              >
                {sys.name}
              </h1>
              <p dir="auto" className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {sys.description}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <OriginBadge origin={sys.origin as "DISCOVERED" | "CREATED"} />
                <CategoryChip category={sys.category} />
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <Clock3 className="size-3" />
                  {t.share.pubBy(data.workspace)}
                </span>
              </div>
            </div>
          </div>

          {/* stat row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ShareStat label={t.share.statRecords} value={records.length} />
            <ShareStat label={t.share.statFields} value={fields.length} />
            <ShareStat label={t.share.statAutomations} value={automations.length} />
            <div className="rounded-lg border border-border bg-secondary/40 p-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                {t.share.statSince}
              </p>
              <p className="mt-1 truncate font-mono text-[11px] text-foreground/90" title={new Date(sys.createdAt).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}>
                {new Date(sys.createdAt).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* pulse */}
      <ShareSection label={t.share.pubPulse} icon={<Database className="size-3.5" />}>
        <PulseBars pulse={pulse} />
      </ShareSection>

      {/* schema */}
      {fields.length > 0 && (
        <ShareSection label={t.share.pubSchema} icon={<Database className="size-3.5" />}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {fields.map((f, i) => (
              <motion.div
                key={f.key + i}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.3) }}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p dir="auto" className="truncate text-[13px] font-medium text-foreground">
                    {f.label}
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground/70" dir="ltr">
                    {f.key}
                  </p>
                </div>
                <span className="shrink-0 rounded-sm border border-gold/25 bg-gold/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-gold">
                  {f.type}
                </span>
              </motion.div>
            ))}
          </div>
        </ShareSection>
      )}

      {/* live records */}
      <ShareSection
        label={`${t.share.pubRecords} · ${records.length}`}
        icon={<Database className="size-3.5" />}
      >
        {records.length === 0 ? (
          <EmptyState title={t.recs.noRecordsT} copy={t.recs.noRecordsC} />
        ) : (
          <RecordGlass data={data} />
        )}
      </ShareSection>

      {/* automations */}
      {automations.length > 0 && (
        <ShareSection label={t.share.pubAutomations} icon={<Workflow className="size-3.5" />}>
          <ol className="flex flex-col">
            {automations.map((a, i) => (
              <li
                key={i}
                className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0"
              >
                <span className="font-mono text-[10px] tabular-nums text-gold/70">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p dir="auto" className="min-w-0 flex-1 truncate text-[13px] text-foreground/90">
                  {a}
                </p>
                <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                  AUTO
                </span>
              </li>
            ))}
          </ol>
        </ShareSection>
      )}
    </div>
  );
}

/** Read-only records table (first 6 fields to keep the glass case tidy). */
function RecordGlass({ data }: { data: SharedSystemPayload }) {
  const t = useT();
  const lang = useWakeel((s) => s.lang);
  const fields = (data.system.blueprint.fields ?? []).slice(0, 6);
  const records = data.records;

  const value = (raw: string, key: string): string => {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const v = obj[key];
      if (v == null) return "—";
      if (typeof v === "boolean") return v ? "✓" : "✗";
      return String(v);
    } catch {
      return "—";
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[480px] text-start">
        <thead>
          <tr className="border-b border-border bg-secondary/50">
            {fields.map((f) => (
              <th
                key={f.key}
                className="px-3.5 py-2.5 text-start font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
              >
                {f.label}
              </th>
            ))}
            <th className="px-3.5 py-2.5 text-start font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t.share.pubWritten}
            </th>
          </tr>
        </thead>
        <tbody>
          {records.slice(0, 25).map((r, i) => {
            let obj: Record<string, unknown> = {};
            try {
              obj = JSON.parse(r.data) as Record<string, unknown>;
            } catch {
              /* noop */
            }
            return (
              <tr
                key={i}
                className="border-b border-border/50 transition-colors last:border-0 hover:bg-secondary/30"
              >
                {fields.map((f) => (
                  <td
                    key={f.key}
                    dir="auto"
                    className="max-w-[200px] truncate px-3.5 py-2.5 text-[13px] text-foreground/90"
                  >
                    {value(r.data, f.key)}
                  </td>
                ))}
                <td
                  className="whitespace-nowrap px-3.5 py-2.5 font-mono text-[10px] text-muted-foreground/70"
                  dir="ltr"
                >
                  {timeAgo(r.createdAt, lang)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {records.length > 25 && (
        <p className="border-t border-border/60 bg-secondary/30 px-3.5 py-2 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          +{records.length - 25}
        </p>
      )}
    </div>
  );
}

/* --------------------------------- pieces --------------------------------- */

function ShareStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">
        <CountUp value={value} />
      </p>
    </div>
  );
}

function ShareSection({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        {icon}
        <MonoLabel>{label}</MonoLabel>
        <span className="h-px flex-1 bg-border/70" />
      </div>
      {children}
    </motion.section>
  );
}

/** 14 buckets of daily counts, oldest → newest. */
function buildPulse(records: { createdAt: string }[]): number[] {
  const days = 14;
  const buckets = new Array(days).fill(0) as number[];
  const now = new Date();
  for (const r of records) {
    const d = new Date(r.createdAt);
    const diff = Math.floor(
      (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
        new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
        86_400_000
    );
    if (diff >= 0 && diff < days) buckets[days - 1 - diff] += 1;
  }
  return buckets;
}

function PulseBars({ pulse }: { pulse: number[] }) {
  const max = Math.max(...pulse, 1);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex h-24 items-end gap-1.5" aria-hidden>
        {pulse.map((v, i) => (
          <motion.div
            key={i}
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.03 }}
            style={{ height: `${v === 0 ? 4 : Math.max((v / max) * 100, 8)}%` }}
            className={cn(
              "flex-1 origin-bottom rounded-t-sm",
              i === pulse.length - 1
                ? "bg-gold shadow-[0_0_12px_rgba(232,180,74,0.4)]"
                : v > 0
                  ? "bg-gold/55"
                  : "bg-border/70"
            )}
            title={`${v}`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/60">
        <span>D-14</span>
        <span>TODAY</span>
      </div>
    </div>
  );
}

function ShareSkeleton() {
  const t = useT();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-center gap-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-gold/70">
        <span className="inline-block size-1.5 animate-pulse rounded-full bg-gold" />
        {t.share.loading}
      </div>
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start gap-4">
          <Skeleton className="size-14 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <Skeleton className="h-7 w-2/3 max-w-xs" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-1/2 max-w-[220px]" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px] rounded-lg" />
          ))}
        </div>
      </div>
      <Skeleton className="h-36 rounded-lg" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
