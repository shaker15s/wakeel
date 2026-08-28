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
import { SectionHeading } from "@/components/app/motion-bits";
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

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((cap, i) => (
            <motion.div
              key={cap.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.55,
                delay: (i % 3) * 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
              whileHover={{ y: -4 }}
              className="group flex flex-col gap-4 border border-border bg-card p-6 transition-colors hover:border-gold/35"
            >
              <div className="flex size-10 items-center justify-center rounded-sm border border-border bg-secondary text-muted-foreground transition-all duration-300 group-hover:border-gold/50 group-hover:text-gold group-hover:shadow-[0_0_18px_-4px_rgba(232,180,74,0.45)]">
                <cap.icon className="size-5" />
              </div>
              <div className="flex flex-col gap-1.5">
                <h3 className="font-mono text-[12px] font-medium uppercase tracking-[0.16em] text-foreground transition-colors group-hover:text-gold">
                  {cap.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {cap.copy}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
