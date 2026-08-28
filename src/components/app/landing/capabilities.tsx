"use client";

import {
  Activity,
  Bot,
  Database,
  Hammer,
  Radar,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  SectionHeading,
  Stagger,
  StaggerItem,
  TiltCard,
} from "@/components/app/motion-bits";
import { useT } from "@/lib/i18n";

interface Capability {
  icon: LucideIcon;
  title: string;
  copy: string;
}

export function Capabilities() {
  const t = useT();
  const CAPABILITIES: Capability[] = [
    { icon: Radar, title: t.caps.c1t, copy: t.caps.c1c },
    { icon: Hammer, title: t.caps.c2t, copy: t.caps.c2c },
    { icon: Bot, title: t.caps.c3t, copy: t.caps.c3c },
    { icon: Database, title: t.caps.c4t, copy: t.caps.c4c },
    { icon: Activity, title: t.caps.c5t, copy: t.caps.c5c },
    { icon: ShieldCheck, title: t.caps.c6t, copy: t.caps.c6c },
  ];
  return (
    <section id="capabilities" className="relative scroll-mt-20 py-24 sm:py-32">
      {/* faint blueprint backdrop */}
      <div className="bg-blueprint pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow={t.caps.eyebrow}
          title={
            <>
              {t.caps.titleA}
              <span className="text-gold">{t.caps.titleB}</span>
            </>
          }
          copy={t.caps.copy}
        />

        <Stagger className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" gap={0.09}>
          {CAPABILITIES.map((cap, i) => (
            <StaggerItem key={cap.title}>
              <TiltCard max={4} className="h-full">
                <motion.div
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  onMouseMove={(e) => {
                    // cursor-tracked glow — CSS vars, zero re-renders
                    const r = e.currentTarget.getBoundingClientRect();
                    e.currentTarget.style.setProperty("--gx", `${e.clientX - r.left}px`);
                    e.currentTarget.style.setProperty("--gy", `${e.clientY - r.top}px`);
                  }}
                  className="group relative flex h-full flex-col gap-4 overflow-hidden border border-border bg-card p-6 transition-colors hover:border-gold/35"
                >
                  {/* cursor spotlight inside the card */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background:
                        "radial-gradient(240px circle at var(--gx, 50%) var(--gy, 50%), rgba(232,180,74,0.10), transparent 62%)",
                    }}
                  />
                  {/* top hairline sweeps gold on hover */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-px origin-center scale-x-0 bg-gradient-to-r from-transparent via-gold/80 to-transparent transition-transform duration-500 group-hover:scale-x-100"
                  />
                  <div className="relative flex size-10 items-center justify-center rounded-sm border border-border bg-secondary text-muted-foreground transition-all duration-300 group-hover:border-gold/50 group-hover:text-gold group-hover:shadow-[0_0_18px_-4px_rgba(232,180,74,0.45)]">
                    <cap.icon className="size-5 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6" />
                  </div>
                  <div className="relative flex flex-col gap-1.5">
                    <h3 className="font-mono text-[12px] font-medium uppercase tracking-[0.16em] text-foreground transition-colors group-hover:text-gold">
                      {cap.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {cap.copy}
                    </p>
                  </div>
                  {/* index ghost number */}
                  <span
                    aria-hidden
                    className="ghost-number pointer-events-none absolute -bottom-3 end-3 font-display text-6xl font-bold opacity-40 transition-opacity duration-300 group-hover:opacity-90"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </motion.div>
              </TiltCard>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
