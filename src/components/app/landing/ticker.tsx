"use client";

const ITEMS = [
  "SCAN COMPLETE — 4 SYSTEMS MAPPED FOR NOVA RETAIL",
  "FORGED ‘INVENTORY PRO’ — 6 FIELDS, 3 VIEWS",
  "ADOPTED ‘SAGE ERP’ — CONFIDENCE 94%",
  "RECORD #4821 LOGGED IN ‘CLIENT ONBOARDING’",
  "AUTOMATION WIRED — LOW-STOCK ALERT → EMAIL",
  "OPERATOR LAYLA ACTIVATED WORKSPACE ‘NOVA’",
  "SCAN COMPLETE — 7 SYSTEMS MAPPED FOR ATLAS LOGISTICS",
  "FORGED ‘LEAVE TRACKER’ — 4 FIELDS, 2 AUTOMATIONS",
];

function TickerRow({ hidden = false }: { hidden?: boolean }) {
  return (
    <div aria-hidden={hidden} className="flex shrink-0 items-center">
      {ITEMS.map((item, i) => (
        <span
          key={i}
          className="flex shrink-0 items-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
        >
          <span className="text-live">●</span>
          <span className="ml-2.5">{item}</span>
          <span className="mx-8 text-gold">✦</span>
        </span>
      ))}
    </div>
  );
}

/** Live-ops marquee strip. Pauses on hover. */
export function OpsTicker() {
  return (
    <div className="group relative overflow-hidden border-y border-border bg-card/40 py-3.5">
      <div className="animate-ticker flex w-max group-hover:[animation-play-state:paused]">
        <TickerRow />
        <TickerRow hidden />
      </div>
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}
