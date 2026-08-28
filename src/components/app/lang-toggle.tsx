"use client";

import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Bilingual toggle: EN ⇄ ع. Two-segment pill, active side gold-filled.
 * Used on the landing nav and in the console status bar.
 */
export function LangToggle({ className }: { className?: string }) {
  const lang = useWakeel((s) => s.lang);
  const setLang = useWakeel((s) => s.setLang);

  return (
    <div
      role="group"
      aria-label="Language / اللغة"
      className={cn(
        "flex h-8 items-center rounded-sm border border-border bg-transparent p-0.5 font-mono text-[10px] uppercase tracking-[0.08em]",
        className
      )}
    >
      <button
        type="button"
        aria-pressed={lang === "en"}
        onClick={() => setLang("en")}
        className={cn(
          "flex h-7 min-w-7 items-center justify-center rounded-[3px] px-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          lang === "en"
            ? "bg-gold text-[#0A0908] font-medium"
            : "text-muted-foreground hover:text-gold"
        )}
      >
        EN
      </button>
      <button
        type="button"
        aria-pressed={lang === "ar"}
        onClick={() => setLang("ar")}
        className={cn(
          "flex h-7 min-w-7 items-center justify-center rounded-[3px] px-1.5 font-arabic text-[12px] leading-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          lang === "ar"
            ? "bg-gold text-[#0A0908] font-semibold"
            : "text-muted-foreground hover:text-gold"
        )}
      >
        ع
      </button>
    </div>
  );
}
