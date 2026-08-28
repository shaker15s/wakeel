"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Send } from "lucide-react";
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
import { getChat, sendChat } from "@/lib/api-client";
import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "What systems do I have?",
  "Suggest an automation for my CRM",
];

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
  const userId = useWakeel((s) => s.userId);
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["chat", userId],
    queryFn: () => getChat(userId!),
    enabled: !!userId,
    refetchInterval: 20_000,
  });

  const messages = data?.messages ?? [];

  const mutation = useMutation({
    mutationFn: (message: string) => sendChat(userId!, message),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat", userId] });
      queryClient.invalidateQueries({ queryKey: ["activity", userId] });
      setPendingMsg(null);
    },
    onError: (err: Error) => {
      setPendingMsg(null);
      toast.error("Wakeel is unreachable", { description: err.message });
    },
  });

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
        aria-label="Agent conversation"
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
              WAKEEL CLOCKED IN
            </p>
            <p className="max-w-[240px] text-xs leading-relaxed text-muted-foreground">
              Ask about your systems, records or next automation. It answers
              with full workspace context.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-sm border border-gold/25 bg-gold/5 px-3 py-2 text-left font-mono text-[11px] text-gold transition-colors hover:bg-gold/15 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
                >
                  {s}
                </button>
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
                    {m.role === "USER" ? "OPERATOR" : "WAKEEL"} ·{" "}
                    {msgTime(m.createdAt)}
                  </p>
                  {m.role === "USER" ? (
                    <div className="rounded-md rounded-br-none border border-gold/25 bg-gold/10 px-3 py-2 text-[13px] leading-relaxed text-foreground">
                      {m.content}
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
                    OPERATOR · SENDING…
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
          placeholder="Message Wakeel…"
          disabled={mutation.isPending}
          aria-label="Message Wakeel"
          className="h-10 min-h-11 border-border bg-background focus-visible:ring-gold/50 md:min-h-0"
        />
        <Button
          type="submit"
          size="icon"
          disabled={mutation.isPending || !draft.trim()}
          aria-label="Send message"
          className="size-10 min-h-11 shrink-0 rounded-sm bg-primary text-primary-foreground hover:bg-gold-pale md:size-10 md:min-h-0"
        >
          {mutation.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </form>
    </div>
  );
}

export function AgentDockPanel() {
  return (
    <motion.aside
      initial={{ x: 48, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 48, opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="hidden w-[380px] shrink-0 flex-col border-l border-border bg-card/30 lg:flex"
      aria-label="Wakeel agent dock"
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">
          WAKEEL <span className="text-muted-foreground">{"//"}</span>{" "}
          <span className="text-gold">AGENT DOCK</span>
        </p>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-live">
          <span className="size-1.5 rounded-full bg-live shadow-[0_0_6px_rgba(62,207,142,0.9)]" />
          ON DUTY
        </span>
      </div>
      <DockBody />
    </motion.aside>
  );
}

/** Mobile / tablet: full-width sheet from the right. */
export function AgentDockSheet() {
  const open = useWakeel((s) => s.agentDockOpen);
  const setOpen = useWakeel((s) => s.setAgentDockOpen);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-border bg-card p-0 sm:max-w-md"
      >
        <SheetHeader className="flex-row items-center justify-between border-b border-border p-0 px-4 py-3">
          <SheetTitle className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">
            WAKEEL <span className="text-muted-foreground">{"//"}</span>{" "}
            <span className="text-gold">AGENT DOCK</span>
          </SheetTitle>
          <span className="flex items-center gap-1.5 pr-8 font-mono text-[10px] uppercase tracking-[0.12em] text-live">
            <span className="size-1.5 rounded-full bg-live shadow-[0_0_6px_rgba(62,207,142,0.9)]" />
            ON DUTY
          </span>
        </SheetHeader>
        <DockBody />
      </SheetContent>
    </Sheet>
  );
}
