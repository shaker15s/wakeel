"use client";

import { HealthBar } from "@/components/app/bits";
import { WakeelMark } from "@/components/app/logo";
import { MonoLabel, Reveal, SectionHeading } from "@/components/app/motion-bits";

const MOCK_SYSTEMS = [
  { name: "Sage ERP", category: "ERP", health: 92, origin: "DISCOVERED" },
  { name: "HubSpot CRM", category: "CRM", health: 78, origin: "DISCOVERED" },
  { name: "Inventory Pro", category: "OPS", health: 96, origin: "FORGED" },
  { name: "Leave Tracker", category: "HR", health: 88, origin: "FORGED" },
];

const MOCK_CHAT = [
  {
    role: "agent" as const,
    text: "Low-stock sweep done. 3 items under threshold in Inventory Pro — shall I draft purchase orders?",
    time: "18:42",
  },
  {
    role: "user" as const,
    text: "Yes, and ping the warehouse channel when they're sent.",
    time: "18:43",
  },
  {
    role: "agent" as const,
    text: "Drafted 3 POs. Wired the alert → warehouse channel automation. Logged to ledger.",
    time: "18:43",
  },
];

export function ConsolePreview() {
  return (
    <section id="preview" className="relative scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="CONSOLE"
          title={
            <>
              Mission control for
              <span className="text-gold"> your operation.</span>
            </>
          }
          copy="Discovery, forged systems, records and a live ops ledger — with your AI employee one keystroke away in the agent dock."
        />

        <Reveal className="mt-16">
          <div className="corner-frame mx-auto max-w-4xl border border-border bg-card">
            {/* window chrome */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="flex gap-1.5" aria-hidden>
                <span className="size-2.5 rounded-full bg-destructive/70" />
                <span className="size-2.5 rounded-full bg-gold/70" />
                <span className="size-2.5 rounded-full bg-live/70" />
              </span>
              <span className="mx-auto rounded-sm border border-border bg-background px-3 py-1 font-mono text-[11px] tracking-[0.08em] text-muted-foreground">
                wakeel://console
              </span>
              <span className="w-10" aria-hidden />
            </div>

            {/* body */}
            <div className="relative overflow-hidden">
              <div
                aria-hidden
                className="animate-scan-line absolute left-0 h-px w-full bg-gold/40 shadow-[0_0_12px_rgba(232,180,74,0.6)]"
              />
              <div className="scan-lines grid gap-px bg-border p-4 md:grid-cols-5 md:p-6">
                {/* systems mini table */}
                <div className="bg-card p-4 md:col-span-3">
                  <div className="mb-3 flex items-center justify-between">
                    <MonoLabel gold>SYSTEMS MAP</MonoLabel>
                    <MonoLabel>4 ACTIVE</MonoLabel>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-border pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                    <span>System</span>
                    <span>Origin</span>
                    <span className="w-20 text-right">Health</span>
                  </div>
                  {MOCK_SYSTEMS.map((sys) => (
                    <div
                      key={sys.name}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-border/60 py-2.5 last:border-0"
                    >
                      <div className="flex items-center gap-2.5">
                        <WakeelMark className="size-4 text-gold/70" strokeWidth={2} />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">
                            {sys.name}
                          </span>
                          <MonoLabel className="text-[9px]">{sys.category}</MonoLabel>
                        </div>
                      </div>
                      <span
                        className={`rounded-sm px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em] ${
                          sys.origin === "FORGED"
                            ? "bg-gold text-[#0A0908]"
                            : "border border-gold/50 text-gold"
                        }`}
                      >
                        {sys.origin}
                      </span>
                      <div className="flex w-20 flex-col items-end gap-1">
                        <HealthBar value={sys.health} />
                        <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                          {sys.health}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* chat snippet */}
                <div className="flex flex-col gap-3 bg-card p-4 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <MonoLabel gold>AGENT DOCK</MonoLabel>
                    <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-live">
                      <span className="size-1.5 rounded-full bg-live shadow-[0_0_6px_rgba(62,207,142,0.8)]" />
                      ON DUTY
                    </span>
                  </div>
                  {MOCK_CHAT.map((msg, i) => (
                    <div
                      key={i}
                      className={
                        msg.role === "user"
                          ? "self-end rounded-md rounded-br-none border border-gold/25 bg-gold/10 px-3 py-2 text-[12px] leading-snug text-foreground"
                          : "self-start rounded-md rounded-bl-none border border-border bg-secondary px-3 py-2 text-[12px] leading-snug text-foreground/90"
                      }
                    >
                      <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                        {msg.role === "user" ? "OPERATOR" : "WAKEEL"} · {msg.time}
                      </p>
                      {msg.text}
                    </div>
                  ))}
                  <div className="mt-auto flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                    <span className="font-mono text-[11px] text-muted-foreground/60">
                      Message Wakeel…
                    </span>
                    <span className="animate-blink ml-auto font-mono text-gold">
                      ▌
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
