"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Archive, Boxes, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CategoryChip,
  EmptyState,
  HealthBar,
  OriginBadge,
  StatusDot,
  systemIcon,
} from "@/components/app/bits";
import { MonoLabel } from "@/components/app/motion-bits";
import { getSystems, parseCapabilities, recordCount } from "@/lib/api-client";
import { recCount, useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";

const GRID_ART = `  ┌───┐ ┌───┐ ┌───┐
  │ ▦ │ │ ▦ │ │ ▦ │
  └───┘ └───┘ └───┘
  NO SYSTEMS MAPPED`;

/* --------------------------- keyboard hint chip ---------------------------- */

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] border border-border bg-secondary px-1 font-mono text-[9px] font-medium uppercase text-foreground/80 shadow-[inset_0_-1px_0_0_rgba(245,239,228,0.06)]">
      {children}
    </kbd>
  );
}

export function SystemsView() {
  const t = useT();
  const lang = useWakeel((s) => s.lang);
  const userId = useWakeel((s) => s.userId);
  const openSystemDetail = useWakeel((s) => s.openSystemDetail);
  const setConsoleTab = useWakeel((s) => s.setConsoleTab);

  const { data, isLoading } = useQuery({
    queryKey: ["systems", userId],
    queryFn: () => getSystems(userId!),
    enabled: !!userId,
    refetchInterval: 30_000,
  });

  const systems = data?.systems ?? [];
  const activeCount = systems.filter((s) => s.status === "ACTIVE").length;

  /** keyboard cursor over the registry grid (same model as the records table) */
  const [cursor, setCursor] = useState<number | null>(null);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());

  // keep the cursor valid as systems come and go
  const [prevLen, setPrevLen] = useState(systems.length);
  if (prevLen !== systems.length) {
    setPrevLen(systems.length);
    if (cursor !== null) {
      setCursor(systems.length === 0 ? null : Math.min(cursor, systems.length - 1));
    }
  }

  // follow the cursor with the viewport
  useEffect(() => {
    if (cursor === null) return;
    cardRefs.current.get(cursor)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, [role='combobox'], [role='listbox'], [role='option'], [role='menu']"))
      return;
    if (systems.length === 0) return;
    const key = e.key;
    if (key === "j" || key === "J" || key === "ArrowDown" || key === "ArrowRight") {
      e.preventDefault();
      setCursor((c) => (c === null ? 0 : Math.min(c + 1, systems.length - 1)));
    } else if (key === "k" || key === "K" || key === "ArrowUp" || key === "ArrowLeft") {
      e.preventDefault();
      setCursor((c) => (c === null ? 0 : Math.max(c - 1, 0)));
    } else if ((key === "Enter" || key === "o" || key === "O") && cursor !== null) {
      e.preventDefault();
      openSystemDetail(systems[cursor].id);
    } else if (key === "Escape") {
      setCursor(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <MonoLabel gold>[ {t.sys.eyebrow} ]</MonoLabel>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t.sys.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? t.sys.loading
              : t.sys.statsLine(systems.length, activeCount)}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : systems.length === 0 ? (
        <EmptyState
          art={GRID_ART}
          title={t.sys.emptyT}
          copy={t.sys.emptyC}
        >
          <Button
            onClick={() => setConsoleTab("discovery")}
            size="sm"
            className="bg-primary font-mono text-[10px] uppercase tracking-[0.14em] text-primary-foreground hover:bg-gold-pale"
          >
            <Radar className="size-3.5" /> {t.sys.runDiscovery}
          </Button>
          <Button
            onClick={() => setConsoleTab("forge")}
            size="sm"
            variant="ghost"
            className="border border-border font-mono text-[10px] uppercase tracking-[0.14em]"
          >
            <Boxes className="size-3.5" /> {t.sys.forgeSystem}
          </Button>
        </EmptyState>
      ) : (
        <>
          <div
            tabIndex={0}
            onKeyDown={onGridKeyDown}
            aria-label={t.sys.title}
            className="focus-visible:outline-none"
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {systems.map((system, i) => {
                const Icon = systemIcon(system.icon);
                const count = recordCount(system);
                const capabilities = parseCapabilities(system.capabilities);
                const isArchived = system.status === "ARCHIVED";
                const isCursor = cursor === i;
                return (
                  <motion.button
                    key={system.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(i, el);
                      else cardRefs.current.delete(i);
                    }}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.4,
                      delay: (i % 6) * 0.05,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    whileHover={{ y: -4 }}
                    onClick={() => openSystemDetail(system.id)}
                    onMouseMove={(e) => {
                      // cursor-tracked glow — CSS vars, zero re-renders
                      const r = e.currentTarget.getBoundingClientRect();
                      e.currentTarget.style.setProperty("--gx", `${e.clientX - r.left}px`);
                      e.currentTarget.style.setProperty("--gy", `${e.clientY - r.top}px`);
                    }}
                    data-cursor={isCursor || undefined}
                    className={cn(
                      "group relative flex flex-col gap-3 overflow-hidden rounded-lg border bg-card p-4 text-start transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                      isArchived
                        ? "border-border/60 opacity-60 hover:border-border"
                        : "border-border hover:border-gold/40",
                      // gold rail marks the keyboard cursor
                      isCursor &&
                        "border-gold/50 shadow-[inset_2px_0_0_0_#E8B44A] rtl:shadow-[inset_-2px_0_0_0_#E8B44A]"
                    )}
                  >
                    {/* cursor spotlight inside the card */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      style={{
                        background:
                          "radial-gradient(220px circle at var(--gx, 50%) var(--gy, 50%), rgba(232,180,74,0.09), transparent 62%)",
                      }}
                    />
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-border bg-secondary text-muted-foreground transition-colors group-hover:border-gold/40 group-hover:text-gold">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p dir="auto" className="truncate text-sm font-medium text-foreground">
                        {system.name}
                      </p>
                      <StatusDot status={system.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <CategoryChip category={system.category} />
                      <OriginBadge origin={system.origin} />
                    </div>
                  </div>
                </div>

                {system.description && (
                  <p className="line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                    {system.description}
                  </p>
                )}

                <div className="mt-auto flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <HealthBar value={system.health} className="flex-1" />
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground" dir="ltr">
                      {system.health}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70">
                    <span dir="ltr">
                      {count != null
                        ? recCount(count, lang)
                        : t.sys.capabilities(capabilities.length)}
                    </span>
                    {isArchived && (
                      <span className="flex items-center gap-1">
                        <Archive className="size-3" /> {t.sys.archived}
                      </span>
                    )}
                  </div>
                </div>
              </motion.button>
                );
              })}
            </div>
          </div>
          {/* keyboard hints — same power-user model as the records table */}
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60"
            aria-hidden
          >
            <span className="flex items-center gap-1">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd> {t.sys.kbdNav}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> {t.sys.kbdOpen}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd> {t.recs.kbdClear}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
