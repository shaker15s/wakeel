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
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";
import type { ConsoleTab } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface NavItem {
  id: ConsoleTab;
  icon: LucideIcon;
}

const NAV_META: NavItem[] = [
  { id: "overview", icon: LayoutDashboard },
  { id: "discovery", icon: Radar },
  { id: "systems", icon: Database },
  { id: "forge", icon: Hammer },
  { id: "activity", icon: ScrollText },
];

/** Hook: localized nav items (label comes from the active dictionary). */
export function useNavItems() {
  const t = useT();
  const labels: Record<ConsoleTab, string> = {
    overview: t.side.overview,
    discovery: t.side.discovery,
    systems: t.side.systems,
    forge: t.side.forge,
    activity: t.side.activity,
  };
  return NAV_META.map((item) => ({ ...item, label: labels[item.id] }));
}

/** Desktop sidebar: icon rail on md, full rail with labels on lg+. */
export function Sidebar({ className }: { className?: string }) {
  const t = useT();
  const consoleTab = useWakeel((s) => s.consoleTab);
  const setConsoleTab = useWakeel((s) => s.setConsoleTab);
  const NAV_ITEMS = useNavItems();

  return (
    <nav
      aria-label={t.side.navLabel}
      className={cn(
        "w-14 shrink-0 flex-col gap-1 border-e border-border bg-sidebar px-2 py-4 lg:w-60",
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
                : "text-muted-foreground hover:bg-secondary/50 hover:text-gold/90 rtl:hover:translate-x-[-2px]"
            )}
          >
            {active && (
              <motion.span
                layoutId="console-nav-indicator"
                className="absolute start-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gold shadow-[0_0_8px_rgba(232,180,74,0.8)]"
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
          {t.side.hintKeys}
        </p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
          {t.side.version}
        </p>
      </div>
    </nav>
  );
}

/** Mobile (<md): horizontal scrollable nav row under the status bar. */
export function MobileNav({ className }: { className?: string }) {
  const t = useT();
  const consoleTab = useWakeel((s) => s.consoleTab);
  const setConsoleTab = useWakeel((s) => s.setConsoleTab);
  const NAV_ITEMS = useNavItems();

  return (
    <nav
      aria-label={t.side.navLabel}
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
