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

interface Capability {
  icon: LucideIcon;
  title: string;
  copy: string;
}

const CAPABILITIES: Capability[] = [
  {
    icon: Radar,
    title: "System Discovery",
    copy: "Real web research pointed at your company URL maps every system you already run — with category, capabilities and a confidence score.",
  },
  {
    icon: Hammer,
    title: "System Forging",
    copy: "Describe any tool you need in plain language. Wakeel forges a working system with entities, typed fields and automations in one pass.",
  },
  {
    icon: Bot,
    title: "Agent Dock",
    copy: "Chat with your employee. It knows your systems, your records and everything that happened in the ledger this week — and answers in character.",
  },
  {
    icon: Database,
    title: "Structured Records",
    copy: "Every forged system is a real mini-app: typed fields, CRUD records, persisted in your workspace. Not a mockup — actual software.",
  },
  {
    icon: Activity,
    title: "Ops Ledger",
    copy: "Every scan, forge, adoption and edit is logged to a mission-control ledger. Nothing your AI employee does happens in the dark.",
  },
  {
    icon: ShieldCheck,
    title: "Scoped by Design",
    copy: "Per-operator workspaces. Your systems, your records, your trail — nothing shared across operators, nothing leaked.",
  },
];

export function Capabilities() {
  return (
    <section id="capabilities" className="relative scroll-mt-20 py-24 sm:py-32">
      {/* faint blueprint backdrop */}
      <div className="bg-blueprint pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="CAPABILITIES"
          title={
            <>
              An employee with a
              <span className="text-gold"> full toolkit.</span>
            </>
          }
          copy="Six operating capabilities, one console. Wakeel is not a chatbot with plugins — it is staff."
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
