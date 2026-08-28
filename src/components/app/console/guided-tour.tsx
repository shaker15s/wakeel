"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import type { ConsoleTab } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * FIRST-USE GUIDED TOUR — a 7-stop coach-mark walk through the console.
 *
 * • Auto-starts once for fresh operators (onboarding sets `wakeel:tour:auto`,
 *   the tour waits out the boot overlay, then glides in).
 * • Replayable from the operator menu (`tourOpen` store flag).
 * • Spotlight = a gold ring that physically glides between anchors
 *   (spring-animated x/y/w/h over a giant dim box-shadow cutout).
 * • Each step lands on the matching console view; the AGENT DOCK step opens
 *   the dock so the explanation is never about something off-screen.
 * • Keyboard: →/Enter next · ← back · ESC skip. Reduced-motion users get the
 *   same tour with animations collapsed (MotionConfig handles framer).
 */

const TOUR_DONE_KEY = "wakeel:tour:done";
const TOUR_AUTO_KEY = "wakeel:tour:auto";
/** how long the boot overlay runs — the auto-start politely waits it out */
const BOOT_GRACE_MS = 3000;

interface StepCfg {
  /** console view to land on when the step opens */
  tab?: ConsoleTab;
  /** data-tour anchor (desktop-first); falls back to centered card if invisible */
  anchor: string;
  /** alternate anchor tried when the primary is not rendered (e.g. mobile nav) */
  altAnchor?: string;
  /** open the agent dock for this step */
  openDock?: boolean;
}

const STEPS: StepCfg[] = [
  { tab: "overview", anchor: "nav-overview", altAnchor: "mnav-overview" },
  { tab: "discovery", anchor: "nav-discovery", altAnchor: "mnav-discovery" },
  { tab: "systems", anchor: "nav-systems", altAnchor: "mnav-systems" },
  { tab: "forge", anchor: "nav-forge", altAnchor: "mnav-forge" },
  { tab: "activity", anchor: "nav-activity", altAnchor: "mnav-activity" },
  { anchor: "dock", openDock: true },
  { tab: "overview", anchor: "palette" },
];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const CARD_W = 344;
const CARD_EST_H = 318;
const GAP = 14;

