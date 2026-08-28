"use client";

import { motion, useScroll, useSpring } from "framer-motion";
import { WakeelLogo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { LangToggle } from "@/components/app/lang-toggle";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";

export function Nav() {
  const t = useT();
  const lang = useWakeel((s) => s.lang);
  const setOnboardingOpen = useWakeel((s) => s.setOnboardingOpen);
  const userId = useWakeel((s) => s.userId);
  const setView = useWakeel((s) => s.setView);

  // gold reading-progress bar pinned to the very top of the viewport
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 26,
    restDelta: 0.001,
  });

  const enter = () => {
    if (userId) setView("console");
    else setOnboardingOpen(true);
  };

  const LINKS = [
    { href: "#capabilities", label: t.nav.capabilities },
    { href: "#protocol", label: t.nav.protocol },
    { href: "#preview", label: t.nav.console },
  ];

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-40 border-b border-border bg-background/70 backdrop-blur-md"
    >
      {/* scroll progress — origin flips with reading direction */}
      <motion.div
        aria-hidden
        style={{ scaleX: progress, originX: lang === "ar" ? 1 : 0 }}
        className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-gold-deep via-gold to-gold-pale shadow-[0_0_12px_rgba(232,180,74,0.55)]"
      />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="#top" aria-label="Wakeel — back to top">
          <WakeelLogo />
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="nav-underline relative font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-gold"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <LangToggle />
          <Button
            onClick={enter}
            className="btn-shine h-9 bg-primary font-mono text-[11px] uppercase tracking-[0.14em] text-primary-foreground hover:bg-gold-pale"
          >
            {t.nav.enter}
          </Button>
        </div>
      </div>
    </motion.header>
  );
}
