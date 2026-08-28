"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Boxes,
  CornerDownLeft,
  Database,
  Hammer,
  LayoutDashboard,
  MessageSquare,
  Radar,
  ScrollText,
  Search,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { systemIcon } from "@/components/app/bits";
import { getActivity, getSystems } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";
import type { ConsoleTab } from "@/lib/api-client";

/**
 * OPS-DECK command palette (⌘K / Ctrl+K).
 * Jump to views, open systems, and run quick actions — operator style.
 */
export function CommandPalette() {
  const t = useT();
  const open = useWakeel((s) => s.paletteOpen);
  const setOpen = useWakeel((s) => s.setPaletteOpen);
  const userId = useWakeel((s) => s.userId);
  const setConsoleTab = useWakeel((s) => s.setConsoleTab);
  const openSystemDetail = useWakeel((s) => s.openSystemDetail);
  const toggleAgentDock = useWakeel((s) => s.toggleAgentDock);

  // global hotkey
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!useWakeel.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const { data: systemsData } = useQuery({
    queryKey: ["systems", userId],
    queryFn: () => getSystems(userId!),
    enabled: !!userId && open,
  });
  const { data: activityData } = useQuery({
    queryKey: ["activity", userId],
    queryFn: () => getActivity(userId!),
    enabled: !!userId && open,
  });

  const systems = systemsData?.systems ?? [];
  const activities = (activityData?.activities ?? []).slice(0, 5);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const goTab = (tab: ConsoleTab) => run(() => setConsoleTab(tab));

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      className="border-gold/25 bg-card"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <Search className="size-4 shrink-0 text-gold" />
        <CommandInput
          placeholder={t.palette.searchPh}
          className="border-none bg-transparent font-mono text-[13px] tracking-[0.04em] focus:ring-0"
        />
        <kbd className="shrink-0 rounded-sm border border-border bg-secondary px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          ESC
        </kbd>
      </div>
      <CommandList className="max-h-[420px]">
        <CommandEmpty className="py-8 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {t.palette.noMatches}
        </CommandEmpty>

        <CommandGroup heading={t.palette.views}>
          <CommandItem
            value="overview dashboard home"
            onSelect={() => goTab("overview")}
            className="gap-2.5 font-mono text-[12px]"
          >
            <LayoutDashboard className="size-4 text-muted-foreground" />
            {t.palette.vOverview}
            <CornerDownLeft className="ms-auto size-3 text-muted-foreground/50" />
          </CommandItem>
          <CommandItem
            value="discovery scan recon"
            onSelect={() => goTab("discovery")}
            className="gap-2.5 font-mono text-[12px]"
          >
            <Radar className="size-4 text-muted-foreground" />
            {t.palette.vDiscovery}
            <CornerDownLeft className="ms-auto size-3 text-muted-foreground/50" />
          </CommandItem>
          <CommandItem
            value="systems registry"
            onSelect={() => goTab("systems")}
            className="gap-2.5 font-mono text-[12px]"
          >
            <Database className="size-4 text-muted-foreground" />
            {t.palette.vSystems}
            <CornerDownLeft className="ms-auto size-3 text-muted-foreground/50" />
          </CommandItem>
          <CommandItem
            value="forge create new system build"
            onSelect={() => goTab("forge")}
            className="gap-2.5 font-mono text-[12px]"
          >
            <Hammer className="size-4 text-muted-foreground" />
            {t.palette.vForge}
            <CornerDownLeft className="ms-auto size-3 text-muted-foreground/50" />
          </CommandItem>
          <CommandItem
            value="activity ledger log history"
            onSelect={() => goTab("activity")}
            className="gap-2.5 font-mono text-[12px]"
          >
            <ScrollText className="size-4 text-muted-foreground" />
            {t.palette.vActivity}
            <CornerDownLeft className="ms-auto size-3 text-muted-foreground/50" />
          </CommandItem>
        </CommandGroup>

        {systems.length > 0 && (
          <>
            <CommandSeparator className="bg-border" />
            <CommandGroup heading={t.palette.openSystem}>
              {systems.slice(0, 8).map((system) => {
                const Icon = systemIcon(system.icon);
                const records = system._count?.records ?? system.recordsCount;
                return (
                  <CommandItem
                    key={system.id}
                    value={`${system.name} ${system.category} ${system.origin}`}
                    onSelect={() =>
                      run(() => openSystemDetail(system.id))
                    }
                    className="gap-2.5 font-mono text-[12px]"
                  >
                    <Icon className="size-4 shrink-0 text-gold/70" />
                    <span dir="auto" className="truncate">{system.name}</span>
                    <span className="ms-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60" dir="ltr">
                      {system.origin.slice(0, 4)}
                      {typeof records === "number" ? ` · ${records}R` : ""}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        <CommandSeparator className="bg-border" />
        <CommandGroup heading={t.palette.agent}>
          <CommandItem
            value="agent dock chat wakeel talk"
            onSelect={() =>
              run(() => {
                if (!useWakeel.getState().agentDockOpen) toggleAgentDock();
              })
            }
            className="gap-2.5 font-mono text-[12px]"
          >
            <MessageSquare className="size-4 text-muted-foreground" />
            {t.palette.openDock}
          </CommandItem>
        </CommandGroup>

        {activities.length > 0 && (
          <>
            <CommandSeparator className="bg-border" />
            <CommandGroup heading={t.palette.recent}>
              {activities.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`${a.type} ${a.title}`}
                  onSelect={() => goTab("activity")}
                  className="gap-2.5 font-mono text-[12px]"
                >
                  <Activity className="size-4 shrink-0 text-muted-foreground" />
                  <span dir="auto" className="truncate text-muted-foreground">
                    {a.title}
                  </span>
                  <span className="ms-auto shrink-0 rounded-sm border border-border px-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/60">
                    {a.type}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
      <div className="flex items-center gap-4 border-t border-border px-4 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60">
        <span className="flex items-center gap-1.5">
          <Boxes className="size-3" /> {t.palette.deck}
        </span>
        <span className="ms-auto hidden sm:inline" dir="ltr">
          {t.palette.footerStats(
            systems.length,
            systems.reduce((n, s) => {
              const c = s._count?.records ?? s.recordsCount;
              return n + (typeof c === "number" ? c : 0);
            }, 0)
          )}
        </span>
      </div>
    </CommandDialog>
  );
}
