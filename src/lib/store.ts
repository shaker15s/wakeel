"use client";

import { create } from "zustand";
import type { AiSystem, ConsoleTab, View } from "@/lib/api-client";

export interface LastScanPayload {
  target: string;
  summary: string;
  systems: AiSystem[];
}

interface WakeelState {
  /** operator id, hydrated from localStorage key `wakeel:user` */
  userId: string | null;
  /** true once the localStorage hydration pass has run (client only) */
  hydrated: boolean;
  view: View;
  consoleTab: ConsoleTab;
  agentDockOpen: boolean;
  onboardingOpen: boolean;
  /** ⌘K command palette visibility */
  paletteOpen: boolean;
  /** system to focus in the detail dialog (openable from any tab) */
  systemDetailId: string | null;
  /** latest discovery scan result so users can hop tabs without losing it */
  lastScan: LastScanPayload | null;
  /** latest forged system for the reveal card */
  lastForge: AiSystem | null;

  hydrate: () => void;
  setUserId: (id: string | null, opts?: { persist?: boolean }) => void;
  setView: (view: View) => void;
  setConsoleTab: (tab: ConsoleTab) => void;
  setAgentDockOpen: (open: boolean) => void;
  toggleAgentDock: () => void;
  setOnboardingOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  openSystemDetail: (systemId: string) => void;
  closeSystemDetail: () => void;
  setLastScan: (scan: LastScanPayload | null) => void;
  setLastForge: (system: AiSystem | null) => void;
  /** clear local identity and return to the landing view */
  switchOperator: () => void;
}

const STORAGE_KEY = "wakeel:user";

export const useWakeel = create<WakeelState>((set) => ({
  userId: null,
  hydrated: false,
  view: "landing",
  consoleTab: "overview",
  agentDockOpen: false,
  onboardingOpen: false,
  paletteOpen: false,
  systemDetailId: null,
  lastScan: null,
  lastForge: null,

  hydrate: () => {
    let id: string | null = null;
    try {
      id = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      id = null;
    }
    if (id) {
      set({ userId: id, view: "console", hydrated: true });
    } else {
      set({ hydrated: true });
    }
  },

  setUserId: (id, opts) => {
    try {
      if (opts?.persist === false) {
        // only clear when explicitly unsetting
        if (id === null) window.localStorage.removeItem(STORAGE_KEY);
      } else if (id) {
        window.localStorage.setItem(STORAGE_KEY, id);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // storage unavailable (private mode) — session-only identity
    }
    set({ userId: id });
  },

  setView: (view) => set({ view }),
  setConsoleTab: (consoleTab) => set({ consoleTab }),
  setAgentDockOpen: (agentDockOpen) => set({ agentDockOpen }),
  toggleAgentDock: () =>
    set((s) => ({ agentDockOpen: !s.agentDockOpen })),
  setOnboardingOpen: (onboardingOpen) => set({ onboardingOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  openSystemDetail: (id) => set({ systemDetailId: id }),
  closeSystemDetail: () => set({ systemDetailId: null }),
  setLastScan: (lastScan) => set({ lastScan }),
  setLastForge: (lastForge) => set({ lastForge }),

  switchOperator: () =>
    set({
      userId: null,
      view: "landing",
      consoleTab: "overview",
      agentDockOpen: false,
      onboardingOpen: false,
      paletteOpen: false,
      systemDetailId: null,
      lastScan: null,
      lastForge: null,
    }),
}));
