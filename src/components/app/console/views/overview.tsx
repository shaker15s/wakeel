"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, Hammer, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CategoryChip,
  EmptyState,
  HealthBar,
  OriginBadge,
  SparkBars,
  systemIcon,
  timeAgo,
  TypeChip,
} from "@/components/app/bits";
import { CountUp, MonoLabel } from "@/components/app/motion-bits";
import { getActivity, getSystems, getUser, recordCount } from "@/lib/api-client";
import { recCount, useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";

const RADAR_ART = `   · · · · · · ·
 ·   ╭───────╮   ·
  ·  │  و  ○ │  ·
 ·   ╰───────╯   ·
   · · · · · · ·`;

function greetingFor(hour: number, t: ReturnType<typeof useT>): string {
  if (hour < 5) return t.ov.greetNight;
  if (hour < 12) return t.ov.greetMorning;
  if (hour < 18) return t.ov.greetAfternoon;
  return t.ov.greetEvening;
}

export function OverviewView() {
  const t = useT();
  const lang = useWakeel((s) => s.lang);
  const userId = useWakeel((s) => s.userId);
  const setConsoleTab = useWakeel((s) => s.setConsoleTab);
  const openSystemDetail = useWakeel((s) => s.openSystemDetail);

  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => getUser(userId!),
    enabled: !!userId,
    refetchInterval: 30_000,
  });
  const { data: systemsData, isLoading: systemsLoading } = useQuery({
    queryKey: ["systems", userId],
    queryFn: () => getSystems(userId!),
    enabled: !!userId,
    refetchInterval: 30_000,
  });
  const { data: activityData } = useQuery({
    queryKey: ["activity", userId],
    queryFn: () => getActivity(userId!),
    enabled: !!userId,
    refetchInterval: 15_000,
  });

  const user = userData?.user;
  const stats = userData?.stats;
  const systems = systemsData?.systems ?? [];
  const activities = activityData?.activities ?? [];

  const hour = new Date().getHours();
  const firstName = user?.name.split(" ")[0] ?? t.ov.operatorFallback;
  const dateLabel = new Date()
    .toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });

  const statCards = [
    { label: t.ov.statSystems, value: stats?.systems ?? 0, seed: 3 },
    { label: t.ov.statRecords, value: stats?.records ?? 0, seed: 7 },
    { label: t.ov.statScans, value: stats?.scans ?? 0, seed: 11 },
    { label: t.ov.statActions, value: activities.length, seed: 5 },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex flex-col gap-1.5">
        <MonoLabel gold>
          [ <span dir="auto">{dateLabel}</span> · {t.ov.consoleTag} ]
        </MonoLabel>
        {/* bdi isolates Latin operator names inside the RTL sentence so the
            trailing punctuation stays on the correct side of the name */}
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {greetingFor(hour, t)}
          {lang === "ar" ? "،" : ","} <bdi>{firstName}</bdi>
          {lang === "ar" ? "\u200F." : "."}
        </h1>
        <p className="text-sm text-muted-foreground">
          {stats && stats.systems > 0
            ? t.ov.subWith(stats.systems, stats.records, user?.workspace ?? t.ov.wsFallback)
            : t.ov.subEmpty}
        </p>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.07, ease: "easeOut" }}
            className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-2">
              {userLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <CountUp
                  value={card.value}
                  className="font-display text-3xl font-bold text-foreground"
                />
              )}
              <SparkBars seed={card.seed} bars={8} className="h-7" />
            </div>
            <MonoLabel>{card.label}</MonoLabel>
          </motion.div>
        ))}
      </div>

      {/* quick actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => setConsoleTab("discovery")}
          className="h-11 bg-primary font-mono text-[11px] uppercase tracking-[0.14em] text-primary-foreground hover:bg-gold-pale"
        >
          <Radar className="size-4" /> {t.ov.runDiscovery}
        </Button>
        <Button
          onClick={() => setConsoleTab("forge")}
          variant="ghost"
          className="h-11 border border-border font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Hammer className="size-4" /> {t.ov.forgeNew}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* systems mini-grid */}
        <section className="flex flex-col gap-3 xl:col-span-2" aria-label={t.ov.recentSystemsLabel}>
          <div className="flex items-center justify-between">
            <MonoLabel>{t.ov.latest}</MonoLabel>
            {systems.length > 0 && (
              <button
                onClick={() => setConsoleTab("systems")}
                className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-gold transition-colors hover:text-gold-pale focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                {t.ov.allSystems} <ArrowRight className="size-3 rtl:-scale-x-100" />
              </button>
            )}
          </div>

          {systemsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : systems.length === 0 ? (
            <EmptyState
              art={RADAR_ART}
              title={t.ov.noSystemsT}
              copy={t.ov.noSystemsC}
            >
              <Button
                onClick={() => setConsoleTab("discovery")}
                size="sm"
                className="bg-primary font-mono text-[10px] uppercase tracking-[0.14em] text-primary-foreground hover:bg-gold-pale"
              >
                <Radar className="size-3.5" /> {t.ov.runDiscoverySm}
              </Button>
              <Button
                onClick={() => setConsoleTab("forge")}
                size="sm"
                variant="ghost"
                className="border border-border font-mono text-[10px] uppercase tracking-[0.14em]"
              >
                <Hammer className="size-3.5" /> {t.ov.forgeSm}
              </Button>
            </EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {systems.slice(0, 4).map((system, i) => {
                const Icon = systemIcon(system.icon);
                const count = recordCount(system);
                return (
                  <motion.button
                    key={system.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.06 }}
                    whileHover={{ y: -4 }}
                    onClick={() => openSystemDetail(system.id)}
                    className="group flex flex-col gap-2.5 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-gold/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-secondary text-muted-foreground transition-colors group-hover:border-gold/40 group-hover:text-gold">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p dir="auto" className="truncate text-sm font-medium text-foreground">
                          {system.name}
                        </p>
                        <MonoLabel className="text-[9px]">{system.category}</MonoLabel>
                      </div>
                      <OriginBadge origin={system.origin} />
                    </div>
                    <div className="flex items-center gap-2">
                      <HealthBar value={system.health} className="flex-1" />
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground" dir="ltr">
                        {count != null ? recCount(count, lang) : `${system.health}%`}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </section>

        {/* recent activity feed */}
        <section className="flex flex-col gap-3" aria-label={t.ov.recentActivityLabel}>
          <div className="flex items-center justify-between">
            <MonoLabel>{t.ov.recentActivity}</MonoLabel>
            {activities.length > 0 && (
              <button
                onClick={() => setConsoleTab("activity")}
                className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-gold transition-colors hover:text-gold-pale focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                {t.ov.fullLedger} <ArrowRight className="size-3 rtl:-scale-x-100" />
              </button>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-2">
            {activities.length === 0 ? (
              <p className="px-3 py-8 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {t.ov.ledgerEmpty}
              </p>
            ) : (
              <ul className="flex flex-col">
                {activities.slice(0, 8).map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2.5 border-b border-border/60 px-2 py-2.5 last:border-0"
                  >
                    <TypeChip type={a.type} />
                    <span dir="auto" className="min-w-0 flex-1 truncate text-[13px] text-foreground/90">
                      {a.title}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground" dir="ltr">
                      {timeAgo(a.createdAt, lang)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
