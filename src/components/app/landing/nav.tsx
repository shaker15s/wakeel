"use client";

import { motion } from "framer-motion";
import { WakeelLogo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { useWakeel } from "@/lib/store";

const LINKS = [
  { href: "#capabilities", label: "Capabilities" },
  { href: "#protocol", label: "Protocol" },
  { href: "#preview", label: "Console" },
];

export function Nav() {
  const setOnboardingOpen = useWakeel((s) => s.setOnboardingOpen);
  const userId = useWakeel((s) => s.userId);
  const setView = useWakeel((s) => s.setView);

  const enter = () => {
    if (userId) setView("console");
    else setOnboardingOpen(true);
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-40 border-b border-border bg-background/70 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <a href="#top" aria-label="Wakeel — back to top">
          <WakeelLogo />
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-gold"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Button
          onClick={enter}
          className="h-9 bg-primary font-mono text-[11px] uppercase tracking-[0.14em] text-primary-foreground hover:bg-gold-pale"
        >
          Enter Console
        </Button>
      </div>
    </motion.header>
  );
}
