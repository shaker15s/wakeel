"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { WorkpapersPane } from "./workpapers-pane";
import ReactMarkdown from "react-markdown";
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowLeft,
  Plus,
  Search,
  PanelRightClose,
  Menu,
  X,
  Sparkles,
  Paperclip,
  ChevronDown,
  ChevronLeft,
  Check,
  CheckCheck,
  Circle,
  CircleHelp,
  Clock3,
  FileText,
  FolderOpen,
  BrainCircuit,
  Database,
  Calculator,
  ShieldCheck,
  Settings2,
  Plug,
  Download,
  Loader2,
  Square,
  RefreshCw,
  Trash2,
  BookOpen,
  AlertCircle,
  Send,
  Fingerprint,
  Scale,
  TrendingUp,
  Wallet,
  MoreHorizontal,
  FileSpreadsheet,
} from "lucide-react";
import {
  financeApi,
  streamTurn,
  type SessionView,
  type SessionSummary,
  type DocumentSummary,
  type PublicConnections,
} from "@/lib/finance-client";
import type {
  JournalApproval,
  Turn,
  MemoryDocument,
} from "@/server/finance/types";
import "./finance.css";

type Page = "home" | "session" | "memory" | "connections" | "workpapers";
const suggestions = [
  {
    icon: Wallet,
    title: "رتّب أولويات التحصيل",
    description: "المديونيات، سياسة التحصيل، وخطة متابعة",
    prompt:
      "راجع العملاء المتأخرين عن السداد لحد النهارده من Odoo، وقارن بسياسة التحصيل المحفوظة، ورتب لي أولويات المتابعة مع توضيح المبالغ والعملات ومصادرها.",
  },
  {
    icon: TrendingUp,
    title: "افهم مصروفاتك أكتر",
    description: "تحليل الملفات، تجميع الأرقام، ومراجعة الفروق",
    prompt:
      "حلل ملف المصروفات المحفوظ في الذاكرة. اجمع المصروفات حسب النوع والعملة بحسابات دقيقة، وحدد البنود التي تحتاج مراجعة مع مصادر الأرقام.",
  },
  {
    icon: Scale,
    title: "راجع الحسابات معايا",
    description: "قراءة القيود، اكتشاف الاستثناءات، وملخص واضح",
    prompt:
      "راجع قيود الشهر الحالي في Odoo، وقارنها بالوثائق والسياسات المحفوظة، وحدد القيود غير المعتادة التي تحتاج مراجعتي. لا ترحّل أو تعدّل أي قيد دون موافقتي.",
  },
];
const stageIcon = (tool: string) =>
  tool.startsWith("memory")
    ? BookOpen
    : tool.startsWith("odoo")
      ? Database
      : Calculator;
