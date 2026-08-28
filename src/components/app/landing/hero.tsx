"use client";

import Image from "next/image";
import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { ArrowDown, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CountUp,
  Magnetic,
  MonoLabel,
  ScrambleText,
  Spotlight,
  usePrefersReducedMotion,
} from "@/components/app/motion-bits";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";

const STATS_META = [
  { key: "statTasks", value: 12480, decimals: 0, suffix: "" },
  { key: "statSystems", value: 3214, decimals: 0, suffix: "" },
  { key: "statResponse", value: 0.4, decimals: 1, suffix: "s" },
  { key: "statUptime", value: 99.98, decimals: 2, suffix: "%" },
] as const;

const CHIPS_META = [
  { key: "chip1", className: "-left-4 top-8 sm:-left-10", delay: 0, duration: 5.2 },
  { key: "chip2", className: "-right-3 top-1/2 sm:-right-8", delay: 0.8, duration: 4.4 },
  { key: "chip3", className: "-left-2 bottom-12 sm:-left-6", delay: 1.6, duration: 6 },
] as const;

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const t = useT();
  const setOnboardingOpen = useWakeel((s) => s.setOnboardingOpen);
  const userId = useWakeel((s) => s.userId);
  const setView = useWakeel((s) => s.setView);
  const reduced = usePrefersReducedMotion();

  // mouse parallax for the radar orb (spring-smoothed, pointer-fine only)
  const sectionRef = useRef<HTMLElement>(null);
  const ox = useMotionValue(0);
  const oy = useMotionValue(0);
  const orbX = useSpring(ox, { stiffness: 60, damping: 18 });
  const orbY = useSpring(oy, { stiffness: 60, damping: 18 });

  const onSectionMove = (e: React.MouseEvent) => {
    if (reduced || !sectionRef.current) return;
    const r = sectionRef.current.getBoundingClientRect();
    ox.set(((e.clientX - r.left) / r.width - 0.5) * 18);
    oy.set(((e.clientY - r.top) / r.height - 0.5) * 14);
  };

  const hire = () => {
    if (userId) setView("console");
    else setOnboardingOpen(true);
  };

  return (
    <section
      id="top"
      ref={sectionRef}
      onMouseMove={onSectionMove}
      className="relative flex min-h-screen flex-col overflow-hidden"
    >
      {/* ---- background layers ---- */}
      <div className="absolute inset-0" aria-hidden>
        <Image
          src="/hero-nebula.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/55 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/30 to-background/70" />
        {/* drifting aurora — keeps the backdrop alive */}
        <div
          className="animate-aurora absolute -left-1/4 top-1/4 size-[720px] rounded-full opacity-70"
          style={{
            background:
              "radial-gradient(circle, rgba(232,180,74,0.055) 0%, transparent 60%)",
          }}
        />
        <div className="bg-blueprint absolute inset-0" />
        {/* slow radar conic sweep */}
        <div
          className="animate-radar-slow absolute -right-48 top-1/2 size-[760px] -translate-y-1/2 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, rgba(232,180,74,0.10), rgba(232,180,74,0.02) 55deg, transparent 75deg)",
            maskImage:
              "radial-gradient(circle, black 0%, black 52%, transparent 72%)",
            WebkitMaskImage:
              "radial-gradient(circle, black 0%, black 52%, transparent 72%)",
          }}
        />
        <Spotlight radius={620} color="rgba(232,180,74,0.06)" />
        <div className="noise" />
      </div>

      {/* ---- content ---- */}
      <div className="relative mx-auto grid w-full max-w-7xl flex-1 items-center gap-14 px-4 pb-20 pt-32 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:pt-24">
        {/* left: copy */}
        <div className="flex flex-col items-start gap-6">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
          >
            <MonoLabel gold className="border border-gold/25 bg-gold/5 px-2.5 py-1.5">
              [ <ScrambleText text={t.hero.eyebrow} speed={22} startDelay={350} /> ]
            </MonoLabel>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease }}
            className="font-display text-5xl font-bold leading-[1.02] tracking-tight text-foreground sm:text-6xl lg:text-7xl xl:text-[5.25rem]"
          >
            {t.hero.titleA}{" "}
            <span className="text-glow italic text-gold">{t.hero.titleB}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease }}
            className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            {t.hero.sub}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease }}
            className="mt-2 flex flex-wrap items-center gap-3"
          >
            <Magnetic strength={0.22}>
              <Button
                onClick={hire}
                className="btn-shine h-12 bg-primary px-7 font-mono text-[12px] uppercase tracking-[0.14em] text-primary-foreground shadow-[0_0_28px_-6px_rgba(232,180,74,0.5)] hover:bg-gold-pale hover:shadow-[0_0_36px_-4px_rgba(232,180,74,0.65)]"
              >
                {t.hero.ctaPrimary}
              </Button>
            </Magnetic>
            <Button
              asChild
              variant="ghost"
              className="h-12 border border-border bg-transparent px-6 font-mono text-[12px] uppercase tracking-[0.14em] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <a href="#preview">
                {t.hero.ctaSecondary} <ArrowDown className="size-3.5" />
              </a>
            </Button>
          </motion.div>
        </div>

        {/* right: radar orb */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.25, ease }}
          className="relative mx-auto flex items-center justify-center py-8 lg:py-0"
        >
          {/* pulse rings */}
          <span
            aria-hidden
            className="animate-pulse-ring absolute size-[300px] rounded-full border border-gold/25 sm:size-[380px]"
          />
          <span
            aria-hidden
            className="animate-pulse-ring absolute size-[300px] rounded-full border border-gold/15 [animation-delay:1.2s] sm:size-[380px]"
          />
          <span
            aria-hidden
            className="absolute size-[300px] rounded-full border border-border sm:size-[380px]"
          />

          {/* orb image in circular frame — mouse-parallaxed */}
          <motion.div
            style={reduced ? undefined : { x: orbX, y: orbY }}
            className="relative size-[280px] overflow-hidden rounded-full border border-gold/20 shadow-[0_0_80px_-20px_rgba(232,180,74,0.4)] sm:size-[340px]"
          >
            <Image
              src="/radar-orb.png"
              alt="Wakeel radar — scanning your operation"
              fill
              priority
              sizes="(max-width: 640px) 280px, 340px"
              className="object-cover"
            />
            <div
              aria-hidden
              className="animate-radar absolute inset-0 rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, rgba(232,180,74,0.22), transparent 70deg)",
              }}
            />
            <div
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                boxShadow:
                  "inset 0 0 60px rgba(10,9,8,0.9), inset 0 0 12px rgba(232,180,74,0.15)",
              }}
            />
            <span aria-hidden className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow-[0_0_12px_rgba(232,180,74,0.9)]" />
          </motion.div>

          {/* floating status chips */}
          {CHIPS_META.map((chip) => (
            <motion.div
              key={chip.key}
              animate={{ y: [0, -9, 0] }}
              transition={{
                duration: chip.duration,
                delay: chip.delay,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className={`absolute z-10 ${chip.className}`}
            >
              <span className="flex items-center gap-1.5 rounded-sm border border-gold/25 bg-card/90 px-2 py-1 font-mono text-[10px] tracking-[0.14em] text-gold backdrop-blur-sm">
                <Radar className="size-3" />
                {t.hero[chip.key]}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* ---- stats strip ---- */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="relative border-t border-border bg-background/60 backdrop-blur-sm"
      >
        <div className="mx-auto grid max-w-7xl grid-cols-2 md:grid-cols-4">
          {STATS_META.map((stat, i) => (
            <div
              key={stat.key}
              className={`group flex flex-col gap-1 px-5 py-6 transition-colors sm:px-8 ${
                i > 0 ? "border-s border-border/70" : ""
              } ${i >= 2 ? "border-t border-border/70 md:border-t-0" : ""}`}
            >
              <CountUp
                value={stat.value}
                decimals={stat.decimals}
                suffix={stat.suffix}
                className="font-display text-2xl font-bold text-foreground transition-colors group-hover:text-gold sm:text-3xl"
              />
              <MonoLabel>{t.hero[stat.key]}</MonoLabel>
              {/* stat underline draws in on hover */}
              <span
                aria-hidden
                className="mt-1 h-px max-w-10 origin-left bg-gradient-to-r from-gold to-transparent transition-transform duration-500 group-hover:max-w-full rtl:origin-right"
              />
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
