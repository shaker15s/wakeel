"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, LogOut, Search } from "lucide-react";
import { toast } from "sonner";
import { WakeelMark } from "@/components/app/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initialsOf } from "@/components/app/bits";
import { LangToggle } from "@/components/app/lang-toggle";
import { getSystems, getUser } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // schedule first paint asynchronously (setState inside a callback,
    // not synchronously in the effect body)
    const raf = requestAnimationFrame(() => setNow(new Date()));
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, []);
  return (
    <span className="font-mono text-[11px] tabular-nums tracking-[0.1em] text-muted-foreground" dir="ltr">
      {now
        ? now.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "--:--:--"}
    </span>
  );
}

export function StatusBar() {
  const t = useT();
  const userId = useWakeel((s) => s.userId);
  const agentDockOpen = useWakeel((s) => s.agentDockOpen);
  const toggleAgentDock = useWakeel((s) => s.toggleAgentDock);
  const setPaletteOpen = useWakeel((s) => s.setPaletteOpen);
  const switchOperator = useWakeel((s) => s.switchOperator);

  const { data } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => getUser(userId!),
    enabled: !!userId,
    refetchInterval: 30_000,
  });
  const { data: systemsData } = useQuery({
    queryKey: ["systems", userId],
    queryFn: () => getSystems(userId!),
    enabled: !!userId,
    refetchInterval: 30_000,
  });

  const user = data?.user;
  const systemCount = systemsData?.systems.length ?? 0;

  const handleSwitch = () => {
    try {
      window.localStorage.removeItem("wakeel:user");
    } catch {
      // ignore storage failures
    }
    switchOperator();
    toast(t.sb.switchedTitle, {
      description: t.sb.switchedDesc,
    });
  };

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-3 backdrop-blur-md md:px-4">
      {/* left: identity */}
      <div className="flex min-w-0 items-center gap-2.5">
        <WakeelMark className="size-5 shrink-0" />
        <span className="truncate font-mono text-xs tracking-[0.08em] text-foreground">
          {user?.workspace ?? t.sb.fallbackWorkspace}
        </span>
        <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">
          {"// "}
          {user?.name ?? t.sb.fallbackName}
        </span>
      </div>

      {/* center: live telemetry */}
      <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-4 md:flex">
        <LiveClock />
        <span className="h-3.5 w-px bg-border" aria-hidden />
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          {t.sb.systems} <span className="text-foreground" dir="ltr">{systemCount}</span>
        </span>
        <span className="h-3.5 w-px bg-border" aria-hidden />
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-live">
          <span className="size-1.5 rounded-full bg-live shadow-[0_0_6px_rgba(62,207,142,0.9)]" />
          {t.sb.operational}
        </span>
      </div>

      {/* right: palette + operator + dock toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPaletteOpen(true)}
          aria-label={t.sb.openPalette}
          className="hidden h-8 items-center gap-2 rounded-sm border border-border bg-transparent px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:flex"
        >
          <Search className="size-3.5" />
          <span className="hidden xl:inline">{t.sb.search}</span>
          <kbd className="rounded-[3px] border border-border bg-secondary px-1 font-mono text-[9px] tracking-[0.08em]">
            ⌘K
          </kbd>
        </button>
        <Button
          onClick={toggleAgentDock}
          aria-pressed={agentDockOpen}
          className={cn(
            "h-8 gap-1.5 rounded-sm px-2.5 font-mono text-[10px] uppercase tracking-[0.14em]",
            agentDockOpen
              ? "border border-gold/50 bg-gold/15 text-gold hover:bg-gold/25"
              : "border border-border bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <Bot className="size-3.5" />
          <span className="hidden lg:inline">{t.sb.agentDock}</span>
        </Button>

        <LangToggle className="hidden sm:flex" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex min-h-11 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:min-h-0"
              aria-label={t.sb.operatorMenu}
            >
              <Avatar className="size-7 border border-gold/30">
                <AvatarFallback className="bg-secondary font-mono text-[10px] text-gold">
                  {initialsOf(user?.name ?? "W")}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 border-border bg-popover">
            <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {user ? `${user.name} · ${user.workspace}` : "OPERATOR"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={handleSwitch}
              className="gap-2 font-mono text-[11px] uppercase tracking-[0.1em] focus:bg-secondary focus:text-gold"
            >
              <LogOut className="size-3.5" /> {t.sb.switchOp}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
