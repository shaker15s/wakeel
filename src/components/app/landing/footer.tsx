"use client";

import { WakeelLogo } from "@/components/app/logo";
import { MonoLabel } from "@/components/app/motion-bits";
import { useT } from "@/lib/i18n";

export function Footer() {
  const t = useT();

  const PRODUCT_LINKS = [
    { href: "#capabilities", label: t.footer.lCapabilities },
    { href: "#preview", label: t.footer.lConsole },
    { href: "#top", label: t.footer.lAgentDock },
  ];

  const PROTOCOL_LINKS = [
    { href: "#protocol", label: t.footer.lOnboard },
    { href: "#protocol", label: t.footer.lDiscover },
    { href: "#protocol", label: t.footer.lForge },
  ];

  return (
    <footer className="mt-auto border-t border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          {/* brand */}
          <div className="flex flex-col gap-3">
            <WakeelLogo />
            <p className="font-arabic text-[15px] text-gold" dir="rtl">
              {t.footer.tagline}
            </p>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t.footer.blurb}
            </p>
          </div>

          {/* product */}
          <div className="flex flex-col gap-3">
            <MonoLabel>{t.footer.product}</MonoLabel>
            <ul className="flex flex-col gap-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-gold"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* protocol */}
          <div className="flex flex-col gap-3">
            <MonoLabel>{t.footer.protocolCol}</MonoLabel>
            <ul className="flex flex-col gap-2.5">
              {PROTOCOL_LINKS.map((link, i) => (
                <li key={i}>
                  <a
                    href={link.href}
                    className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-gold"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* status */}
          <div className="flex flex-col gap-3">
            <MonoLabel>{t.footer.status}</MonoLabel>
            <p className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.12em] text-live">
              <span className="size-2 rounded-full bg-live shadow-[0_0_8px_rgba(62,207,142,0.9)]" />
              {t.footer.allSystems}
            </p>
            <div className="flex flex-col gap-1 font-mono text-[11px] tracking-[0.08em] text-muted-foreground">
              <span dir="ltr">{t.footer.uptime}</span>
              <span dir="ltr">{t.footer.meanResp}</span>
              <span dir="ltr">{t.footer.lastSweep}</span>
            </div>
          </div>
        </div>
      </div>

      {/* bottom hairline row */}
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 sm:flex-row sm:px-6">
          <p className="text-[12px] text-muted-foreground">{t.footer.rights}</p>
          <MonoLabel>{t.footer.builtFor}</MonoLabel>
        </div>
      </div>
    </footer>
  );
}