export function GuidedTour() {
  const t = useT();
  const open = useWakeel((s) => s.tourOpen);
  const setOpen = useWakeel((s) => s.setTourOpen);
  const setConsoleTab = useWakeel((s) => s.setConsoleTab);
  const setAgentDockOpen = useWakeel((s) => s.setAgentDockOpen);

  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(CARD_EST_H);
  const cardRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef(0);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const markDone = useCallback(() => {
    try {
      window.localStorage.setItem(TOUR_DONE_KEY, "1");
    } catch {
      // storage unavailable — tour will simply re-offer next visit
    }
  }, []);

  const close = useCallback(
    (finished: boolean) => {
      markDone();
      setOpen(false);
      setStep(0); // next replay starts from stop 01
      if (finished) {
        toast.success(t.tour.doneTitle, { description: t.tour.doneDesc });
      }
    },
    [markDone, setOpen, t.tour.doneTitle, t.tour.doneDesc]
  );

  // auto-start for fresh operators (flag planted by the onboarding dialog)
  useEffect(() => {
    try {
      if (window.localStorage.getItem(TOUR_AUTO_KEY) !== "1") return;
      window.localStorage.removeItem(TOUR_AUTO_KEY);
      const timer = setTimeout(() => {
        // never yank the tour over an open dialog (onboarding/palette)
        if (document.querySelector('[role="dialog"]')) return;
        useWakeel.getState().setTourOpen(true);
      }, BOOT_GRACE_MS);
      return () => clearTimeout(timer);
    } catch {
      // storage unavailable — no auto-start
    }
  }, []);

  // reopen from the operator menu → always start from stop 01 (close() resets)

  const measure = useCallback(() => {
    const cfg = STEPS[stepRef.current];
    if (!cfg) return;
    const candidates = cfg.altAnchor
      ? [`[data-tour="${cfg.anchor}"]`, `[data-tour="${cfg.altAnchor}"]`]
      : [`[data-tour="${cfg.anchor}"]`];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
        return;
      }
    }
    setRect(null);
  }, []);

  // land on the right view / dock state for the incoming step, then measure
  useEffect(() => {
    if (!open) return;
    const cfg = STEPS[step];
    if (!cfg) return;
    if (cfg.tab) setConsoleTab(cfg.tab);
    if (cfg.openDock) setAgentDockOpen(true);
    const wait = cfg.tab ? 360 : 120; // let the view transition mount first
    const timer = setTimeout(() => {
      requestAnimationFrame(measure);
    }, wait);
    return () => clearTimeout(timer);
  }, [open, step, measure, setConsoleTab, setAgentDockOpen]);

  // keep the spotlight glued to its anchor while the layout moves
  useEffect(() => {
    if (!open) return;
    const onMove = () => requestAnimationFrame(measure);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, measure]);

  // keep the tooltip honest about its own height (clamped placement)
  useEffect(() => {
    if (!open) return;
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCardH(el.offsetHeight));
    ro.observe(el);
    setCardH(el.offsetHeight);
    return () => ro.disconnect();
  }, [open, step]);

  // keyboard controls (typing in inputs never hijacked)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (stepRef.current >= STEPS.length - 1) close(true);
        else setStep((s) => s + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStep((s) => Math.max(0, s - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // screen-reader narration for the live region (derived, no cascading state)
  const stepContent = t.tour.steps[step];
  const announced =
    open && stepContent
      ? `${t.tour.stepOf(step + 1, STEPS.length)} — ${stepContent.title}. ${stepContent.body}`
      : "";

  if (!open) return null;

  const cfg = STEPS[step];
  const content = t.tour.steps[step] ?? t.tour.steps[0];
  const last = step >= STEPS.length - 1;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  // tooltip placement — prefer below the anchor, flip above, clamp to viewport
  let cardStyle: React.CSSProperties;
  if (rect) {
    const below = rect.y + rect.h + GAP + cardH < vh - 8;
    const left = Math.min(
      Math.max(10, rect.x + rect.w / 2 - CARD_W / 2),
      Math.max(10, vw - CARD_W - 10)
    );
    cardStyle = below
      ? { top: rect.y + rect.h + GAP, left }
      : { top: Math.max(10, rect.y - cardH - GAP), left };
  } else {
    cardStyle = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  return (
    <div
      role="dialog"
      aria-label={t.tour.aria}
      className="fixed inset-0 z-[95]"
    >
      {/* screen-reader narration */}
      <p className="sr-only" aria-live="polite">
        {announced}
      </p>

      {/* dim cutout — a gliding gold ring over a giant shadow */}
      <AnimatePresence>
        {rect && (
          <motion.div
            key="spot"
            className="pointer-events-none fixed rounded-md border-2 border-gold/70"
            initial={false}
            animate={{
              x: rect.x - 7,
              y: rect.y - 7,
              width: rect.w + 14,
              height: rect.h + 14,
              opacity: 1,
            }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            style={{
              boxShadow:
                "0 0 0 9999px rgba(4,4,5,0.82), 0 0 44px rgba(232,180,74,0.35), inset 0 0 24px rgba(232,180,74,0.12)",
            }}
          >
            {/* heartbeat pulse on the active anchor */}
            <motion.span
              aria-hidden
              className="absolute -inset-1 rounded-lg border border-gold/40"
              animate={{ opacity: [0.9, 0.25, 0.9], scale: [1, 1.035, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* corner ticks — mission-control framing */}
            {(["start-0 top-0 border-s-2 border-t-2", "end-0 top-0 border-e-2 border-t-2", "start-0 bottom-0 border-s-2 border-b-2", "end-0 bottom-0 border-e-2 border-b-2"] as const).map(
              (pos) => (
                <span
                  key={pos}
                  aria-hidden
                  className={cn("absolute size-2.5 border-gold", pos)}
                />
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {/* centered-card fallback dims the whole console */}
      {!rect && <div className="absolute inset-0 bg-background/85 backdrop-blur-[2px]" />}

      {/* tooltip card */}
      <motion.div
        key={step}
        ref={cardRef}
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98 }}
        transition={{ duration: 0.26, ease: "easeOut" }}
        style={{ width: CARD_W, ...cardStyle }}
        className="fixed z-10"
      >
        <div className="corner-frame wakeel-scrollbar max-h-[72vh] overflow-y-auto border border-gold/25 bg-card/95 p-4 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.85),0_0_36px_-14px_rgba(232,180,74,0.4)] backdrop-blur-md">
          {/* kicker */}
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold" dir="ltr">
              [
              {" "}
              {t.tour.stepOf(step + 1, STEPS.length)}
              {" · "}
              {content.kicker}
              {" "}
              ]
            </p>
            <Sparkles className="size-3.5 shrink-0 text-gold/70" aria-hidden />
          </div>

          <h2 className="mt-2.5 font-display text-[17px] font-semibold leading-snug text-foreground">
            {content.title}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {content.body}
          </p>

          {/* progress dots */}
          <div
            className="mt-4 flex items-center gap-1.5"
            role="img"
            aria-label={t.tour.dots}
          >
            {STEPS.map((_, i) => (
              <button
                key={i}
                tabIndex={-1}
                aria-hidden
                onClick={() => setStep(i)}
                className={cn(
                  "h-1 rounded-full transition-all duration-300",
                  i === step
                    ? "w-6 bg-gold shadow-[0_0_8px_rgba(232,180,74,0.8)]"
                    : i < step
                      ? "w-2.5 bg-gold/50"
                      : "w-2.5 bg-border"
                )}
              />
            ))}
          </div>

          {/* controls */}
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
            <button
              onClick={() => close(false)}
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.tour.skip}
            </button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="flex h-8 items-center gap-1 border border-border bg-transparent px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold"
                >
                  <ChevronLeft className="size-3.5 rtl:hidden" aria-hidden />
                  <ChevronRight className="size-3.5 hidden rtl:block" aria-hidden />
                  {t.tour.back}
                </button>
              )}
              <button
                autoFocus
                onClick={() => (last ? close(true) : setStep((s) => s + 1))}
                className={cn(
                  "btn-shine flex h-8 items-center gap-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-primary-foreground transition-transform hover:-translate-y-px",
                  "rounded-sm bg-gold font-semibold text-[#141414] shadow-[0_6px_18px_-6px_rgba(232,180,74,0.65)]"
                )}
              >
                {last ? t.tour.finish : t.tour.next}
                <ChevronRight className="size-3.5 rtl:hidden" aria-hidden />
                <ChevronLeft className="size-3.5 hidden rtl:block" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
