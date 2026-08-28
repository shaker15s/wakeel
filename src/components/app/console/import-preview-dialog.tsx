"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, FileJson, Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { systemIcon } from "@/components/app/bits";
import { MonoLabel } from "@/components/app/motion-bits";
import { useT } from "@/lib/i18n";
import type { WorkspacePayload } from "@/lib/workspace-import";
import { cn } from "@/lib/utils";

/**
 * IMPORT PREVIEW — shows exactly what a workspace file contains BEFORE it is
 * restored: operator identity, per-system rows with record counts, and any
 * name collisions with the current workspace. Confirming hands the payload
 * to the parent, which POSTs it and adopts the restored operator.
 */

function fmtDate(iso?: string, lang: string = "en") {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(+d)) return null;
  try {
    return d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

export function ImportPreviewDialog({
  open,
  onOpenChange,
  payload,
  importing,
  currentSystemNames,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: WorkspacePayload | null;
  importing: boolean;
  /** names of systems in the CURRENT workspace — powers collision detection */
  currentSystemNames: string[];
  onConfirm: () => void;
}) {
  const t = useT();

  const summary = useMemo(() => {
    if (!payload) return { systems: 0, records: 0, origins: { CREATED: 0, DISCOVERED: 0 } };
    let records = 0;
    const origins = { CREATED: 0, DISCOVERED: 0 };
    for (const s of payload.systems) {
      if (Array.isArray(s.records)) records += s.records.length;
      origins[s.origin === "DISCOVERED" ? "DISCOVERED" : "CREATED"] += 1;
    }
    return { systems: payload.systems.length, records, origins };
  }, [payload]);

  const collisions = useMemo(() => {
    if (!payload || currentSystemNames.length === 0) return [] as string[];
    const current = new Set(
      currentSystemNames.map((n) => n.trim().toLowerCase())
    );
    return payload.systems
      .map((s) => (typeof s.name === "string" ? s.name : ""))
      .filter((n) => n && current.has(n.trim().toLowerCase()));
  }, [payload, currentSystemNames]);

  const exported = fmtDate(payload?.exportedAt);

  return (
    <Dialog open={open} onOpenChange={(o) => !importing && onOpenChange(o)}>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={!importing}
        className="corner-frame max-w-lg border-border bg-card p-0 shadow-[0_0_90px_-12px_rgba(232,180,74,0.18)]"
      >
        <div className="relative overflow-hidden">
          <div className="bg-blueprint pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative p-5 sm:p-6">
            <DialogHeader className="gap-2 text-start">
              <MonoLabel gold className="animate-blink">
                [ {t.impv.eyebrow} ]
              </MonoLabel>
              <DialogTitle className="font-display text-xl font-bold tracking-tight sm:text-2xl">
                {t.impv.title}
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed">
                {t.impv.desc}
              </DialogDescription>
            </DialogHeader>

            {payload && (
              <div className="mt-4 flex flex-col gap-3.5">
                {/* operator identity */}
                <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-gold/30 bg-gold/10 text-gold">
                    <FileJson className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground" dir="auto">
                      {payload.operator.name}
                    </p>
                    <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground" dir="auto">
                      {payload.operator.workspace}
                      {payload.operator.role ? ` · ${payload.operator.role}` : ""}
                    </p>
                  </div>
                </div>

                {/* summary chips */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <span>
                    {t.impv.statSystems}{" "}
                    <span className="text-gold" dir="ltr">{summary.systems}</span>
                  </span>
                  <span className="h-3 w-px bg-border" aria-hidden />
                  <span>
                    {t.impv.statRecords}{" "}
                    <span className="text-gold" dir="ltr">{summary.records}</span>
                  </span>
                  {exported && (
                    <>
                      <span className="h-3 w-px bg-border" aria-hidden />
                      <span dir="auto">{t.impv.exported} {exported}</span>
                    </>
                  )}
                </div>

                {/* per-system rows */}
                <div className="wakeel-scrollbar flex max-h-56 flex-col overflow-y-auto rounded-lg border border-border bg-background/60">
                  {payload.systems.map((s, i) => {
                    const name = typeof s.name === "string" ? s.name : "—";
                    const Icon = systemIcon(typeof s.icon === "string" ? s.icon : null);
                    const recCount = Array.isArray(s.records) ? s.records.length : 0;
                    const origin = s.origin === "DISCOVERED" ? "DISCOVERED" : "CREATED";
                    const color = typeof s.color === "string" ? s.color : undefined;
                    return (
                      <motion.div
                        key={`${name}-${i}`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.04 * i, duration: 0.25 }}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5",
                          i > 0 && "border-t border-border/60"
                        )}
                      >
                        <span
                          className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-border bg-secondary text-foreground/80"
                          style={color ? { color, borderColor: `${color}55` } : undefined}
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground" dir="auto">
                          {name}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]",
                            origin === "CREATED"
                              ? "bg-gold/10 text-gold"
                              : "bg-secondary text-muted-foreground"
                          )}
                        >
                          {origin === "CREATED" ? t.impv.forged : t.impv.discovered}
                        </span>
                        <span className="w-14 shrink-0 text-end font-mono text-[10px] tabular-nums text-muted-foreground" dir="ltr">
                          {recCount} {t.impv.recShort}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>

                {/* collision warning vs the current workspace */}
                {collisions.length > 0 ? (
                  <div className="flex items-start gap-2.5 rounded-lg border border-gold/40 bg-gold/[0.07] p-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold" />
                    <p className="text-[12px] leading-relaxed text-foreground/90">
                      {t.impv.collisions(collisions.length)}{" "}
                      <span className="font-mono text-[11px] text-gold">
                        {collisions.slice(0, 3).join(" · ")}
                        {collisions.length > 3 ? " …" : ""}
                      </span>
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5 rounded-lg border border-live/30 bg-live/[0.06] p-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-live" />
                    <p className="text-[12px] leading-relaxed text-foreground/90">
                      {t.impv.noCollisions}
                    </p>
                  </div>
                )}

                <p className="font-mono text-[10px] leading-relaxed text-muted-foreground/70">
                  {t.impv.note}
                </p>
              </div>
            )}

            {/* actions */}
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={importing}
                className="h-9 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
              >
                {t.impv.cancel}
              </Button>
              <Button
                size="sm"
                onClick={onConfirm}
                disabled={importing || !payload}
                className="h-9 gap-1.5 bg-primary font-mono text-[10px] uppercase tracking-[0.14em] text-primary-foreground hover:bg-gold-pale"
              >
                {importing ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> {t.impv.importing}
                  </>
                ) : (
                  <>
                    <Upload className="size-3.5" /> {t.impv.confirm}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