const statusLabel: Record<string, string> = {
  queued: "جاهزة",
  running: "جاري العمل",
  completed: "اكتملت الخطوات",
  blocked: "بانتظارك",
  interrupted: "متوقفة",
  failed: "تحتاج مراجعة",
  pending: "لم تبدأ",
  verified: "مسودة متحققة",
  unknown: "النتيجة غير مؤكدة",
  rejected: "مرفوض",
  executing: "قيد التنفيذ",
};
function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`fw-mark ${small ? "small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="m5 11 5.5 12L16 12l5.5 11L27 11"
          stroke="currentColor"
          strokeWidth="2.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="m16 3 1.1 3.4L21 7.5l-3.9 1.1L16 12l-1.1-3.4L11 7.5l3.9-1.1L16 3Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
function Modal({
  open,
  title,
  description,
  close,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(value) => !value && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fw-overlay" />
        <Dialog.Content dir="rtl" className="fw-modal">
          <div className="fw-modal-head">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close className="fw-icon" aria-label="إغلاق">
              <X size={18} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FinanceWorkspace() {
  const [selectedWorkpaper, setSelectedWorkpaper] = useState<string | null>(
    null,
  );
  const [page, setPage] = useState<Page>("home"),
    [token, setToken] = useState(""),
    [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]),
    [documents, setDocuments] = useState<DocumentSummary[]>([]),
    [connections, setConnections] = useState<PublicConnections>({
      model: null,
      odoo: null,
    });
  const [session, setSession] = useState<SessionView | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [attached, setAttached] = useState<string[]>([]);
  const [memoryModal, setMemoryModal] = useState(false),
    [help, setHelp] = useState(false),
    [viewDocument, setViewDocument] = useState<MemoryDocument | null>(null),
    [approval, setApproval] = useState<JournalApproval | null>(null),
    [reviewed, setReviewed] = useState(false);
  const [saving, setSaving] = useState(""),
    [egg, setEgg] = useState(false),
    [expanded, setExpanded] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null),
    inFlight = useRef(false),
    clicks = useRef(0),
    bottom = useRef<HTMLDivElement>(null);
  const last = session?.turns.at(-1);
  const sessionId = session?.id;
  const needsPoll =
    !busy &&
    (last?.status === "running" ||
      session?.approvals.some((a) => a.status === "executing"));
  useEffect(() => {
    if (!needsPoll || !sessionId || !token) return;
    let alive = true;
    const timer = setInterval(() => {
      void financeApi<{ session: SessionView }>(token, "sessions/" + sessionId)
        .then((r) => {
          if (alive) setSession(r.session);
        })
        .catch(() => {});
    }, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [needsPoll, sessionId, token]);
  async function refresh(key = token) {
    const state = await financeApi<{
      sessions: SessionSummary[];
      documents: DocumentSummary[];
      connections: PublicConnections;
    }>(key, "status");
    setSessions(state.sessions);
    setDocuments(state.documents);
    setConnections(state.connections);
  }
  async function openSession(id: string, key = token) {
    if (inFlight.current) {
      setNotice("استنى التنفيذ الحالي أو أوقفه قبل تغيير الجلسة.");
      return;
    }
    try {
      const result = await financeApi<{ session: SessionView }>(
        key,
        "sessions/" + id,
      );
      setSession(result.session);
      setPage("session");
      setMobile(false);
      setError("");
      window.history.replaceState(null, "", `/?session=${id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    let alive = true;
    async function boot() {
      try {
        let key = "";
        try {
          key = localStorage.getItem("wakeel-finance-access") || "";
        } catch {
          /* storage denied */
        }
        if (!key) {
          const created = await financeApi<{ token: string }>("", "bootstrap", {
            method: "POST",
            body: "{}",
          });
          if (!alive) return;
          key = created.token;
          try {
            localStorage.setItem("wakeel-finance-access", key);
          } catch {
            if (alive)
              setNotice(
                "التخزين في المتصفح غير متاح. هذه المساحة مرتبطة بهذه الزيارة فقط.",
              );
          }
        }
        if (!alive) return;
        setToken(key);
        await refresh(key);
        if (!alive) return;
        setReady(true);
        const id = new URLSearchParams(location.search).get("session");
        if (id) await openSession(id, key);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    }
    void boot();
    return () => {
      alive = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!egg) return;
    const timer = setTimeout(() => setEgg(false), 1600);
    return () => clearTimeout(timer);
  }, [egg]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  function navigate(next: Page) {
    if (inFlight.current) {
      setNotice("استنى التنفيذ الحالي أو أوقفه قبل تغيير الصفحة.");
      return;
    }
    if (next === "workpapers") setSelectedWorkpaper(null);
    setPage(next);
    setMobile(false);
    setError("");
    if (next === "home") {
      setSession(null);
      setMessage("");
      setAttached([]);
      window.history.replaceState(null, "", "/");
    }
  }
  async function run(text?: string, resume = false) {
    if (!ready || inFlight.current || (!resume && !text?.trim())) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    let current = session;
    const requestId = resume ? last?.id : crypto.randomUUID();
    if (!requestId) {
      inFlight.current = false;
      setBusy(false);
      return;
    }
    try {
      if (!current) {
        const response = await financeApi<{ session: SessionView }>(
          token,
          "sessions",
          { method: "POST", body: JSON.stringify({ title: text }) },
        );
        current = { ...response.session, approvals: [] };
        setSession(current);
        window.history.replaceState(null, "", `/?session=${current.id}`);
      }
      setPage("session");
      setMobile(false);
      setMessage("");
      controller.current = new AbortController();
      await streamTurn(
        token,
        current.id,
        {
          requestId,
          ...(resume ? {} : { message: text, documentIds: attached }),
        },
        controller.current.signal,
        (s) => {
          setSession(s);
        },
      );
      setAttached([]);
      await refresh();
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setNotice("تم طلب الإيقاف؛ الخطوات المكتملة محفوظة.");
        if (current) {
          const res = await financeApi<{ session: SessionView }>(
            token,
            "sessions/" + current.id,
          ).catch(() => null);
          if (res) setSession(res.session);
        }
      } else setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
      controller.current = null;
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!/\.(txt|md|csv|json)$/i.test(file.name) || file.size > 64000) {
      setError(
        "ارفع TXT أو MD أو CSV أو JSON نصي، حتى ٦٤ كيلوبايت. PDF والصور تحتاج استخراج نص قبل رفعها.",
      );
      return;
    }
    setSaving("upload");
    setError("");
    try {
      const content = await file.text();
      const res = await financeApi<{ document: { id: string } }>(
        token,
        "documents",
        {
          method: "POST",
          body: JSON.stringify({ title: file.name, content, kind: "document" }),
        },
      );
      await refresh();
      setAttached((old) => [...new Set([...old, res.document.id])].slice(-5));
      setNotice("اتحفظ المستند في الذاكرة، وهيترفق بطلبك الجاي.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving("");
    }
  }
  async function saveMemory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving("memory");
    setError("");
    try {
      const data = new FormData(e.currentTarget);
      await financeApi(token, "documents", {
        method: "POST",
        body: JSON.stringify({
          title: data.get("title"),
          content: data.get("content"),
          kind: "policy",
        }),
      });
      await refresh();
      setMemoryModal(false);
      setNotice(
        "اتحفظت المعلومة مع مصدرها. تقدر تراجعها أو تحذفها من الذاكرة.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving("");
    }
  }
  async function saveConnection(
    e: FormEvent<HTMLFormElement>,
    kind: "model" | "odoo",
  ) {
    e.preventDefault();
    setSaving(kind);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const config =
        kind === "odoo" ? { ...data, companyId: Number(data.companyId) } : data;
      await financeApi(token, "connections", {
        method: "POST",
        body: JSON.stringify({ kind, config }),
      });
      setNotice("نجح اختبار الاتصال. ارجع لجلسة العمل واضغط استئناف.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      await refresh().catch(() => {});
    } finally {
      setSaving("");
    }
  }
  async function decide(decision: "approve" | "reject") {
    if (!approval || saving || (decision === "approve" && !reviewed)) return;
    setSaving("approval");
    setError("");
    try {
      await financeApi(token, "approvals/" + approval.id, {
        method: "POST",
        body: JSON.stringify({ decision, actionHash: approval.actionHash }),
      });
      const fresh = await financeApi<{ session: SessionView }>(
        token,
        "sessions/" + approval.sessionId,
      );
      setSession(fresh.session);
      setApproval(null);
      setReviewed(false);
      setNotice(
        decision === "reject"
          ? "تم رفض الإجراء. لم ننفّذ كتابة."
          : "تم تسجيل نتيجة العملية؛ راجع حالة التحقق في الجلسة.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving("");
    }
  }
  const compose = (home = false) => (
    <div className={`fw-composer-wrap ${home ? "home" : ""}`}>
      {attached.length > 0 && (
        <div className="fw-attachments">
          {attached.map((id) => (
            <span key={id}>
              <FileText size={13} />
              {documents.find((d) => d.id === id)?.title || "مستند مرفق"}
              <button
                aria-label="إزالة المرفق من الطلب"
                onClick={() => setAttached((a) => a.filter((x) => x !== id))}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <form
        className="fw-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void run(message);
        }}
      >
        <textarea
          ref={input}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={8000}
          placeholder={
            home
              ? "قول لي عايز تنجز إيه… وسيب لي ترتيب الخطوات"
              : "كمّل طلبك، اسأل عن نتيجة، أو وضّح نقطة…"
          }
          aria-label="رسالتك لوكيل"
          rows={home ? 2 : 1}
          disabled={busy}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void run(message);
            }
          }}
        />
        <div className="fw-composer-actions">
          <div>
            <button
              type="button"
              className="fw-icon"
              aria-label="إرفاق مستند"
              disabled={!ready || !!saving || busy}
              onClick={() => fileInput.current?.click()}
            >
              {saving === "upload" ? (
                <Loader2 size={18} className="fw-spin" />
              ) : (
                <Paperclip size={19} />
              )}
            </button>
            <span className="fw-composer-mode">
              <BrainCircuit size={14} />
              موظف مالي <ChevronDown size={12} />
            </span>
          </div>
          {busy ? (
            <button
              type="button"
              className="fw-send stop"
              aria-label="إيقاف التنفيذ"
              onClick={() => controller.current?.abort()}
            >
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              className="fw-send"
              aria-label="إرسال الطلب"
              disabled={!message.trim() || !ready}
            >
              <ArrowUp size={20} />
            </button>
          )}
        </div>
      </form>
      <div className="fw-composer-note">
        <span>
          <ShieldCheck size={12} />
          أي كتابة محاسبية تحتاج موافقتك.
        </span>
        <span>
          {home
            ? "Enter للإرسال · Shift + Enter لسطر جديد"
            : "نتائج الذكاء الاصطناعي تحتاج مراجعة مهنية."}
        </span>
      </div>
    </div>
  );

  return (
    <div dir="rtl" lang="ar" className="fw-app">
      <a href="#finance-main" className="fw-skip">
        انتقل للمحتوى
      </a>
      {mobile && (
        <button
          className="fw-scrim"
          aria-label="إغلاق القائمة"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`fw-sidebar ${mobile ? "open" : ""}`}>
        <div className="fw-brand-row">
          <button
            className="fw-brand"
            onClick={() => {
              navigate("home");
              if (++clicks.current % 5 === 0) {
                setEgg(true);
                setNotice("سر المهنة؟ كل رقم لازم يكون له سند ✨");
              }
            }}
            aria-label="وكيل، جلسة جديدة"
          >
            <Brand />
            <strong>
              وكيل<span>.</span>
            </strong>
          </button>
          <button
            className="fw-icon fw-collapse"
            aria-label="إغلاق القائمة"
            onClick={() => setMobile(false)}
          >
            <PanelRightClose size={17} />
          </button>
        </div>
        <button className="fw-new" onClick={() => navigate("home")}>
          <Plus size={18} />
          جلسة جديدة<kbd>⌘ K</kbd>
        </button>
        <nav className="fw-nav">
          <button
            className={page === "workpapers" ? "active" : ""}
            onClick={() => navigate("workpapers")}
          >
            <FileSpreadsheet size={18} />
            جداول العمل والفحص
          </button>
          <button
            className={searchOpen ? "active" : ""}
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search size={18} />
            البحث في الجلسات
          </button>
          <button
            className={page === "memory" ? "active" : ""}
            onClick={() => navigate("memory")}
          >
            <FolderOpen size={18} />
            الذاكرة والمستندات
            {documents.length > 0 && <span>{documents.length}</span>}
          </button>
          <button
            className={page === "connections" ? "active" : ""}
            onClick={() => navigate("connections")}
          >
            <Plug size={18} />
            الاتصالات
            <span
              className={`fw-dot ${connections.model?.verifiedAt ? "green" : ""}`}
            />
          </button>
        </nav>
        <div className="fw-session-heading">
          <span>جلسات العمل</span>
          <span>
            {sessions.length ? String(sessions.length).padStart(2, "0") : ""}
          </span>
        </div>
        {searchOpen && (
          <label className="fw-session-search">
            <Search size={14} />
            <input
              aria-label="ابحث في الجلسات"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="اسم أو محتوى الجلسة…"
              autoFocus
            />
          </label>
        )}
        <div className="fw-session-list">
          {sessions
            .filter((s) => (s.title + " " + s.preview).includes(filter))
            .map((s) => (
              <button
                className={
                  session?.id === s.id && page === "session" ? "selected" : ""
                }
                onClick={() => void openSession(s.id)}
                key={s.id}
              >
                <span className={`fw-session-dot ${s.status}`} />
                <span>{s.title}</span>
                <ChevronLeft size={12} />
              </button>
            ))}
          {!sessions.length && (
            <p>
              أول طلب منك يفتح جلسة هنا.
              <br />
              كل شغلك، وسياقه، محفوظين.
            </p>
          )}
        </div>
        <div className="fw-sidebar-bottom">
          <div className="fw-workspace-note">
            <span className="fw-status-light" />
            <span>
              مساحة عملك الشخصية<small>جلسات محفوظة · قرارك في إيدك</small>
            </span>
            <ShieldCheck size={17} />
          </div>
          <button className="fw-profile" onClick={() => setHelp(true)}>
            <span className="fw-avatar">أ</span>
            <span>
              <strong>أهلًا بيك</strong>
              <small>نتيجة واضحة. وخطوات تقدر تراجعها.</small>
            </span>
            <CircleHelp size={17} />
          </button>
        </div>
      </aside>
      <div className="fw-main-shell">
        <header className="fw-topbar">
          <div>
            <button
              className="fw-icon fw-menu"
              aria-label="فتح القائمة"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span className="fw-crumb">مساحة العمل</span>
            <ChevronLeft size={13} />
            <strong>
              {page === "home"
                ? "بداية جديدة"
                : page === "session"
                  ? session?.title
                  : page === "memory"
                    ? "الذاكرة والمستندات"
                    : page === "workpapers"
                      ? "جداول العمل والفحص"
                      : "اتصالات الموظف"}
            </strong>
          </div>
          <div className="fw-top-actions">
            <button
              className={`fw-model-status ${connections.model?.verifiedAt ? "connected" : ""}`}
              onClick={() => navigate("connections")}
            >
              <span />
              {connections.model?.verifiedAt
                ? "محرك الذكاء متصل"
                : "إعداد محرك الذكاء"}
              <ChevronDown size={12} />
            </button>
            <button
              className="fw-icon"
              onClick={() => setHelp(true)}
              aria-label="المساعدة"
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <main
          id="finance-main"
          className={`fw-main ${page === "session" ? "conversation" : ""}`}
        >
          {error && (
            <div className="fw-error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button
                className="fw-icon"
                aria-label="إخفاء التنبيه"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "home" && (
            <div className="fw-home fw-enter">
              <div className={`fw-orb ${egg ? "egg" : ""}`} aria-hidden="true">
                <div className="fw-orbit-ring" />
                <div className="fw-orb-center">
                  <Sparkles size={33} strokeWidth={1.3} />
                </div>
                <span />
                <i>✦</i>
              </div>
              <div className="fw-greeting">
                <span />
                مساحة هادئة لشغل مهم
              </div>
              <h1>
                أهلًا بيك.
                <br />
                <span>نشتغل على إيه النهارده؟</span>
              </h1>
              <p className="fw-intro">
                احكي لي المطلوب. أراجع السياق، أقسّم الشغل، وأتابع معاك لحد
                النتيجة.
              </p>
              {compose(true)}
              <div className="fw-home-start">
                <span>ممكن نبدأ بـ</span>
                <div className="fw-suggestions">
                  {suggestions.map(
                    ({ icon: Icon, title, description, prompt }) => (
                      <button
                        disabled={!ready}
                        key={title}
                        onClick={() => void run(prompt)}
                      >
                        <div>
                          <span>
                            <Icon size={19} />
                          </span>
                          <ArrowUpLeft size={15} />
                        </div>
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="fw-home-foot">
                <span>
                  <BookOpen size={15} />
                  يتذكر مستنداتك
                </span>
                <i />
                <span>
                  <Database size={15} />
                  يراجع بيانات Odoo
                </span>
                <i />
                <span>
                  <Calculator size={15} />
                  يحسب، مش يخمّن
                </span>
              </div>
              <div className="fw-home-caption">
                أنت تحدد الهدف. وكيل يتولى الخطوات، ويرجع لك لما يحتاج قرارك.
              </div>
            </div>
          )}
          {page === "session" && session && (
            <div className="fw-conversation-layout">
              <section className="fw-thread">
                <div className="fw-session-meta">
                  <span>
                    <Clock3 size={13} />
                    جلسة عمل محفوظة
                  </span>
                  <button
                    onClick={() =>
                      download(`wakeel-session-${session.id}.json`, session)
                    }
                  >
                    <Download size={13} />
                    تنزيل سجل الجلسة
                  </button>
                </div>
                {!session.turns.length && busy && (
                  <div className="fw-initializing">
                    <Loader2 className="fw-spin" size={18} />
                    بفتح جلسة لطلبك…
                  </div>
                )}
                {session.turns.map((turn) => (
                  <article key={turn.id} className="fw-turn">
                    <div className="fw-user-message">
                      <span className="fw-user-label">أنت</span>
                      <p>{turn.request}</p>
                    </div>
                    <div className="fw-agent-message">
                      <div className="fw-agent-label">
                        <Brand small />
                        <strong>وكيل</strong>
                        <span>موظفك المالي</span>
                      </div>
                      <div
                        className={`fw-activity-card ${turn.status === "running" ? "live" : ""}`}
                      >
                        <div className="fw-activity-head">
                          {turn.status === "running" ? (
                            <span className="fw-live-orbit">
                              <Sparkles size={16} />
                            </span>
                          ) : turn.status === "completed" ? (
                            <CheckCheck size={18} />
                          ) : (
                            <CircleHelp size={18} />
                          )}
                          <span>{turn.phase || "بجهّز الجلسة"}</span>
                          <button
                            className="fw-icon"
                            aria-label="تفاصيل نشاط التنفيذ"
                            onClick={() =>
                              setExpanded(expanded === turn.id ? null : turn.id)
                            }
                          >
                            <ChevronDown size={16} />
                          </button>
                        </div>
                        {turn.steps.length > 0 && (
                          <div className="fw-inline-steps">
                            {turn.steps.map((step, i) => {
                              const Icon = stageIcon(step.tool);
                              return (
                                <div key={step.id} className={step.status}>
                                  <span>
                                    {step.status === "completed" ? (
                                      <Check size={13} />
                                    ) : step.status === "running" ? (
                                      <Loader2 size={13} className="fw-spin" />
                                    ) : (
                                      <Icon size={13} />
                                    )}
                                  </span>
                                  <p>{step.title}</p>
                                  <small>
                                    {step.status === "completed"
                                      ? "تم"
                                      : step.status === "running"
                                        ? "جاري"
                                        : String(i + 1).padStart(2, "0")}
                                  </small>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {expanded === turn.id && (
                          <div className="fw-event-log">
                            {turn.activities.map((event) => (
                              <div key={event.id}>
                                <time>
                                  {new Date(event.at).toLocaleTimeString(
                                    "ar-EG",
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      second: "2-digit",
                                    },
                                  )}
                                </time>
                                <span>{event.label}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {turn.sources.length > 0 && (
                        <div className="fw-source-chips">
                          {turn.sources.map((source) => (
                            <button
                              key={source.id}
                              onClick={() => {
                                void financeApi<{ document: MemoryDocument }>(
                                  token,
                                  "documents/" + source.id,
                                )
                                  .then((r) => setViewDocument(r.document))
                                  .catch(() =>
                                    setNotice(
                                      "المصدر مؤرشف في سجل الجلسة أو حُذف من الذاكرة.",
                                    ),
                                  );
                              }}
                            >
                              <FileText size={12} />
                              {source.title}
                            </button>
                          ))}
                        </div>
                      )}
                      {turn.steps.map((s) => {
                        const output = s.output as
                          | { workpaperId?: string }
                          | undefined;
                        return output?.workpaperId ? (
                          <button
                            key={s.id}
                            className="wp-inline-link"
                            disabled={busy}
                            onClick={() => {
                              setSelectedWorkpaper(output.workpaperId!);
                              setPage("workpapers");
                            }}
                          >
                            <FileSpreadsheet size={15} />
                            افتح ورقة العمل: {s.title}
                            <ArrowLeft size={13} />
                          </button>
                        ) : null;
                      })}
                      {!!turn.reviews?.length && (
                        <details className="fw-evidence">
                          <summary>
                            <ShieldCheck size={13} />
                            مراجعة آلية للأدلة والخطة · {turn.reviews.length}
                          </summary>
                          <ol>
                            {turn.reviews.map((r, i) => (
                              <li key={i}>
                                {r.summary} —{" "}
                                {r.decision === "extend"
                                  ? "اقتراح استكمال"
                                  : r.decision === "clarify"
                                    ? "توضيح مطلوب"
                                    : "كفاية مبدئية للصياغة ضمن النطاق"}
                              </li>
                            ))}
                          </ol>
                        </details>
                      )}
                      {turn.reply && (
                        <div
                          className={`fw-answer ${turn.status === "blocked" ? "needs-input" : ""}`}
                        >
                          <ReactMarkdown
                            components={{
                              img: () => <span>[صورة خارجية غير محمّلة]</span>,
                              a: ({ href, children }) => (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {children}
                                </a>
                              ),
                            }}
                          >
                            {turn.reply}
                          </ReactMarkdown>
                        </div>
                      )}
                      {turn.status === "blocked" && !connections.model && (
                        <button
                          className="fw-setup-action"
                          onClick={() => navigate("connections")}
                        >
                          <Plug size={16} />
                          فعّل محرك الذكاء وكمّل نفس الطلب
                          <ArrowLeft size={15} />
                        </button>
                      )}
                      {turn.status === "blocked" &&
                        connections.model &&
                        !connections.odoo?.verifiedAt &&
                        turn.steps.some((s) => s.tool.startsWith("odoo.")) && (
                          <button
                            className="fw-setup-action"
                            onClick={() => navigate("connections")}
                          >
                            <Database size={16} />
                            اربط Odoo واستأنف الخطة
                            <ArrowLeft size={15} />
                          </button>
                        )}
                      {["blocked", "failed", "interrupted"].includes(
                        turn.status,
                      ) &&
                        turn.id === last?.id &&
                        !turn.clarification && (
                          <button
                            className="fw-resume"
                            disabled={busy}
                            onClick={() => void run(undefined, true)}
                          >
                            <RefreshCw size={14} />
                            استئناف من آخر خطوة
                          </button>
                        )}
                      {turn.steps.some((s) => s.output !== undefined) && (
                        <details className="fw-evidence">
                          <summary>
                            <Fingerprint size={14} />
                            مصادر الأرقام ومخرجات الأدوات
                          </summary>
                          {turn.steps
                            .filter((s) => s.output !== undefined)
                            .map((s) => (
                              <details key={s.id}>
                                <summary>
                                  {s.title} <code>{s.id}</code>
                                </summary>
                                <pre dir="ltr">
                                  {JSON.stringify(s.output, null, 2)}
                                </pre>
                              </details>
                            ))}
                        </details>
                      )}
                      {session.approvals
                        .filter((a) => a.turnId === turn.id)
                        .map((a) => (
                          <div
                            key={a.id}
                            className={`fw-approval-card ${a.status}`}
                          >
                            <ShieldCheck size={21} />
                            <div>
                              <strong>
                                {a.status === "pending"
                                  ? "قيد يومية جاهز لمراجعتك"
                                  : a.status === "verified"
                                    ? "أُنشئت المسودة وتم التحقق منها"
                                    : statusLabel[a.status] || a.status}
                              </strong>
                              <p>
                                {a.status === "pending"
                                  ? "لم نكتب شيئًا في Odoo. راجع البنود قبل الموافقة."
                                  : a.error || a.action.description}
                              </p>
                            </div>
                            {a.status === "pending" && (
                              <button
                                onClick={() => {
                                  setApproval(a);
                                  setReviewed(false);
                                }}
                              >
                                راجع الإجراء
                                <ArrowLeft size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  </article>
                ))}
                <div ref={bottom} />
                <div className="fw-bottom-composer">{compose()}</div>
              </section>
              <aside className="fw-run-panel">
                <div className="fw-run-title">
                  <span>خطة العمل</span>
                  <span>
                    {last?.steps.length
                      ? `${last.steps.filter((s) => s.status === "completed").length} / ${last.steps.length}`
                      : "—"}
                  </span>
                </div>
                {last?.steps.length ? (
                  <ol>
                    {last.steps.map((s, i) => (
                      <li className={s.status} key={s.id}>
                        <span>
                          {s.status === "completed" ? (
                            <Check size={13} />
                          ) : (
                            i + 1
                          )}
                        </span>
                        <div>
                          <strong>{s.title}</strong>
                          <small>{statusLabel[s.status] || s.status}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="fw-plan-empty">
                    <BrainCircuit size={26} />
                    <p>
                      الخطة تتشكل حسب طلبك.
                      <br />
                      مش خطوات ثابتة لكل المهام.
                    </p>
                  </div>
                )}
                <div className="fw-run-divider" />
                <div className="fw-context-title">سياق الجلسة</div>
                <div className="fw-context-line">
                  <BookOpen size={15} />
                  <span>مستندات مرتبطة</span>
                  <b>{last?.sources.length || 0}</b>
                </div>
                <div className="fw-context-line">
                  <Database size={15} />
                  <span>Odoo</span>
                  <small>
                    {connections.odoo?.verifiedAt ? "متصل" : "غير مربوط"}
                  </small>
                </div>
                <div className="fw-context-line">
                  <ShieldCheck size={15} />
                  <span>الكتابة</span>
                  <small>بموافقتك فقط</small>
                </div>
                <div className="fw-run-note">
                  <ShieldCheck size={17} />
                  <p>
                    النشاط المعروض صادر عن التنفيذ الفعلي. لو خطوة اتعطلت، بنقول
                    لك بوضوح.
                  </p>
                </div>
              </aside>
            </div>
          )}
          {page === "workpapers" && (
            <WorkpapersPane
              token={token}
              documents={documents}
              onUpload={() => fileInput.current?.click()}
              onRefresh={() => refresh()}
              initialId={selectedWorkpaper}
            />
          )}
          {page === "memory" && (
            <section className="fw-page fw-enter">
              <div className="fw-page-heading">
                <div>
                  <span className="fw-eyebrow">سياق بيكمل معاك</span>
                  <h1>ذاكرة وكيل.</h1>
                  <p>
                    مستندات مالية، سياسات محاسبية، وملاحظات ترجع لها كل جلسة. من
                    غير ما تعيد شرح كل حاجة.
                  </p>
                </div>
                <div className="fw-heading-actions">
                  <button
                    className="fw-secondary"
                    onClick={() => setMemoryModal(true)}
                  >
                    <Plus size={16} />
                    حفظ معلومة
                  </button>
                  <button
                    className="fw-primary"
                    disabled={!!saving}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Paperclip size={16} />
                    إضافة مستند
                  </button>
                </div>
              </div>
              <div className="fw-memory-banner">
                <BookOpen size={21} />
                <span>
                  المعلومات محفوظة بمصدرها وبصمة المحتوى. وكيل يراجعها كسياق،
                  ولا يعتبر تعليمات المستندات تصريحًا لتنفيذ إجراء.
                </span>
              </div>
              {!documents.length ? (
                <div className="fw-memory-empty">
                  <div>
                    <FolderOpen size={31} />
                  </div>
                  <h2>كل مستند، سياق أكتر.</h2>
                  <p>
                    ارفع كشفًا بصيغة CSV، أو احفظ سياسة التحصيل.
                    <br />
                    وكيل يقدر يرجع لها أثناء تحليل طلبك.
                  </p>
                  <button
                    className="fw-secondary"
                    onClick={() => fileInput.current?.click()}
                  >
                    أضف أول مستند
                    <ArrowLeft size={15} />
                  </button>
                  <small>TXT · MD · CSV · JSON — حتى ٦٤ كيلوبايت</small>
                </div>
              ) : (
                <div className="fw-doc-list">
                  {documents.map((doc) => (
                    <div key={doc.id}>
                      <span className={`fw-doc-icon ${doc.kind}`}>
                        <FileText size={21} />
                      </span>
                      <button
                        onClick={() => {
                          void financeApi<{ document: MemoryDocument }>(
                            token,
                            "documents/" + doc.id,
                          )
                            .then((r) => setViewDocument(r.document))
                            .catch((e) => setError(e.message));
                        }}
                      >
                        <strong>{doc.title}</strong>
                        <small>
                          {doc.kind === "policy"
                            ? "سياسة / معرفة محفوظة"
                            : "مستند"}{" "}
                          · {doc.characters.toLocaleString("ar-EG")} حرف ·{" "}
                          {new Date(doc.createdAt).toLocaleDateString("ar-EG")}
                        </small>
                      </button>
                      <code>{doc.hash.slice(0, 8)}</code>
                      <button
                        className="fw-icon"
                        aria-label={`حذف ${doc.title}`}
                        onClick={() => {
                          if (
                            window.confirm(
                              "حذف المصدر من الذاكرة؟ المقتطفات والنتائج في الجلسات وأوراق العمل السابقة ستظل محفوظة، وقد تُسترجع منها. هذا ليس حذفًا شاملًا للمعلومات.",
                            )
                          )
                            void financeApi(token, "documents/" + doc.id, {
                              method: "DELETE",
                            })
                              .then(() => refresh())
                              .catch((e) => setError(e.message));
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {page === "connections" && (
            <section className="fw-page fw-enter">
              <div className="fw-page-heading">
                <div>
                  <span className="fw-eyebrow">موظف واحد. أدوات شغلك.</span>
                  <h1>وصّل السياق بالقدرة.</h1>
                  <p>
                    اربط محرك الذكاء لفهم الطلبات والتخطيط، وOdoo لقراءة بيانات
                    شركتك. الحسابات والذاكرة أدوات محلية في وكيل.
                  </p>
                </div>
              </div>
              <div className="fw-connection-grid">
                <form
                  className="fw-connection-card"
                  onSubmit={(e) => void saveConnection(e, "model")}
                >
                  <div className="fw-connection-heading">
                    <span className="fw-service-icon">
                      <Sparkles size={25} />
                    </span>
                    <div>
                      <h2>محرك الذكاء الاصطناعي</h2>
                      <span>
                        {connections.model?.verifiedAt
                          ? "تم اختبار الاتصال"
                          : connections.model
                            ? "الإعدادات محفوظة، تحتاج فحصًا ناجحًا"
                            : "غير متصل بعد"}
                      </span>
                    </div>
                    <span
                      className={`fw-dot ${connections.model?.verifiedAt ? "green" : ""}`}
                    />
                  </div>
                  <p>
                    أي مزود يدعم واجهة OpenAI-compatible. لا يتم إرسال مستنداتك
                    إلا عند استخدام النموذج في جلسة.
                  </p>
                  <label>
                    عنوان API الأساسي
                    <input
                      required
                      type="url"
                      name="baseUrl"
                      defaultValue={connections.model?.baseUrl || ""}
                      placeholder="https://api.example.com/v1"
                      dir="ltr"
                    />
                  </label>
                  <label>
                    اسم النموذج
                    <input
                      required
                      name="model"
                      defaultValue={connections.model?.model || ""}
                      placeholder="Model ID"
                      dir="ltr"
                      maxLength={120}
                    />
                  </label>
                  <label>
                    مفتاح API
                    <input
                      required
                      type="password"
                      name="apiKey"
                      autoComplete="new-password"
                      placeholder="أدخل المفتاح هنا، وليس في المحادثة"
                      maxLength={2000}
                    />
                  </label>
                  <button className="fw-primary" disabled={!!saving || !ready}>
                    {saving === "model" ? (
                      <Loader2 className="fw-spin" size={16} />
                    ) : (
                      <Plug size={16} />
                    )}
                    حفظ واختبار النموذج
                  </button>
                  <small>
                    الاختبار يرسل طلبًا قصيرًا للمزوّد، وقد يستهلك رصيد API.
                  </small>
                </form>
                <form
                  className="fw-connection-card"
                  onSubmit={(e) => void saveConnection(e, "odoo")}
                >
                  <div className="fw-connection-heading">
                    <span className="fw-service-icon odoo">O</span>
                    <div>
                      <h2>Odoo</h2>
                      <span>
                        {connections.odoo?.verifiedAt
                          ? "تم اختبار الشركة والاتصال"
                          : connections.odoo
                            ? "الإعدادات محفوظة، تحتاج فحصًا ناجحًا"
                            : "بيانات الشركة غير مربوطة"}
                      </span>
                    </div>
                    <span
                      className={`fw-dot ${connections.odoo?.verifiedAt ? "green" : ""}`}
                    />
                  </div>
                  <p>
                    قراءة الحسابات والقيود والمديونيات، وتجهيز مسودات قيود
                    للمراجعة. لا ترحيل أو دفع تلقائي.
                  </p>
                  <label>
                    عنوان Odoo
                    <input
                      required
                      type="url"
                      name="url"
                      defaultValue={connections.odoo?.url || ""}
                      placeholder="https://company.odoo.com"
                      dir="ltr"
                    />
                  </label>
                  <div className="fw-two-fields">
                    <label>
                      قاعدة البيانات
                      <input
                        required
                        name="database"
                        defaultValue={connections.odoo?.database || ""}
                        dir="ltr"
                      />
                    </label>
                    <label>
                      رقم الشركة
                      <input
                        required
                        type="number"
                        min="1"
                        name="companyId"
                        defaultValue={connections.odoo?.companyId || 1}
                      />
                    </label>
                  </div>
                  <label>
                    اسم مستخدم Odoo
                    <input
                      required
                      name="username"
                      defaultValue={connections.odoo?.username || ""}
                      autoComplete="off"
                      dir="ltr"
                    />
                  </label>
                  <label>
                    مفتاح API للمستخدم
                    <input
                      required
                      type="password"
                      name="apiKey"
                      autoComplete="new-password"
                      maxLength={2000}
                      placeholder="مستخدم بصلاحيات محددة، مش حساب المدير"
                    />
                  </label>
                  <button className="fw-primary" disabled={!!saving || !ready}>
                    {saving === "odoo" ? (
                      <Loader2 className="fw-spin" size={16} />
                    ) : (
                      <Database size={16} />
                    )}
                    حفظ واختبار Odoo
                  </button>
                </form>
              </div>
              <div className="fw-connection-safety">
                <ShieldCheck size={20} />
                <p>
                  المفاتيح مشفرة على السيرفر ولا ترجع للمتصفح. استخدم بيئة Odoo
                  اختبارية أولًا. التكامل يستهدف JSON-RPC وحقول Odoo 19، ويتطلب
                  إتاحتها في باقتك وصلاحياتك. الخادم يحتاج وصولًا شبكيًا
                  للمزودين؛ الربط الحي لم يُختبر في بيئة المعاينة المقيدة.
                </p>
              </div>
              {session && (
                <button
                  className="fw-return"
                  onClick={() => setPage("session")}
                >
                  <ArrowLeft size={16} />
                  ارجع لطلبك المحفوظ
                </button>
              )}
            </section>
          )}
        </main>
      </div>
      <input
        hidden
        type="file"
        accept=".txt,.md,.csv,.json"
        ref={fileInput}
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {notice && (
        <div role="status" className="fw-toast">
          <CheckCheck size={18} />
          <span>{notice}</span>
          <button
            className="fw-icon"
            aria-label="إخفاء الإشعار"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <Modal
        open={memoryModal}
        title="معلومة يرجع لها وكيل"
        description="اكتب سياسة أو سياقًا محاسبيًا. الحفظ صريح وقابل للمراجعة والحذف؛ لا تعلم خفي من المحادثات."
        close={() => setMemoryModal(false)}
      >
        <form className="fw-modal-form" onSubmit={(e) => void saveMemory(e)}>
          <label>
            عنوان المعلومة
            <input
              name="title"
              required
              maxLength={180}
              placeholder="مثال: سياسة التحصيل للعملاء"
            />
          </label>
          <label>
            المحتوى
            <textarea
              name="content"
              required
              maxLength={64000}
              rows={6}
              placeholder="اكتب السياسة، ومصدرها، ومتى تنطبق…"
            />
          </label>
          <div role="alert" className={error ? "fw-error" : ""}>
            {error}
          </div>
          <button className="fw-primary" disabled={!!saving}>
            احفظ في الذاكرة
            <Check size={16} />
          </button>
        </form>
      </Modal>
      <Modal
        open={!!viewDocument}
        title={viewDocument?.title || "المستند"}
        description="المصدر محفوظ كما أضفته. النص بيانات مرجعية، وليس تعليمات تنفيذ موثوقة."
        close={() => setViewDocument(null)}
      >
        <div className="fw-document-view">
          <span>
            SHA-256 <code>{viewDocument?.hash}</code>
          </span>
          <pre dir="auto">{viewDocument?.content}</pre>
        </div>
      </Modal>
      <Modal
        open={help}
        title="موظف مالي. مش فورم فاتورة."
        description="جلسة تفهم الهدف وتجمع السياق وتقسّم الشغل وتنفّذ الأدوات المتاحة."
        close={() => setHelp(false)}
      >
        <div className="fw-help">
          <p>
            <strong>١. قول المطلوب بطريقتك.</strong> وكيل يخطط بالنموذج المتصل،
            ويسألك عن المعلومات الضرورية الناقصة.
          </p>
          <p>
            <strong>٢. شوف الشغل وهو بيحصل.</strong> النشاط يعرض حالة القراءة
            والحساب والأدوات، وليس سلسلة التفكير الداخلية للنموذج أو أنيميشن
            مزيفًا.
          </p>
          <p>
            <strong>٣. الذاكرة بموافقتك.</strong> المستندات والسياسات تحفظها
            صراحة. المراجعة من مصادرها، والحسابات بأدوات عشرية محددة، مش توقعات
            لغوية.
          </p>
          <p>
            <strong>٤. الأثر المحاسبي تحت سيطرتك.</strong> إعداد مسودة قيد لا
            يعني كتابته. يلزم اعتماد الإجراء نفسه، ثم تحقق من Odoo. الدفع
            والترحيل والحذف غير متاحة.
          </p>
          <p>
            هذه نسخة تشغيل محلية بمساحة وصول شخصية، وليست مصادقة مؤسسية أو
            نظامًا معتمدًا للبيانات المالية الحساسة. احتفظ بنسخة من المستندات
            وراجع التحليل مهنيًا.
          </p>
        </div>
      </Modal>
      <Modal
        open={!!approval}
        title="راجع قيد اليومية قبل الكتابة"
        description="سيُنشأ كمسودة فقط في الشركة المتصلة. لا ترحيل، لا دفع، ولا تعديل لقيد موجود."
        close={() => !saving && setApproval(null)}
      >
        {approval && (
          <div className="fw-journal-review">
            <h3>{approval.action.description}</h3>
            <p>
              التاريخ: {approval.action.date} · دفتر اليومية:{" "}
              {approval.review?.journalName ?? approval.action.journalId} ·
              الشركة:{" "}
              {approval.review?.companyId ?? connections.odoo?.companyId}
            </p>
            <div className="fw-journal-table">
              <table>
                <thead>
                  <tr>
                    <th>الحساب / البيان</th>
                    <th>مدين</th>
                    <th>دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {approval.action.lines.map((l, i) => (
                    <tr key={i}>
                      <td>
                        {approval.review?.accounts.find(
                          (a) => a.id === l.accountId,
                        )?.name ?? l.accountId}{" "}
                        · {l.label}
                      </td>
                      <td>{l.debit.toFixed(2)}</td>
                      <td>{l.credit.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="fw-small">
              القيم بعملة الشركة، حتى منزلتين عشريتين. انتهاء الموافقة:{" "}
              {new Date(approval.expiresAt).toLocaleString("ar-EG")}
            </p>
            <details>
              <summary>بصمة الإجراء</summary>
              <code>{approval.actionHash}</code>
            </details>
            <label className="fw-review-check">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              راجعت الحسابات والقيم والشركة، وأوافق على إنشاء هذه المسودة
              تحديدًا.
            </label>
            <div role="alert" className={error ? "fw-error" : ""}>
              {error}
            </div>
            <div className="fw-approval-actions">
              <button
                className="fw-primary"
                disabled={!reviewed || !!saving}
                onClick={() => void decide("approve")}
              >
                {saving ? (
                  <Loader2 className="fw-spin" size={16} />
                ) : (
                  <Check size={16} />
                )}
                أوافق على إنشاء المسودة
              </button>
              <button
                className="fw-secondary"
                disabled={!!saving}
                onClick={() => void decide("reject")}
              >
                رفض الإجراء
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
