"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { StatusBar } from "@/components/app/console/status-bar";
import { MobileNav, Sidebar } from "@/components/app/console/sidebar";
import {
  AgentDockPanel,
  AgentDockSheet,
} from "@/components/app/console/agent-dock";
import { SystemDetailDialog } from "@/components/app/console/system-detail-dialog";
import { CommandPalette } from "@/components/app/console/command-palette";
import { OverviewView } from "@/components/app/console/views/overview";
import { DiscoveryView } from "@/components/app/console/views/discovery";
import { SystemsView } from "@/components/app/console/views/systems";
import { ForgeView } from "@/components/app/console/views/forge";
import { ActivityView } from "@/components/app/console/views/activity";
import { useWakeel } from "@/lib/store";

/** Track the lg breakpoint (dock renders inline at ≥1024px, sheet below). */
function useIsLarge() {
  const [isLarge, setIsLarge] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsLarge(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isLarge;
}

const VIEW_MOTION = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.24, ease: "easeOut" as const },
};

export function Console() {
  const consoleTab = useWakeel((s) => s.consoleTab);
  const agentDockOpen = useWakeel((s) => s.agentDockOpen);
  const isLarge = useIsLarge();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <StatusBar />
      <MobileNav />

      <div className="flex min-h-0 flex-1">
        <Sidebar className="hidden md:flex" />

        <main className="relative min-w-0 flex-1 overflow-y-auto">
          <div className="bg-blueprint pointer-events-none fixed inset-0 opacity-30" aria-hidden />
          <AnimatePresence mode="wait">
            <motion.div
              key={consoleTab}
              {...VIEW_MOTION}
              className="relative mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8"
            >
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
    </div>
  );
}
