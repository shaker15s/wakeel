"use client";

import { WakeelMark } from "@/components/app/logo";
import { useT } from "@/lib/i18n";

/** Minimal boot splash shown while localStorage identity is hydrated. */
export function AppShellSkeleton() {
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background">
      <div className="relative">
        <span className="absolute inset-0 animate-pulse-ring rounded-full border border-gold/30" />
        <WakeelMark className="size-10 text-gold" />
      </div>
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        <span className="animate-blink text-gold">●</span> {t.boot.booting}
      </p>
    </div>
  );
}
