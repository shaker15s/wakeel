"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ClipboardList,
  Inbox,
  Loader2,
  Radar,
  Send,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { WakeelMark } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getChat, getSystems, generateDigest, seedSystem, sendChat } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { useIsLarge } from "@/lib/use-is-large";
import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";

function msgTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--:--";
  }
}

function olderThanDays(iso: string, days: number) {
  try {
    return Date.now() - +new Date(iso) > days * 86_400_000;
  } catch {
    return false;
  }
}

interface Insight {
  id: string;
  icon: LucideIcon;
  text: string;
  /** when set, clicking the chip EXECUTES the action instead of chatting */
  action?: "seed" | "digest";
  systemId?: string;
}

/** AGENT messages that begin with the digest header render as report cards. */
const DIGEST_HEADERS = ["STATUS DIGEST", "ملخص الحالة"];
function isDigestMessage(content: string) {
  return DIGEST_HEADERS.some((h) => content.startsWith(h));
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 self-start rounded-md rounded-bl-none border border-border bg-secondary px-3 py-2.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
          className="size-1.5 rounded-full bg-gold"
        />
      ))}
    </div>
  );
}

/** Shared chat body for the desktop panel and the mobile sheet. */
function DockBody() {
  const t = useT();
  const lang = useWakeel((s) => s.lang);
  const userId = useWakeel((s) => s.userId);
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);
  /** systems whose proactive digest was already delivered this session */
  const [digested, setDigested] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["chat", userId],
    queryFn: () => getChat(userId!),
    enabled: !!userId,
    refetchInterval: 20_000,
  });
  // workspace snapshot powers the proactive suggestions
  const { data: systemsData } = useQuery({
    queryKey: ["systems", userId],
    queryFn: () => getSystems(userId!),
    enabled: !!userId,
  });

  const messages = data?.messages ?? [];
  const systems = useMemo(() => systemsData?.systems ?? [], [systemsData]);

  /**
   * Proactive, workspace-signal-driven suggestions. Each chip is grounded in
   * real registry state: empty systems, stale systems, rich systems, cold start.
   */
  const insights = useMemo<Insight[]>(() => {
    const out: Insight[] = [];
    const active = systems.filter((s) => s.status === "ACTIVE");
    if (systems.length === 0) {
      out.push({ id: "cold", icon: Radar, text: t.dock.insightCold });
    } else {
      const empty = active.find(
        (s) => s.origin === "CREATED" && (s._count?.records ?? 0) === 0
      );
      if (empty)
        out.push({
          id: "empty",
          icon: Inbox,
          text: t.dock.insightEmpty(empty.name),
          action: "seed",
          systemId: empty.id,
        });

      const stale = [...active].sort(
        (a, b) => +new Date(a.updatedAt) - +new Date(b.updatedAt)
      )[0];
      // a digest already posted into the conversation dismisses the chip
      // for good — this session's clicks AND any earlier conversation
      const alreadyDigested = (sys: { name: string }) =>
        messages.some(
          (m) => m.role === "AGENT" && isDigestMessage(m.content) && m.content.includes(sys.name)
        );
      if (
        stale &&
        olderThanDays(stale.updatedAt, 7) &&
        !digested.has(stale.id) &&
        !alreadyDigested(stale)
      )
        out.push({
          id: "stale",
          icon: ClipboardList,
          text: t.dock.insightStale(stale.name),
          action: "digest",
          systemId: stale.id,
        });

      const rich = active.find((s) => (s._count?.records ?? 0) >= 5);
      if (rich)
        out.push({
          id: "rich",
          icon: Activity,
          text: t.dock.insightRich(rich.name),
        });
    }
    return out.slice(0, 3);
  }, [systems, messages, digested, t]);

  /** empty-state action list: insights first, generic quick-asks fill the rest */
  const emptyStateActions = useMemo(() => {
    const base: Insight[] = [
      { id: "sugg1", icon: Sparkles, text: t.dock.sugg1 },
      { id: "sugg2", icon: Sparkles, text: t.dock.sugg2 },
    ];
    return [...insights, ...base].slice(0, 4);
  }, [insights, t]);

  const mutation = useMutation({
    mutationFn: (message: string) => sendChat(userId!, message, lang),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat", userId] });
      queryClient.invalidateQueries({ queryKey: ["activity", userId] });
      setPendingMsg(null);
    },
    onError: (err: Error) => {
      setPendingMsg(null);
      toast.error(t.dock.toastErr, { description: err.message });
    },
  });

  /** action chips run for real: seed grows LLM sample rows on the spot */
  const seedMutation = useMutation({
    mutationFn: (systemId: string) => seedSystem(systemId, 5, lang),
    onSuccess: async (res, systemId) => {
      await queryClient.invalidateQueries({ queryKey: ["systems", userId] });
      queryClient.invalidateQueries({ queryKey: ["records", systemId] });
      queryClient.invalidateQueries({ queryKey: ["activity", userId] });
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
      toast.success(t.recs.seedOk, {
        description: t.recs.seedOkDesc(res.seeded),
      });
    },
    onError: (err: Error) =>
      toast.error(t.recs.seedErr, { description: err.message }),
  });

  /** proactive status digest: Wakeel posts a report card into the conversation */
  const digestMutation = useMutation({
    mutationFn: (systemId: string) => generateDigest(userId!, systemId, lang),
    onSuccess: async (_res, systemId) => {
      await queryClient.invalidateQueries({ queryKey: ["chat", userId] });
      queryClient.invalidateQueries({ queryKey: ["activity", userId] });
      setDigested((prev) => new Set(prev).add(systemId));
      toast.success(t.dock.digestOk, { description: t.dock.digestOkDesc });
    },
    onError: (err: Error) =>
      toast.error(t.dock.digestErr, { description: err.message }),
  });

  const runChip = (chip: Insight) => {
    if (chip.action === "seed" && chip.systemId) {
      if (!seedMutation.isPending) seedMutation.mutate(chip.systemId);
      return;
    }
    if (chip.action === "digest" && chip.systemId) {
      if (!digestMutation.isPending) digestMutation.mutate(chip.systemId);
      return;
    }
    send(chip.text);
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || mutation.isPending) return;
    setDraft("");
    setPendingMsg(trimmed);
    mutation.mutate(trimmed);
  };

  // auto-scroll to latest
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, pendingMsg, mutation.isPending, isLoading]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* messages */}
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        role="log"
        aria-label={t.dock.logLabel}
      >
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-16 w-4/5 animate-pulse rounded-md bg-secondary"
              />
            ))}
          </div>
        ) : messages.length === 0 && !pendingMsg ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <pre
              aria-hidden
              className="select-none font-mono text-[11px] leading-[1.5] text-gold/50"
            >
              {`   · · · · · · ·
 ·   ╭───────╮   ·
  ·  │  و ─○ │  ·
 ·   ╰───────╯   ·
   · · · · · · ·`}
            </pre>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
              {t.dock.clockedIn}
            </p>
            <p className="max-w-[240px] text-xs leading-relaxed text-muted-foreground">
              {t.dock.emptyCopy}
            </p>
            <div className="flex flex-col gap-2 pt-1">
              {emptyStateActions.map((s, i) => (
                <motion.button
                  key={s.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * i, duration: 0.3 }}
                  onClick={() => runChip(s)}
                  disabled={(s.action === "seed" && seedMutation.isPending) || (s.action === "digest" && digestMutation.isPending)}
                  className={cn(
                    "flex items-center gap-2 rounded-sm border px-3 py-2 text-start font-mono text-[11px] leading-snug transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:opacity-60",
                    s.action === "seed" || s.action === "digest"
                      ? "border-gold/50 bg-gold/15 text-gold hover:border-gold hover:bg-gold/25"
                      : "border-gold/25 bg-gold/5 text-gold hover:border-gold/50 hover:bg-gold/15"
                  )}
                >
                  {((s.action === "seed" && seedMutation.isPending) ||
                    (s.action === "digest" && digestMutation.isPending)) ? (
                    <Loader2 className="size-3 shrink-0 animate-spin text-gold/70" />
                  ) : (
                    <s.icon className="size-3 shrink-0 text-gold/70" />
                  )}
                  {s.text}
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className={cn(
                    "flex max-w-[88%] flex-col",
                    m.role === "USER" ? "self-end" : "self-start"
                  )}
                >
                  <p className="mb-1 px-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
                    {m.role === "USER" ? t.dock.operator : t.dock.wakeel} ·{" "}
                    <span dir="ltr">{msgTime(m.createdAt)}</span>
                  </p>
                  {m.role === "USER" ? (
                    <div className="rounded-md rounded-br-none border border-gold/25 bg-gold/10 px-3 py-2 text-[13px] leading-relaxed text-foreground">
                      {m.content}
                    </div>
                  ) : isDigestMessage(m.content) ? (
                    <div className="flex items-start gap-2">
                      <WakeelMark className="mt-1 size-4 shrink-0 text-gold/80" strokeWidth={2} />
                      <div className="animate-report-in relative min-w-0 overflow-hidden rounded-md rounded-bl-none border border-gold/40 bg-gold/[0.07] px-3 py-2.5 text-[13px] leading-relaxed text-foreground">
                        <span aria-hidden className="absolute inset-y-0 start-0 w-[3px] bg-gold" />
                        <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-gold/80">
                          {t.dock.digestTag}
                        </p>
                        {(() => {
                          const nl = m.content.indexOf("\n");
                          const head = nl === -1 ? m.content : m.content.slice(0, nl);
                          const rest = nl === -1 ? "" : m.content.slice(nl + 1);
                          return (
                            <>
                              <p
                                className="font-mono text-[11px] font-medium tracking-[0.06em] text-gold"
                                dir="auto"
                              >
                                {head}
                              </p>
                              <div
                                aria-hidden
                                className="my-2 h-px w-full bg-gradient-to-r from-gold/40 via-gold/15 to-transparent"
                              />
                              <div className="whitespace-pre-wrap" dir="auto">
                                {rest.trimStart()}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <WakeelMark className="mt-1 size-4 shrink-0 text-gold/80" strokeWidth={2} />
                      <div className="whitespace-pre-wrap rounded-md rounded-bl-none border border-border bg-secondary px-3 py-2 text-[13px] leading-relaxed text-foreground/90">
                        {m.content}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
              {pendingMsg && (
                <motion.div
                  key="pending"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex max-w-[88%] flex-col self-end"
                >
                  <p className="mb-1 px-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
                    {t.dock.sending}
                  </p>
                  <div className="rounded-md rounded-br-none border border-gold/25 bg-gold/10 px-3 py-2 text-[13px] leading-relaxed text-foreground/70">
                    {pendingMsg}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {mutation.isPending && <TypingIndicator />}
          </div>
        )}
      </div>

      {/* proactive insights — live above the composer once a conversation exists */}
      {messages.length > 0 && insights.length > 0 && !mutation.isPending && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="wakeel-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-t border-border/60 px-3 py-2"
          role="list"
          aria-label={t.dock.titleB}
        >
          {insights.map((chip) => {
            const chipPending =
              (chip.action === "seed" && seedMutation.isPending) ||
              (chip.action === "digest" && digestMutation.isPending);
            const isAction = chip.action === "seed" || chip.action === "digest";
            return (
              <button
                key={chip.id}
                role="listitem"
                onClick={() => runChip(chip)}
                disabled={chipPending}
                title={chip.text}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] leading-none transition-all hover:border-gold/60 hover:bg-gold/15 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97] disabled:opacity-60",
                  isAction
                    ? "border-gold/50 bg-gold/15 text-gold"
                    : "border-gold/25 bg-gold/[0.06] text-gold/90"
                )}
              >
                {chipPending ? (
                  <Loader2 className="size-3 shrink-0 animate-spin text-gold/70" />
                ) : (
                  <chip.icon className="size-3 shrink-0 text-gold/70" />
                )}
                <span className="max-w-[240px] truncate">{chip.text}</span>
              </button>
            );
          })}
        </motion.div>
      )}

      {/* composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex shrink-0 items-center gap-2 border-t border-border bg-card/60 p-3"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.dock.placeholder}
          disabled={mutation.isPending}
          aria-label={t.dock.composerLabel}
          className="h-10 min-h-11 border-border bg-background focus-visible:ring-gold/50 md:min-h-0"
        />
        <Button
          type="submit"
          size="icon"
          disabled={mutation.isPending || !draft.trim()}
          aria-label={t.dock.send}
          className="size-10 min-h-11 shrink-0 rounded-sm bg-primary text-primary-foreground hover:bg-gold-pale md:size-10 md:min-h-0"
        >
          {mutation.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Send className="size-4 rtl:-scale-x-100" />
          )}
        </Button>
      </form>
    </div>
  );
}

export function AgentDockPanel() {
  const t = useT();
  const lang = useWakeel((s) => s.lang);
  const slide = lang === "ar" ? -48 : 48;
  return (
    <motion.aside
      initial={{ x: slide, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: slide, opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="hidden w-[380px] shrink-0 flex-col border-e border-border bg-card/30 lg:flex"
      aria-label={t.dock.titleB}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">
          {t.dock.titleA} <span className="text-muted-foreground">{"//"}</span>{" "}
          <span className="text-gold">{t.dock.titleB}</span>
        </p>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-live">
          <span className="size-1.5 rounded-full bg-live shadow-[0_0_6px_rgba(62,207,142,0.9)]" />
          {t.dock.onDuty}
        </span>
      </div>
      <DockBody />
    </motion.aside>
  );
}

/** Mobile / tablet: full-width sheet (right in LTR, left in RTL). */
export function AgentDockSheet() {
  const t = useT();
  const lang = useWakeel((s) => s.lang);
  const agentDockOpen = useWakeel((s) => s.agentDockOpen);
  const setOpen = useWakeel((s) => s.setAgentDockOpen);
  // the inline panel owns the dock at ≥lg — the sheet must NEVER mount there,
  // otherwise it overlays the panel (two chat surfaces, two insight rows)
  const isLarge = useIsLarge();
  const open = agentDockOpen && !isLarge;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side={lang === "ar" ? "left" : "right"}
        aria-describedby={undefined}
        className="flex w-full flex-col gap-0 border-e border-border bg-card p-0 sm:max-w-md"
      >
        <SheetHeader className="flex-row items-center justify-between border-b border-border p-0 px-4 py-3">
          <SheetTitle className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">
            {t.dock.titleA} <span className="text-muted-foreground">{"//"}</span>{" "}
            <span className="text-gold">{t.dock.titleB}</span>
          </SheetTitle>
          <span className="flex items-center gap-1.5 pe-8 font-mono text-[10px] uppercase tracking-[0.12em] text-live">
            <span className="size-1.5 rounded-full bg-live shadow-[0_0_6px_rgba(62,207,142,0.9)]" />
            {t.dock.onDuty}
          </span>
        </SheetHeader>
        <DockBody />
      </SheetContent>
    </Sheet>
  );
}
