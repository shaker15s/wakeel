"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Hammer, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CategoryChip,
  EmptyState,
  OriginBadge,
  systemIcon,
  timeAgo,
} from "@/components/app/bits";
import { MonoLabel } from "@/components/app/motion-bits";
import {
  forgeSystem,
  getSystems,
  parseBlueprint,
  parseRecordData,
  recordCount,
} from "@/lib/api-client";
import type { AiSystem } from "@/lib/api-client";
import { recCount, useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";

const ANVIL_ART = `   ┌─────────────┐
   │  ▚▚  ▞▞  ▚▚ │
 ┌─┴─────────────┴─┐
 │  FORGE STANDBY  │
 └─────────────────┘`;

/** Sequential mono status lines while the forge runs. */
function ForgeProgress({ stages }: { stages: string[] }) {
  return (
    <div className="flex items-start gap-5 rounded-lg border border-border bg-card p-5">
      <div className="relative size-20 shrink-0" aria-hidden>
        <span className="absolute inset-0 rounded-sm border border-gold/30" />
        <span className="absolute inset-3 rounded-sm border border-gold/15" />
        <Hammer className="absolute inset-0 m-auto size-6 text-gold" />
        <span
          className="animate-scan-line absolute inset-x-0 top-0 h-[2px] bg-gold/70 shadow-[0_0_10px_rgba(232,180,74,0.8)]"
          style={{ animationDuration: "1.6s" }}
        />
      </div>
      <ul className="flex flex-col gap-1.5 pt-1">
        {stages.map((stage, i) => (
          <motion.li
            key={stage}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className={
              i === stages.length - 1
                ? "font-mono text-[12px] tracking-[0.06em] text-gold"
                : "font-mono text-[12px] tracking-[0.06em] text-muted-foreground"
            }
          >
            <span className="me-2 text-live">▸</span>
            {stage}
            {i === stages.length - 1 && (
              <span className="animate-blink ms-1 text-gold">▌</span>
            )}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/** Reveal card for the freshly forged system + its blueprint. */
function ForgeReveal({ system }: { system: AiSystem }) {
  const t = useT();
  const openSystemDetail = useWakeel((s) => s.openSystemDetail);
  const Icon = systemIcon(system.icon);
  const blueprint = parseBlueprint(system.blueprint);

  return (
    <motion.section
      key={system.id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="corner-frame flex flex-col gap-4 border border-gold/40 bg-card p-5"
      aria-label={t.forge.resultLabel}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-sm border border-gold/40 bg-gold/10 text-gold shadow-[0_0_24px_rgba(232,180,74,0.25)]">
            {/* eslint-disable-next-line react-hooks/static-components -- existing lucide icon reference, not a render-created component */}
            <Icon className="size-6" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-display text-lg font-bold text-foreground">
                {system.name}
              </p>
              <OriginBadge origin={system.origin} />
              <CategoryChip category={system.category} />
            </div>
            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
              {system.description}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => openSystemDetail(system.id)}
          className="h-11 min-h-11 gap-1.5 bg-primary font-mono text-[10px] uppercase tracking-[0.14em] text-primary-foreground hover:bg-gold-pale md:h-8 md:min-h-0"
        >
          {t.forge.openSystem} <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
        </Button>
      </div>

      {blueprint.summary && (
        <p className="border-s-2 border-gold/40 ps-3 text-[13px] leading-relaxed text-muted-foreground">
          {blueprint.summary}
        </p>
      )}

      {blueprint.fields.length > 0 && (
        <div className="flex flex-col gap-2">
          <MonoLabel className="text-[9px]">
            {t.forge.entityFields(blueprint.fields.length)}
          </MonoLabel>
          <div className="flex flex-wrap gap-1.5">
            {blueprint.fields.map((f) => (
              <span
                key={f.key}
                className="rounded-sm border border-border bg-secondary px-2 py-1 font-mono text-[10px] tracking-[0.06em] text-foreground/80"
              >
                {f.label}
                <span className="ms-1.5 text-gold/70" dir="ltr">{f.type.toUpperCase()}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {blueprint.sampleRecords.length > 0 && (
        <div className="flex flex-col gap-2">
          <MonoLabel className="text-[9px]">{t.forge.sampleRecords}</MonoLabel>
          <div className="overflow-x-auto rounded-sm border border-border/70" dir="ltr">
            <table className="w-full min-w-[480px] border-collapse font-mono text-[11px]">
              <thead>
                <tr className="border-b border-border/70 bg-secondary/60 text-left">
                  {blueprint.fields.slice(0, 4).map((f) => (
                    <th
                      key={f.key}
                      className="px-3 py-2 font-medium uppercase tracking-[0.1em] text-muted-foreground"
                    >
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {blueprint.sampleRecords.slice(0, 3).map((rec, ri) => (
                  <tr key={ri} className="border-b border-border/40 last:border-0">
                    {blueprint.fields.slice(0, 4).map((f) => {
                      const value = parseRecordData(rec)[f.key];
                      return (
                        <td key={f.key} className="px-3 py-2 text-foreground/70">
                          {value == null || value === ""
                            ? "—"
                            : String(value).slice(0, 28)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {blueprint.automations.length > 0 && (
        <div className="flex flex-col gap-2">
          <MonoLabel className="text-[9px]">{t.forge.automations}</MonoLabel>
          <ul className="flex flex-col gap-1.5">
            {blueprint.automations.map((a, i) => (
              <li
                key={i}
                className="flex items-start gap-2 font-mono text-[11px] text-muted-foreground"
              >
                <Sparkles className="mt-0.5 size-3 shrink-0 text-gold" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.section>
  );
}

export function ForgeView() {
  const t = useT();
  const lang = useWakeel((s) => s.lang);
  const userId = useWakeel((s) => s.userId);
  const lastForge = useWakeel((s) => s.lastForge);
  const setLastForge = useWakeel((s) => s.setLastForge);
  const queryClient = useQueryClient();

  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stageCount, setStageCount] = useState(0);

  const { data: systemsData, isLoading } = useQuery({
    queryKey: ["systems", userId],
    queryFn: () => getSystems(userId!),
    enabled: !!userId,
    refetchInterval: 30_000,
  });
  const forged = (systemsData?.systems ?? [])
    .filter((s) => s.origin === "CREATED")
    .slice(0, 5);

  const mutation = useMutation({
    mutationFn: () => forgeSystem({ userId: userId!, prompt: prompt.trim() }),
    onSuccess: (data) => {
      setLastForge(data.system);
      queryClient.invalidateQueries({ queryKey: ["systems", userId] });
      queryClient.invalidateQueries({ queryKey: ["activity", userId] });
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
      toast.success(t.forge.toastOk, {
        description: t.forge.toastOkDesc(data.system.name),
      });
      setPrompt("");
    },
    onError: (err: Error) => {
      toast.error(t.forge.toastErr, { description: err.message });
    },
  });

  // advance the mono pipeline stages while the real request is in flight
  // (submit() seeds stage 1; the interval — an external timer — advances the rest)
  useEffect(() => {
    if (!mutation.isPending) return;
    const FORGE_STAGES = [t.forge.stage1, t.forge.stage2, t.forge.stage3, t.forge.stage4];
    const timer = setInterval(() => {
      setStageCount((c) => Math.min(c + 1, FORGE_STAGES.length));
    }, 1500);
    return () => clearInterval(timer);
  }, [mutation.isPending, t]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim().length < 4) {
      setError(t.forge.errBrief);
      return;
    }
    setError(null);
    setStageCount(1);
    mutation.mutate();
  };

  const forgeStages = [t.forge.stage1, t.forge.stage2, t.forge.stage3, t.forge.stage4];
  const PROMPT_EXAMPLES = [t.forge.ex1, t.forge.ex2, t.forge.ex3, t.forge.ex4];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <MonoLabel gold>[ {t.forge.eyebrow} ]</MonoLabel>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {t.forge.title}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t.forge.sub}
        </p>
      </div>

      {/* prompt form */}
      <form
        onSubmit={submit}
        noValidate
        className="corner-frame flex flex-col gap-4 border border-border bg-card p-5"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="forge-prompt"
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
          >
            {t.forge.brief}
          </label>
          <Textarea
            id="forge-prompt"
            placeholder={t.forge.briefPh}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={!!error}
            disabled={mutation.isPending}
            rows={4}
            className="resize-none border-border bg-secondary/60 focus-visible:ring-gold/50"
          />
          {error && (
            <p className="font-mono text-[11px] text-destructive">⚠ {error}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5" aria-label={t.forge.examplesLabel}>
          {PROMPT_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              disabled={mutation.isPending}
              onClick={() => {
                setPrompt(example);
                setError(null);
              }}
              className="rounded-full border border-border bg-secondary px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 md:py-1.5"
            >
              {example}
            </button>
          ))}
        </div>

        <Button
          type="submit"
          disabled={mutation.isPending}
          className="h-11 bg-primary font-mono text-[11px] uppercase tracking-[0.14em] text-primary-foreground hover:bg-gold-pale"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="animate-spin" /> {t.forge.forging}
            </>
          ) : (
            <>
              <Hammer className="size-4" /> {t.forge.forgeBtn}
            </>
          )}
        </Button>
      </form>

      {/* in-flight pipeline */}
      {mutation.isPending && <ForgeProgress stages={forgeStages.slice(0, stageCount)} />}

      {/* inline error */}
      {mutation.isError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-destructive">
            {t.forge.errTitle}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{mutation.error.message}</p>
        </div>
      )}

      {/* reveal */}
      <AnimatePresence>
        {lastForge && !mutation.isPending && (
          <ForgeReveal system={lastForge} />
        )}
      </AnimatePresence>

      {/* recent forges */}
      <section className="flex flex-col gap-3" aria-label={t.forge.recentLabel}>
        <MonoLabel>{t.forge.recent}</MonoLabel>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : forged.length === 0 ? (
          <EmptyState
            art={ANVIL_ART}
            title={t.forge.coldT}
            copy={t.forge.coldC}
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {forged.map((system, i) => {
              const Icon = systemIcon(system.icon);
              const count = recordCount(system);
              return (
                <button
                  key={system.id}
                  onClick={() => useWakeel.getState().openSystemDetail(system.id)}
                  className={
                    "flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-start transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60" +
                    (i > 0 ? " border-t border-border/60" : "")
                  }
                >
                  <Icon className="size-4 shrink-0 text-gold" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground" dir="auto">
                    {system.name}
                  </span>
                  <CategoryChip category={system.category} className="hidden sm:inline-flex" />
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground" dir="ltr">
                    {count != null ? recCount(count, lang) : "—"}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground" dir="ltr">
                    {timeAgo(system.createdAt, lang)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
