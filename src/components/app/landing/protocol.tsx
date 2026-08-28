"use client";

import { motion } from "framer-motion";
import { SectionHeading } from "@/components/app/motion-bits";
import { useT } from "@/lib/i18n";

export function Protocol() {
  const t = useT();
  const STEPS = [
    { num: "01", title: t.protocol.s1t, copy: t.protocol.s1c },
    { num: "02", title: t.protocol.s2t, copy: t.protocol.s2c },
    { num: "03", title: t.protocol.s3t, copy: t.protocol.s3c },
  ];

  return (
    <section id="protocol" className="relative scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow={t.protocol.eyebrow}
          title={
            <>
              {t.protocol.titleA}
              <span className="text-gold">{t.protocol.titleB}</span>
            </>
          }
          copy={t.protocol.copy}
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
                className="mt-auto h-px w-10 bg-gradient-to-r from-gold/60 to-transparent rtl:bg-gradient-to-l"
              />
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
