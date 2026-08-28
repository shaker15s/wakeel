"use client";

import {
  Database,
  Hammer,
  LayoutDashboard,
  Radar,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { useWakeel } from "@/lib/store";
import type { ConsoleTab } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface NavItem {
  id: ConsoleTab;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "discovery", label: "Discovery", icon: Radar },
  { id: "systems", label: "Systems", icon: Database },
  { id: "forge", label: "Forge", icon: Hammer },
  { id: "activity", label: "Activity", icon: ScrollText },
];

/** Desktop sidebar: icon rail on md, full rail with labels on lg+. */
export function Sidebar({ className }: { className?: string }) {
  const consoleTab = useWakeel((s) => s.consoleTab);
  const setConsoleTab = useWakeel((s) => s.setConsoleTab);

  return (
    <nav
      aria-label="Console navigation"
      className={cn(
        "w-14 shrink-0 flex-col gap-1 border-r border-border bg-sidebar px-2 py-4 lg:w-60",
        className
      )}
    >
      {NAV_ITEMS.map((item) => {
        const active = consoleTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setConsoleTab(item.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex h-11 min-h-11 w-full items-center gap-3 rounded-sm px-3.5 transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              active
                ? "bg-secondary text-gold"
                : "text-muted-foreground hover:translate-x-0.5 hover:bg-secondary/50 hover:text-gold/90"
            )}
          >
            {active && (
              <motion.span
                layoutId="console-nav-indicator"
                className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gold shadow-[0_0_8px_rgba(232,180,74,0.8)]"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <item.icon
              className={cn(
                "size-[18px] shrink-0 transition-transform group-hover:scale-110",
                active && "text-gold"
              )}
            />
            <span className="hidden text-[13px] font-medium lg:inline">
              {item.label}
            </span>
          </button>
        );
      })}

      <div className="mt-auto hidden px-3 lg:block">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
          WAKEEL v0.1 · و
        </p>
      </div>
    </nav>
  );
}

/** Mobile (<md): horizontal scrollable nav row under the status bar. */
export function MobileNav({ className }: { className?: string }) {
  const consoleTab = useWakeel((s) => s.consoleTab);
  const setConsoleTab = useWakeel((s) => s.setConsoleTab);

  return (
    <nav
      aria-label="Console navigation"
      className={cn(
        "flex shrink-0 overflow-x-auto border-b border-border bg-sidebar md:hidden",
        className
      )}
    >
      {NAV_ITEMS.map((item) => {
        const active = consoleTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setConsoleTab(item.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-11 min-h-11 shrink-0 items-center gap-2 px-4 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
              active ? "text-gold" : "text-muted-foreground"
            )}
          >
            <item.icon className="size-4" />
            {item.label}
            {active && (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gold shadow-[0_0_8px_rgba(232,180,74,0.8)]" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
