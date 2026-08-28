"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ScrollText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, StatusDot, TypeChip, timeAgo } from "@/components/app/bits";
import { MonoLabel } from "@/components/app/motion-bits";
import { getActivity } from "@/lib/api-client";
import type { ActivityType } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";

const LEDGER_ART = `  ┌──────────────────────┐
  │  ░░ LEDGER ░░ EMPTY  │
  │  no actions logged   │
  └──────────────────────┘`;

const FILTER_KEYS = ["ALL", "SCAN", "FORGE", "RECORD", "AUTOMATION", "CHAT", "STATUS", "DELETE"] as const;

export function ActivityView() {
  const t = useT();
  const lang = useWakeel((s) => s.lang);
  const userId = useWakeel((s) => s.userId);
  const [filter, setFilter] = useState<(typeof FILTER_KEYS)[number]>("ALL");

  const { data, isLoading } = useQuery({
    queryKey: ["activity", userId],
    queryFn: () => getActivity(userId!),
    enabled: !!userId,
    refetchInterval: 15_000,
  });

  const activities = data?.activities ?? [];
  const filtered = useMemo(
    () => (filter === "ALL" ? activities : activities.filter((a) => a.type === filter)),
    [activities, filter]
  );

  const availableTypes = useMemo(() => {
    const set = new Set(activities.map((a) => a.type));
    return FILTER_KEYS.filter((f) => f === "ALL" || set.has(f));
  }, [activities]);

  const filterLabel = (f: (typeof FILTER_KEYS)[number]) =>
    f === "ALL" ? t.act.all : f;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <MonoLabel gold>[ {t.act.eyebrow} ]</MonoLabel>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t.act.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t.act.sub}
          </p>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <span className="animate-blink size-1.5 rounded-full bg-live" /> {t.act.live}
        </span>
      </div>

      {/* type filters */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t.act.filterLabel}>
        {availableTypes.map((type) => (
          <button
            key={type}
            role="tab"
            aria-selected={filter === type}
            onClick={() => setFilter(type)}
            className={cn(
              "min-h-11 rounded-full border px-3.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:min-h-0 md:py-1.5",
              filter === type
                ? "border-gold/60 bg-gold/10 text-gold"
                : "border-border bg-card text-muted-foreground hover:border-gold/30 hover:text-foreground"
            )}
          >
            {filterLabel(type)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          art={LEDGER_ART}
          title={filter === "ALL" ? t.act.emptyT : t.act.noEventsT(filterLabel(filter))}
          copy={
            filter === "ALL"
              ? t.act.emptyC
              : t.act.noEventsC
          }
        >
          <ScrollText className="size-4 text-gold" />
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {filtered.map((activity, i) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.4) }}
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-secondary/40",
                i > 0 && "border-t border-border/60"
              )}
            >
              {/* timestamp */}
              <span className="w-16 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/70" dir="ltr">
                {new Date(activity.createdAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <TypeChip type={activity.type} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-foreground">
                  {activity.title}
                </p>
                {activity.detail && (
                  <p className="truncate font-mono text-[11px] text-muted-foreground/70">
                    {activity.detail}
                  </p>
                )}
              </div>
              <StatusDot status={activity.status} className="hidden sm:inline-flex" />
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60" dir="ltr">
                {timeAgo(activity.createdAt, lang)}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
