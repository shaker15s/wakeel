"use client";

import { useT } from "@/lib/i18n";

function TickerRow({ items, hidden = false }: { items: string[]; hidden?: boolean }) {
  return (
    <div aria-hidden={hidden} className="flex shrink-0 items-center">
      {items.map((item, i) => (
        <span
          key={i}
          className="flex shrink-0 items-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
        >
          <span className="text-live">●</span>
          <span className="ms-2.5">{item}</span>
          <span className="mx-8 text-gold">✦</span>
        </span>
      ))}
    </div>
  );
}

/** Live-ops marquee strip. Pauses on hover. */
export function OpsTicker() {
  const t = useT();
  return (
    <div className="group ticker-hover relative overflow-hidden border-y border-border bg-card/40 py-3.5">
      <div className="animate-ticker flex w-max group-hover:[animation-play-state:paused]">
        <TickerRow items={t.ticker.items} />
        <TickerRow items={t.ticker.items} hidden />
      </div>
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}
