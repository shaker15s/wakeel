"use client";

import { create } from "zustand";
import type { AiSystem, ConsoleTab, View } from "@/lib/api-client";
import type { Lang } from "@/lib/i18n";

export interface LastScanPayload {
  target: string;
  summary: string;
  systems: AiSystem[];
}

interface WakeelState {
  /** operator id, hydrated from localStorage key `wakeel:user` */
  userId: string | null;
  /** UI language — persisted to localStorage key `wakeel:lang` */
  lang: Lang;
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
  /** token parsed from `#share=<token>` — drives the public read-only view */
  shareToken: string | null;

  hydrate: () => void;
  setUserId: (id: string | null, opts?: { persist?: boolean }) => void;
  setLang: (lang: Lang) => void;
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
const LANG_KEY = "wakeel:lang";

function readStoredLang(): Lang {
  try {
    return window.localStorage.getItem(LANG_KEY) === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

export const useWakeel = create<WakeelState>((set) => ({
  userId: null,
  lang: "en",
  hydrated: false,
  view: "landing",
  shareToken: null,
  consoleTab: "overview",
  agentDockOpen: false,
  onboardingOpen: false,
  paletteOpen: false,
  systemDetailId: null,
  lastScan: null,
  lastForge: null,

  hydrate: () => {
    let id: string | null = null;
    let lang: Lang = "en";
    let shareToken: string | null = null;
    try {
      id = window.localStorage.getItem(STORAGE_KEY);
      lang = readStoredLang();
      const m = /^#share=([A-Za-z0-9_-]+)$/.exec(window.location.hash);
      if (m) shareToken = m[1];
    } catch {
      id = null;
    }
    if (shareToken) {
      // shared links render the public read-only view regardless of session
      set({ shareToken, lang, view: "share", hydrated: true });
    } else if (id) {
      set({ userId: id, lang, view: "console", hydrated: true });
    } else {
      set({ lang, hydrated: true });
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

  setLang: (lang) => {
    try {
      window.localStorage.setItem(LANG_KEY, lang);
    } catch {
      // storage unavailable — language stays session-only
    }
    set({ lang });
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

  switchOperator: () => {
    // scrub any share hash so back-navigation stays clean
    try {
      if (window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {
      // noop
    }
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
      shareToken: null,
    });
  },
}));
