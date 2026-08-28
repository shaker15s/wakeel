"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { EmptyState } from "@/components/app/bits";
import { MonoLabel } from "@/components/app/motion-bits";
import { parseRecordData } from "@/lib/api-client";
import type { BlueprintField, SystemRecordDTO } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const EMPTY_ART = `  ┌───────────────────────┐
  │ ░ NO DATA ░ TO CHART  │
  │ add records to see    │
  │ analytics come alive  │
  └───────────────────────┘`;

const DAY_MS = 86_400_000;

/* ------------------------------ stat sub-card ------------------------------ */

function StatBlock({
  value,
  label,
  tone = "default",
}: {
  value: string;
  label: string;
  tone?: "default" | "up" | "down";
}) {
  return (
    <div className="flex min-w-[86px] flex-col gap-0.5">
      <span
        className={cn(
          "flex items-center gap-1 font-display text-xl font-bold tabular-nums",
          tone === "up" && "text-live",
          tone === "down" && "text-destructive",
          tone === "default" && "text-foreground"
        )}
      >
        {value}
      </span>
      <MonoLabel className="text-[9px]">{label}</MonoLabel>
    </div>
  );
}

/* -------------------------------- main tab --------------------------------- */

export function AnalyticsTab({
  systemName,
  records,
  columns,
}: {
  systemName: string;
  records: SystemRecordDTO[];
  columns: BlueprintField[];
}) {
  const analytics = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // 30-day daily buckets
    const buckets: { key: string; label: string; count: number }[] = [];
    const bucketMap = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * DAY_MS);
      const key = d.toISOString().slice(0, 10);
      bucketMap.set(key, 0);
      buckets.push({
        key,
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        count: 0,
      });
    }
    for (const rec of records) {
      const key = new Date(rec.createdAt).toISOString().slice(0, 10);
      if (bucketMap.has(key)) bucketMap.set(key, (bucketMap.get(key) ?? 0) + 1);
    }
    for (const b of buckets) b.count = bucketMap.get(b.key) ?? 0;

    // cadence: last 7 days vs previous 7
    let last7 = 0;
    let prev7 = 0;
    for (const rec of records) {
      const age = now - new Date(rec.createdAt).getTime();
      if (age <= 7 * DAY_MS) last7 += 1;
      else if (age <= 14 * DAY_MS) prev7 += 1;
    }
    const delta =
      prev7 === 0 ? (last7 > 0 ? 100 : 0) : Math.round(((last7 - prev7) / prev7) * 100);

    // field completion rates
    const fieldStats = columns.map((c) => {
      let filled = 0;
      for (const rec of records) {
        const v = parseRecordData(rec.data)[c.key];
        if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
          filled += 1;
        }
      }
      return { ...c, filled, pct: records.length ? Math.round((filled / records.length) * 100) : 0 };
    });

    // categorical distribution: first select/enum field with options, else first boolean
    const catField =
      columns.find(
        (c) => (c.type === "select" || c.type === "enum") && c.options?.length
      ) ?? columns.find((c) => c.type === "boolean" || c.type === "bool");
    let distribution: { value: string; count: number }[] = [];
    if (catField) {
      const counts = new Map<string, number>();
      for (const rec of records) {
        const v = parseRecordData(rec.data)[catField.key];
        if (v === null || v === undefined || v === "") continue;
        const key = typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      distribution = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
    }

    const oldest = records.reduce<Date | null>(
      (acc, r) => {
        const d = new Date(r.createdAt);
        return !acc || d < acc ? d : acc;
      },
      null
    );

    return {
      buckets,
      max: Math.max(1, ...buckets.map((b) => b.count)),
      last7,
      prev7,
      delta,
      fieldStats,
      catField,
      distribution,
      oldest,
      totalWrites: records.length,
    };
  }, [records, columns]);

  if (records.length === 0) {
    return (
      <section className="flex flex-col gap-2.5">
        <MonoLabel>ANALYTICS</MonoLabel>
        <EmptyState
          art={EMPTY_ART}
          title="NOT ENOUGH DATA"
          copy={`Analytics come alive once ${systemName} has records. Add a few from the RECORDS tab.`}
          className="py-8"
        />
      </section>
    );
  }

  const DistIcon =
    analytics.delta > 0 ? ArrowUpRight : analytics.delta < 0 ? ArrowDownRight : Minus;

  return (
    <section className="flex min-w-0 flex-col gap-5">
      {/* cadence stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBlock value={String(records.length)} label="TOTAL RECORDS" />
        <StatBlock value={String(analytics.last7)} label="WRITTEN · 7D" />
        <div className="flex min-w-[86px] flex-col gap-0.5">
          <span
            className={cn(
              "flex items-center gap-1 font-display text-xl font-bold tabular-nums",
              analytics.delta > 0 && "text-live",
              analytics.delta < 0 && "text-destructive",
              analytics.delta === 0 && "text-foreground"
            )}
          >
            <DistIcon className="size-4" />
            {analytics.delta > 0 ? "+" : ""}
            {analytics.delta}%
          </span>
          <MonoLabel className="text-[9px]">7D VS PRIOR</MonoLabel>
        </div>
        <StatBlock
          value={analytics.oldest ? `${Math.max(1, Math.ceil((Date.now() - analytics.oldest.getTime()) / DAY_MS))}D` : "—"}
          label="OLDEST RECORD"
        />
      </div>

      {/* 30-day write volume */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <MonoLabel>WRITE VOLUME · LAST 30 DAYS</MonoLabel>
          <span className="font-mono text-[10px] text-muted-foreground/60">
            PEAK {analytics.max}/DAY
          </span>
        </div>
        <div className="rounded-lg border border-border bg-secondary/40 p-4">
          <div
            className="flex h-24 items-end gap-[2px]"
            role="img"
            aria-label="Records created per day over the last 30 days"
          >
            {analytics.buckets.map((b, i) => (
              <div
                key={b.key}
                title={`${b.label} · ${b.count} record${b.count === 1 ? "" : "s"}`}
                className="group relative flex-1 rounded-t-[2px] transition-colors"
                style={{ height: `${Math.max(6, (b.count / analytics.max) * 100)}%` }}
              >
                <div
                  className={cn(
                    "absolute inset-0 rounded-t-[2px] transition-colors",
                    b.count > 0
                      ? "bg-gold/70 group-hover:bg-gold"
                      : "bg-foreground/10 group-hover:bg-foreground/20"
                  )}
                />
                {i === analytics.buckets.length - 1 && b.count > 0 && (
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] text-gold">
                    TODAY
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/50">
            <span>{analytics.buckets[0]?.label}</span>
            <span>{analytics.buckets[analytics.buckets.length - 1]?.label}</span>
          </div>
        </div>
      </div>

      {/* field completion rates */}
      {analytics.fieldStats.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <MonoLabel>FIELD COMPLETION</MonoLabel>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/40 p-4">
            {analytics.fieldStats.map((f, i) => (
              <motion.div
                key={f.key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3"
              >
                <span className="w-28 shrink-0 truncate text-[12px] text-foreground/85" title={f.label}>
                  {f.label}
                </span>
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${f.pct}%` }}
                    transition={{ delay: 0.1 + i * 0.04, duration: 0.5, ease: "easeOut" }}
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full",
                      f.pct >= 80
                        ? "bg-live"
                        : f.pct >= 40
                          ? "bg-gold"
                          : "bg-gold-deep"
                    )}
                  />
                </div>
                <span className="w-16 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                  {f.filled}/{records.length} · {f.pct}%
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* categorical distribution */}
      {analytics.catField && analytics.distribution.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <MonoLabel>DISTRIBUTION · {analytics.catField.label.toUpperCase()}</MonoLabel>
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {analytics.distribution.length} VALUE{analytics.distribution.length === 1 ? "" : "S"}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-secondary/40 p-4">
            {analytics.distribution.map((d, i) => {
              const pct = Math.round((d.count / records.length) * 100);
              return (
                <div key={d.value} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate font-mono text-[11px] text-foreground/85" title={d.value}>
                    {d.value}
                  </span>
                  <div className="h-4 flex-1 overflow-hidden rounded-sm bg-foreground/5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(pct, 4)}%` }}
                      transition={{ delay: 0.15 + i * 0.05, duration: 0.5, ease: "easeOut" }}
                      className="flex h-full items-center justify-end rounded-sm bg-gold/25 pr-1.5"
                    >
                      <span className="font-mono text-[9px] font-medium text-gold-pale">
                        {pct}%
                      </span>
                    </motion.div>
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                    {d.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
