"use client";

import { motion } from "framer-motion";
import { SectionHeading } from "@/components/app/motion-bits";

const STEPS = [
  {
    num: "01",
    title: "ONBOARD",
    copy: "Register your operator profile. Name your workspace. Wakeel wakes up already knowing who you are and what you run — no integrations, no paperwork.",
  },
  {
    num: "02",
    title: "DISCOVER",
    copy: "Point Wakeel at your company URL or describe your stack. Real web research maps every system you already run — CRM, ERP, storage, finance — with confidence scores.",
  },
  {
    num: "03",
    title: "FORGE",
    copy: "Describe any system you need in plain language. Wakeel forges a working mini-app — typed entities, views, automations — materialized live in your workspace.",
  },
];

export function Protocol() {
  return (
    <section id="protocol" className="relative scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="THE PROTOCOL"
          title={
            <>
              Three moves to your
              <span className="text-gold"> first AI hire.</span>
            </>
          }
          copy="No sales calls. No implementation year. Wakeel operates like a real employee — it learns your operation, then it works."
        />

        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <motion.article
              key={step.num}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{
                duration: 0.6,
                delay: i * 0.12,
                ease: [0.22, 1, 0.36, 1],
              }}
              whileHover={{ y: -4 }}
              className="corner-frame corner-frame-hover flex flex-col gap-4 border border-border bg-card p-7"
            >
              <span
                aria-hidden
                className="ghost-number font-mono text-7xl font-medium leading-none"
              >
                {step.num}
              </span>
              <div className="flex flex-col gap-2.5">
                <h3 className="font-mono text-sm font-medium uppercase tracking-[0.2em] text-gold">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.copy}
                </p>
              </div>
              <span
                aria-hidden
                className="mt-auto h-px w-10 bg-gradient-to-r from-gold/60 to-transparent"
              />
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
