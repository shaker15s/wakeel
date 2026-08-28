"use client";

import { Capabilities } from "@/components/app/landing/capabilities";
import { ConsolePreview } from "@/components/app/landing/console-preview";
import { Footer } from "@/components/app/landing/footer";
import { Hero } from "@/components/app/landing/hero";
import { Nav } from "@/components/app/landing/nav";
import { OpsTicker } from "@/components/app/landing/ticker";
import { Protocol } from "@/components/app/landing/protocol";
import { Button } from "@/components/ui/button";
import { MonoLabel, Reveal } from "@/components/app/motion-bits";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";

export function Landing() {
  const t = useT();
  const setOnboardingOpen = useWakeel((s) => s.setOnboardingOpen);
  const userId = useWakeel((s) => s.userId);
  const setView = useWakeel((s) => s.setView);

  const hire = () => {
    if (userId) setView("console");
    else setOnboardingOpen(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Nav />
      <main className="flex-1">
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
            <Button
              onClick={hire}
              size="lg"
              className="h-12 bg-primary px-8 font-mono text-[12px] uppercase tracking-[0.14em] text-primary-foreground shadow-[0_0_28px_-6px_rgba(232,180,74,0.5)] hover:bg-gold-pale"
            >
              {t.cta.button}
            </Button>
          </Reveal>
        </section>
      </main>
      <Footer />
    </div>
  );
}
