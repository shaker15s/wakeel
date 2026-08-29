"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { StatusBar } from "@/components/app/console/status-bar";
import { MobileNav, Sidebar } from "@/components/app/console/sidebar";
import {
  AgentDockPanel,
  AgentDockSheet,
} from "@/components/app/console/agent-dock";
import { SystemDetailDialog } from "@/components/app/console/system-detail-dialog";
import { CommandPalette } from "@/components/app/console/command-palette";
import { BootSequence } from "@/components/app/console/boot-sequence";
import { GuidedTour } from "@/components/app/console/guided-tour";
import { AssistantView } from "@/components/app/console/views/assistant-view";
import { OverviewView } from "@/components/app/console/views/overview";
import { DiscoveryView } from "@/components/app/console/views/discovery";
import { SystemsView } from "@/components/app/console/views/systems";
import { ForgeView } from "@/components/app/console/views/forge";
import { ActivityView } from "@/components/app/console/views/activity";
import { useIsLarge } from "@/lib/use-is-large";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";
import type { ConsoleTab } from "@/lib/api-client";

const VIEW_MOTION = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.24, ease: "easeOut" as const },
};

/** Digit-hotkeys 1–6 jump between console views (inputs & dialogs excluded). */
function useViewHotkeys() {
  const setConsoleTab = useWakeel((s) => s.setConsoleTab);
  useEffect(() => {
    const map: Record<string, ConsoleTab> = {
      "1": "assistant",
      "2": "overview",
      "3": "discovery",
      "4": "systems",
      "5": "forge",
      "6": "activity",
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tab = map[e.key];
      if (!tab) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      )
        return;
      // never yank the view out from under an open dialog/palette
      if (document.querySelector('[role="dialog"]')) return;
      setConsoleTab(tab);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setConsoleTab]);
}

export function Console() {
  const t = useT();
  const consoleTab = useWakeel((s) => s.consoleTab);
  const agentDockOpen = useWakeel((s) => s.agentDockOpen);
  const isLarge = useIsLarge();
  useViewHotkeys();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* keyboard operators can jump straight past the chrome */}
      <a
        href="#console-main"
        className="skip-link border border-gold/40 bg-card px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-gold shadow-[0_0_24px_-6px_rgba(232,180,74,0.6)]"
      >
        {t.common.skip}
      </a>

      <StatusBar />
      <MobileNav />

      <div className="flex min-h-0 flex-1">
        <Sidebar className="hidden md:flex" />

        <main
          id="console-main"
          tabIndex={-1}
          className="relative min-w-0 flex-1 overflow-y-auto focus:outline-none"
        >
          <div className="bg-blueprint pointer-events-none fixed inset-0 opacity-30" aria-hidden />
          <AnimatePresence mode="wait">
            <motion.div
              key={consoleTab}
              {...VIEW_MOTION}
              className="relative mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8"
            >
              {consoleTab === "assistant" && <AssistantView />}
              {consoleTab === "overview" && <OverviewView />}
              {consoleTab === "discovery" && <DiscoveryView />}
              {consoleTab === "systems" && <SystemsView />}
              {consoleTab === "forge" && <ForgeView />}
              {consoleTab === "activity" && <ActivityView />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* agent dock — inline panel on large screens */}
        <AnimatePresence>
          {agentDockOpen && isLarge && <AgentDockPanel key="dock-panel" />}
        </AnimatePresence>
      </div>

      {/* agent dock — sheet below lg */}
      <AgentDockSheet />

      {/* system detail dialog — openable from any tab */}
      <SystemDetailDialog />

      {/* ⌘K command palette */}
      <CommandPalette />

      {/* one-shot terminal boot overlay */}
      <BootSequence />

      {/* first-use guided tour (auto for fresh operators, replayable) */}
      <GuidedTour />
    </div>
  );
}
