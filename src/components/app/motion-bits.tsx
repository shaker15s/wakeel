"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { cn } from "@/lib/utils";

/* ------------------------- media query helpers ----------------------------- */

/** SSR-safe media query via useSyncExternalStore — zero cascading renders. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** True when the operator asked the OS for reduced motion. */
export function usePrefersReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/* ------------------------------ animated counter -------------------------- */

export function CountUp({
  value,
  decimals = 0,
  duration = 1.6,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / (duration * 1000));
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p); // easeOutExpo
      setDisplay(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);

  const text =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString("en-US");

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

/* ------------------------------ scroll reveals ---------------------------- */

export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({
  children,
  className,
  gap = 0.08,
}: {
  children: React.ReactNode;
  className?: string;
  gap?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: gap } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 22 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------ micro labels ------------------------------ */

export function MonoLabel({
  children,
  className,
  gold = false,
}: {
  children: React.ReactNode;
  className?: string;
  gold?: boolean;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[11px] uppercase tracking-[0.14em]",
        gold ? "text-gold" : "text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Section heading used across landing sections. */
export function SectionHeading({
  eyebrow,
  title,
  copy,
  align = "center",
}: {
  eyebrow: string;
  title: React.ReactNode;
  copy?: string;
  align?: "center" | "left";
}) {
  return (
    <Reveal
      className={cn(
        "flex flex-col gap-3",
        align === "center" ? "items-center text-center" : "items-start"
      )}
    >
      <MonoLabel gold>[ {eyebrow} ]</MonoLabel>
      <h2 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
        {title}
      </h2>
      {copy && (
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
          {copy}
        </p>
      )}
    </Reveal>
  );
}

/* ── elite interaction layer ─────────────────────────────────────────────── */

/* ------------------------------ magnetic pull ----------------------------- */

/**
 * Magnetic — children subtly gravitate toward the cursor while hovered,
 * then spring back. Pure transform (GPU), pointer-fine devices only.
 */
export function Magnetic({
  children,
  strength = 0.28,
  className,
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const fine = useMediaQuery("(pointer: fine)");
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 160, damping: 15, mass: 0.35 });
  const y = useSpring(my, { stiffness: 160, damping: 15, mass: 0.35 });

  const onMove = (e: React.MouseEvent) => {
    if (reduced || !fine || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - (r.left + r.width / 2)) * strength);
    my.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{ x, y }}
      className={cn("inline-block", className)}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------ decode text ------------------------------- */

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/\\<>_·";

/**
 * ScrambleText — "signal lock" decode effect: characters resolve from
 * random glyphs into the real string as the element enters the viewport.
 * Skipped entirely for reduced-motion operators (renders the final text).
 */
export function ScrambleText({
  text,
  className,
  speed = 26,
  startDelay = 0,
}: {
  text: string;
  className?: string;
  /** ms between reveal steps */
  speed?: number;
  startDelay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const reduced = usePrefersReducedMotion();
  const [out, setOut] = useState(text);

  useEffect(() => {
    if (reduced || !inView) return;
    let i = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const kick = setTimeout(() => {
      interval = setInterval(() => {
        i += Math.max(1, Math.round(text.length / 18));
        if (i >= text.length) {
          setOut(text);
          if (interval) clearInterval(interval);
          return;
        }
        const noise = Array.from(
          { length: text.length - i },
          () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        ).join("");
        setOut(text.slice(0, i) + noise);
      }, speed);
    }, startDelay);
    return () => {
      clearTimeout(kick);
      if (interval) clearInterval(interval);
    };
  }, [inView, text, speed, startDelay, reduced]);

  const display = reduced ? text : out;

  return (
    <span ref={ref} className={className} aria-label={text}>
      <span aria-hidden>{display}</span>
    </span>
  );
}

/* ------------------------------ cursor spotlight -------------------------- */

/**
 * Spotlight — a soft radial glow that tracks the cursor inside the parent
 * section. Decorative only (pointer-events-none, aria-hidden).
 */
export function Spotlight({
  className,
  radius = 520,
  color = "rgba(232,180,74,0.075)",
}: {
  className?: string;
  radius?: number;
  color?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        ) {
          setPos(null);
          return;
        }
        setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 transition-opacity duration-500",
        pos ? "opacity-100" : "opacity-0",
        className
      )}
      style={{
        background: `radial-gradient(${radius}px circle at ${pos?.x ?? 0}px ${pos?.y ?? 0}px, ${color}, transparent 65%)`,
      }}
    />
  );
}

/* --------------------------------- tilt card ------------------------------ */

/**
 * TiltCard — 3D perspective tilt that follows the cursor. Springs back to
 * flat on leave. Disabled for touch + reduced-motion operators.
 */
export function TiltCard({
  children,
  className,
  max = 5,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const fine = useMediaQuery("(pointer: fine)");
  const rmx = useMotionValue(0);
  const rmy = useMotionValue(0);
  const rotateX = useSpring(rmx, { stiffness: 220, damping: 20 });
  const rotateY = useSpring(rmy, { stiffness: 220, damping: 20 });

  const onMove = (e: React.MouseEvent) => {
    if (reduced || !fine || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    rmy.set(px * max * 2);
    rmx.set(-py * max * 2);
  };
  const reset = () => {
    rmx.set(0);
    rmy.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
