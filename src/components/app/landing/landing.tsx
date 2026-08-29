"use client";

import { Capabilities } from "@/components/app/landing/capabilities";
import { ConsolePreview } from "@/components/app/landing/console-preview";
import { Footer } from "@/components/app/landing/footer";
import { Hero } from "@/components/app/landing/hero";
import { Nav } from "@/components/app/landing/nav";
import { OpsTicker } from "@/components/app/landing/ticker";
import { Protocol } from "@/components/app/landing/protocol";
import { Button } from "@/components/ui/button";
import {
  Magnetic,
  MonoLabel,
  Reveal,
  Spotlight,
} from "@/components/app/motion-bits";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";

export function Landing() {
  const t = useT();
  const setOnboardingOpen = useWakeel((s) => s.setOnboardingOpen);
  const userId = useWakeel((s) => s.userId);
  const session = useWakeel((s) => s.session);
  const setView = useWakeel((s) => s.setView);

  const hire = () => {
    if (session) {
      if (userId) setView("console");
      else setOnboardingOpen(true);
    } else {
      // unauthenticated → AppShell swaps the console view for the auth gate
      setView("console");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* keyboard operators can jump straight past the nav */}
      <a href="#main-content" className="skip-link border border-gold/40 bg-card px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-gold shadow-[0_0_24px_-6px_rgba(232,180,74,0.6)]">
        {t.common.skip}
      </a>
      <Nav />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <Hero />
        <OpsTicker />
        <Protocol />
        <Capabilities />
        <ConsolePreview />

        {/* final CTA band */}
        <section className="relative overflow-hidden py-28 sm:py-36">
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60"
            style={{
              background:
                "radial-gradient(circle, rgba(232,180,74,0.10) 0%, transparent 62%)",
            }}
          />
          <div className="bg-blueprint pointer-events-none absolute inset-0 opacity-50" aria-hidden />
          <Spotlight radius={560} color="rgba(232,180,74,0.05)" />
          <div className="noise" aria-hidden />
          <Reveal className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 text-center">
            <MonoLabel gold>[ {t.cta.eyebrow} ]</MonoLabel>
            <h2 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {t.cta.titleA}
              <span className="text-glow text-gold">{t.cta.titleB}</span>
            </h2>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
              {t.cta.copy}
            </p>
            <Magnetic strength={0.24}>
              <Button
                onClick={hire}
                size="lg"
                className="btn-shine h-12 bg-primary px-8 font-mono text-[12px] uppercase tracking-[0.14em] text-primary-foreground shadow-[0_0_28px_-6px_rgba(232,180,74,0.5)] hover:bg-gold-pale"
              >
                {t.cta.button}
              </Button>
            </Magnetic>
          </Reveal>
        </section>
      </main>
      <Footer />
    </div>
  );
}
