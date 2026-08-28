"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { MonoLabel } from "@/components/app/motion-bits";
import { useT } from "@/lib/i18n";

const STEP_MS = 300;
const START_MS = 350;

/**
 * BootSequence — one-shot terminal boot overlay when the console mounts
 * (once per browser session). Any key/click skips it; reduced-motion
 * operators never see it at all.
 */
export function BootSequence() {
  const t = useT();
  const [lineCount, setLineCount] = useState(0);
  // decide visibility lazily: once per session, never for reduced-motion
  const [show, setShow] = useState(() => {
    if (typeof window === "undefined") return false;
    if (sessionStorage.getItem("wakeel:boot")) return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sessionStorage.setItem("wakeel:boot", "1");
      return false;
    }
    sessionStorage.setItem("wakeel:boot", "1");
    return true;
  });

  useEffect(() => {
    if (!show) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    t.boot.lines.forEach((_, i) => {
      timers.push(setTimeout(() => setLineCount(i + 1), START_MS + i * STEP_MS));
    });
    const finishAt = START_MS + t.boot.lines.length * STEP_MS + 520;
    timers.push(setTimeout(() => setShow(false), finishAt));

    const skip = () => setShow(false);
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [show, t.boot.lines]);

  const allLines = lineCount >= t.boot.lines.length;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="boot"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.025, filter: "blur(6px)" }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-background/95 backdrop-blur-md"
          role="status"
          aria-label={t.boot.sub}
        >
          <div className="bg-blueprint absolute inset-0 opacity-40" aria-hidden />
          <div className="noise" aria-hidden />
          {/* ambient glow behind the terminal */}
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 size-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(232,180,74,0.07) 0%, transparent 62%)",
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="corner-frame relative w-[min(92vw,460px)] border border-gold/20 bg-card/80 p-6 shadow-[0_0_90px_-18px_rgba(232,180,74,0.35)]"
          >
            <div dir="ltr" className="flex items-baseline justify-between gap-3">
              <p className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-gold">
                {t.boot.title}
              </p>
              <p className="animate-blink font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                ● REC
              </p>
            </div>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70" dir="ltr">
              {t.boot.sub}
            </p>

            <div dir="ltr" className="mt-5 flex min-h-[120px] flex-col gap-2">
              {t.boot.lines.slice(0, lineCount).map((line, i) => (
                <motion.p
                  key={line}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="flex items-center gap-2 font-mono text-[11px] tracking-[0.06em] text-foreground/85"
                >
                  <span className="text-gold">▸</span>
                  {line}
                </motion.p>
              ))}
              {allLines && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-1 flex items-center gap-2 font-mono text-[11px] tracking-[0.06em] text-live"
                >
                  <Check className="size-3.5" />
                  {t.boot.ready}
                </motion.p>
              )}
              {!allLines && (
                <span aria-hidden className="animate-blink font-mono text-[11px] text-gold">
                  █
                </span>
              )}
            </div>

            {/* progress rail */}
            <div className="mt-4 h-[3px] overflow-hidden rounded-full bg-secondary">
              <div className="animate-boot-progress h-full w-full bg-gradient-to-r from-gold-deep via-gold to-gold-pale shadow-[0_0_10px_rgba(232,180,74,0.6)]" />
            </div>

            <MonoLabel className="mt-3 block animate-blink text-center">
              {t.boot.skip}
            </MonoLabel>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
