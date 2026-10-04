"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bot,
  CheckCircle2,
  Database,
  Hammer,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Radar,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  Wrench,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { WakeelMark } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MonoLabel } from "@/components/app/motion-bits";
import {
  forgeSystem,
  generateDigest,
  getChat,
  getSystems,
  runScan,
  seedSystem,
  sendChat,
} from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { useWakeel } from "@/lib/store";
import { cn } from "@/lib/utils";

import { ConnectOdooDialog } from "@/components/app/console/connections/connect-odoo-dialog";

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

export function AssistantView() {
  const t = useT();
  const lang = useWakeel((s) => s.lang);
  const userId = useWakeel((s) => s.userId);
  const userSession = useWakeel((s) => s.session);
  const setConsoleTab = useWakeel((s) => s.setConsoleTab);
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState("");
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<any>(null);

  // Voice State (Web Speech API)
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const recognitionRef = useRef<any>(null);

  const { data: chatData, isLoading: chatLoading } = useQuery({
    queryKey: ["chat", userId],
    queryFn: () => getChat(userId!),
    enabled: !!userId,
    refetchInterval: 15_000,
  });

  const { data: systemsData } = useQuery({
    queryKey: ["systems", userId],
    queryFn: () => getSystems(userId!),
    enabled: !!userId,
  });

  const messages = chatData?.messages ?? [];
  const systems = useMemo(() => systemsData?.systems ?? [], [systemsData]);

  // Speech Recognition Setup
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setSpeechSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = lang === "ar" ? "ar-SA" : "en-US";

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript) {
            setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
          setIsListening(false);
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, [lang]);

  const toggleListening = () => {
    if (!speechSupported || !recognitionRef.current) {
      toast.info(lang === "ar" ? "التعرف الصوتي غير مدعوم في متصفحك" : "Voice input is not supported in your browser");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.lang = lang === "ar" ? "ar-SA" : "en-US";
        recognitionRef.current.start();
        setIsListening(true);
        toast.info(lang === "ar" ? "تحدث الآن، الوكيل يستمع..." : "Listening... Speak now");
      } catch {
        setIsListening(false);
      }
    }
  };

  const speakText = (text: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/[*_#`]/g, "").slice(0, 300);
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = lang === "ar" ? "ar-SA" : "en-US";
      window.speechSynthesis.speak(utterance);
    }
  };

  // Chat Mutation
  const chatMutation = useMutation({
    mutationFn: (message: string) => sendChat(userId!, message, lang),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["chat", userId] });
      queryClient.invalidateQueries({ queryKey: ["activity", userId] });
      queryClient.invalidateQueries({ queryKey: ["systems", userId] });
      setPendingMsg(null);
      setActiveAction(null);
      if (res.approvalCard) {
        setPendingApproval(res.approvalCard);
      }
      if (autoSpeak && res.reply) {
        speakText(res.reply);
      }
    },
    onError: (err: Error) => {
      setPendingMsg(null);
      setActiveAction(null);
      toast.error(t.dock.toastErr, { description: err.message });
    },
  });

  // Approval Execution Mutation
  const approvalMutation = useMutation({
    mutationFn: async ({ confirmed }: { confirmed: boolean }) => {
      const res = await fetch("/api/agent/execute-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          toolName: "create_draft_invoice",
          parameters: pendingApproval?.mutationPayload || {},
          confirmed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Execution failed");
      return data;
    },
    onSuccess: (res, variables) => {
      setPendingApproval(null);
      queryClient.invalidateQueries({ queryKey: ["chat", userId] });
      queryClient.invalidateQueries({ queryKey: ["activity", userId] });
      if (variables.confirmed) {
        toast.success(lang === "ar" ? "تم إنشاء المسودة بنجاح في Odoo!" : "Draft created successfully in Odoo!");
        send(lang === "ar" ? "تم تأكيد واعتماد الإجراء، اعرض لي رقم الفاتورة المنشأة" : "Action approved, show me the created invoice");
      } else {
        toast.info(lang === "ar" ? "تم إلغاء الإجراء" : "Action cancelled");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chatMutation.isPending) return;
    setDraft("");
    setPendingMsg(trimmed);
    chatMutation.mutate(trimmed);
  };

  // Built-in Tools
  const executeTool = async (type: string, payload: any) => {
    setActiveAction(type);
    try {
      if (type === "scan") {
        send(lang === "ar" ? `قم باكتشاف الأنظمة لشركة: ${payload}` : `Discover systems for: ${payload}`);
      } else if (type === "forge") {
        send(lang === "ar" ? `أنشئ لي نظام: ${payload}` : `Forge a new system for: ${payload}`);
      } else if (type === "digest") {
        send(lang === "ar" ? `لخص لي حالة جميع أنظمة الشركة` : `Give me a full business health summary`);
      }
    } catch {
      setActiveAction(null);
    }
  };

  // Auto Scroll
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, pendingMsg, chatMutation.isPending]);

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col gap-3">
      {/* Top Live Actions & Intelligence Layer */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/80 bg-card/70 p-3.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="relative flex size-10 items-center justify-center rounded-lg border border-gold/40 bg-gold/10 text-gold shadow-[0_0_15px_rgba(232,180,74,0.15)]">
            <Bot className="size-5" />
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card bg-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-bold text-foreground">
                {lang === "ar" ? "وكيلك الذكي (الموظف التشغيلي)" : "Your AI Employee (Wakeel)"}
              </h2>
              <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-gold">
                {lang === "ar" ? "طبقة التشغيل" : "ERP / CRM Layer"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {lang === "ar"
                ? `متصل بـ ${systems.length} أنظمة | الذاكرة نشطة ومحدثة`
                : `Connected to ${systems.length} systems | Memory active`}
            </p>
          </div>
        </div>

        {/* Live Built-in Quick Tools */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setConnectOpen(true)}
            className="h-8 border border-gold/40 bg-gold/15 font-mono text-[11px] font-semibold text-gold hover:bg-gold/25"
          >
            <Database className="mr-1.5 size-3.5" />
            {lang === "ar" ? "ربط Odoo 19" : "Connect Odoo"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => executeTool("digest", null)}
            disabled={chatMutation.isPending}
            className="h-8 border-gold/30 font-mono text-[11px] text-gold hover:bg-gold/10"
          >
            <Sparkles className="mr-1.5 size-3.5" />
            {lang === "ar" ? "ملخص النشاط" : "Daily Digest"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setConsoleTab("discovery")}
            className="h-8 border-border font-mono text-[11px] hover:border-gold/40"
          >
            <Radar className="mr-1.5 size-3.5 text-gold" />
            {lang === "ar" ? "استكشاف الأنظمة" : "Discover Stack"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setConsoleTab("forge")}
            className="h-8 border-border font-mono text-[11px] hover:border-gold/40"
          >
            <Hammer className="mr-1.5 size-3.5 text-gold" />
            {lang === "ar" ? "بناء نظام جديد" : "Forge System"}
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={() => setAutoSpeak(!autoSpeak)}
            title={autoSpeak ? "Sound ON" : "Sound OFF"}
            className={cn("size-8 text-muted-foreground hover:text-gold", autoSpeak && "text-gold bg-gold/10")}
          >
            {autoSpeak ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Connect Odoo Dialog Component */}
      <ConnectOdooDialog open={connectOpen} onOpenChange={setConnectOpen} />

      {/* Main Friendly Chat Container */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {/* Messages Feed */}
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
          role="log"
          aria-label="Assistant conversation"
        >
          {chatLoading ? (
            <div className="flex flex-col gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 w-3/4 animate-pulse rounded-lg bg-secondary/80" />
              ))}
            </div>
          ) : messages.length === 0 && !pendingMsg ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl border border-gold/30 bg-gold/5 shadow-[0_0_30px_rgba(232,180,74,0.1)]">
                <WakeelMark className="size-8 text-gold" />
              </div>
              <div className="max-w-md">
                <h3 className="font-display text-lg font-bold text-foreground">
                  {lang === "ar"
                    ? `أهلاً بك! أنا موظفك الذكي في مساحة العمل`
                    : `Welcome! I'm your dedicated AI operations employee`}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {lang === "ar"
                    ? "أنا هنا لتسهيل إدارة كل أنظمتك وسجلاتك بدون أي تعقيد. تحدث معي بالشات أو الصوت واطلب أي شيء تريده."
                    : "I simplify your entire ERP, CRM, and tools. Chat with me by text or voice — ask anything."}
                </p>
              </div>

              {/* Starter Quick Actions */}
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  {
                    text: lang === "ar" ? "اكتشف الأنظمة المستخدمة في شركتنا" : "Discover existing systems for my business",
                    icon: Radar,
                  },
                  {
                    text: lang === "ar" ? "ابنِ لي نظام إدارة مهام ومخزون بسيط" : "Forge a simple tasks and inventory system",
                    icon: Hammer,
                  },
                  {
                    text: lang === "ar" ? "ما هي السجلات والأنظمة الحالية لدي؟" : "What systems and records do I have?",
                    icon: Database,
                  },
                  {
                    text: lang === "ar" ? "اعطني تقريراً بحالة العمل اليوم" : "Give me an operational summary",
                    icon: Activity,
                  },
                ].map((action, i) => (
                  <button
                    key={i}
                    onClick={() => send(action.text)}
                    className="flex items-center gap-2.5 rounded-lg border border-border/80 bg-secondary/40 p-3 text-start text-xs font-medium text-foreground transition-colors hover:border-gold/50 hover:bg-gold/5"
                  >
                    <action.icon className="size-4 shrink-0 text-gold" />
                    <span>{action.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex max-w-[85%] flex-col",
                      m.role === "USER" ? "self-end" : "self-start"
                    )}
                  >
                    <div className="mb-1 flex items-center gap-1.5 px-1 font-mono text-[10px] text-muted-foreground">
                      <span>{m.role === "USER" ? (userSession?.name || "You") : "Wakeel (AI)"}</span>
                      <span>·</span>
                      <span dir="ltr">{msgTime(m.createdAt)}</span>
                    </div>

                    {m.role === "USER" ? (
                      <div className="rounded-2xl rounded-tr-none border border-gold/30 bg-gold/15 px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm">
                        {m.content}
                      </div>
                    ) : (
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
                          <WakeelMark className="size-4" />
                        </div>
                        <div className="group relative whitespace-pre-wrap rounded-2xl rounded-tl-none border border-border bg-secondary/70 px-4 py-3 text-sm leading-relaxed text-foreground/95 shadow-sm">
                          {m.content}
                          <button
                            onClick={() => speakText(m.content)}
                            className="absolute -right-2 -top-2 hidden rounded-full border border-border bg-card p-1 text-muted-foreground shadow hover:text-gold group-hover:block"
                            title="Speak message"
                          >
                            <Volume2 className="size-3.5" />
                          </button>
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
                    className="flex max-w-[85%] flex-col self-end"
                  >
                    <div className="mb-1 px-1 font-mono text-[10px] text-muted-foreground">Sending...</div>
                    <div className="rounded-2xl rounded-tr-none border border-gold/20 bg-gold/10 px-4 py-3 text-sm leading-relaxed text-foreground/70">
                      {pendingMsg}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {pendingApproval && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="my-2 rounded-xl border-2 border-gold/60 bg-gold/[0.08] p-4 text-sm shadow-[0_0_25px_rgba(232,180,74,0.15)]"
                >
                  <div className="flex items-center gap-2 text-gold">
                    <ShieldCheck className="size-5" />
                    <h4 className="font-display font-bold">{pendingApproval.title}</h4>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{pendingApproval.description}</p>

                  <div className="my-3 flex flex-col gap-1.5 rounded-lg border border-gold/20 bg-background/80 p-3 font-mono text-xs">
                    {pendingApproval.details?.map((d: any, i: number) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-muted-foreground">{d.label}:</span>
                        <span className="font-bold text-foreground">{d.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => approvalMutation.mutate({ confirmed: true })}
                      disabled={approvalMutation.isPending}
                      className="h-9 flex-1 bg-emerald-600 font-mono text-xs font-bold text-white hover:bg-emerald-500"
                    >
                      {approvalMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        lang === "ar" ? "✓ تأكيد واعتماد في Odoo" : "✓ Approve in Odoo"
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => approvalMutation.mutate({ confirmed: false })}
                      disabled={approvalMutation.isPending}
                      className="h-9 border-border font-mono text-xs hover:border-destructive hover:text-destructive"
                    >
                      {lang === "ar" ? "إلغاء" : "Cancel"}
                    </Button>
                  </div>
                </motion.div>
              )}

              {chatMutation.isPending && (
                <div className="flex items-center gap-2 self-start rounded-xl border border-border bg-secondary/60 px-4 py-3">
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                        className="size-2 rounded-full bg-gold"
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {lang === "ar" ? "وكيل يفكّر وينفّذ الإجراءات..." : "Wakeel is reasoning & executing..."}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Bar & Voice Controls */}
        <div className="border-t border-border bg-card/80 p-3.5 backdrop-blur">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-center gap-2"
          >
            {/* Voice Input Button */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={toggleListening}
              className={cn(
                "size-11 shrink-0 rounded-xl border-border transition-colors",
                isListening
                  ? "border-destructive bg-destructive/15 text-destructive animate-pulse"
                  : "hover:border-gold/50 hover:text-gold"
              )}
              title={isListening ? "Listening..." : "Click to speak"}
            >
              {isListening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </Button>

            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                isListening
                  ? lang === "ar"
                    ? "جارٍ الاستماع إليك..."
                    : "Listening to your voice..."
                  : lang === "ar"
                  ? "اكتب أو تحدث مع وكيلك (مثال: أضف سجل عميل جديد، اعطني ملخص المبيعات)..."
                  : "Chat or speak with Wakeel (e.g. create a system, add record, check stack)..."
              }
              disabled={chatMutation.isPending}
              className="h-11 flex-1 rounded-xl border-border bg-secondary/50 px-4 text-sm focus-visible:ring-gold/50"
            />

            <Button
              type="submit"
              disabled={chatMutation.isPending || !draft.trim()}
              className="size-11 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-gold-pale"
            >
              <Send className="size-5 rtl:-scale-x-100" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
