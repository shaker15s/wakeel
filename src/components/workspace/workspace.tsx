"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowUpLeft,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  ChevronLeft,
  CircleHelp,
  Command,
  Download,
  FileCheck2,
  FileText,
  Fingerprint,
  Home,
  Layers3,
  ListChecks,
  Loader2,
  Menu,
  MoreHorizontal,
  Paperclip,
  Plus,
  Plug,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
  RefreshCw,
  CircleDashed,
} from "lucide-react";
import {
  cancelDemoTask,
  createDemoTask,
  decideDemoApproval,
  getDemoTask,
  listDemoTasks,
  resumeDemoTask,
  type CreateDemoTaskInput,
  type TaskView,
} from "@/lib/demo-invoice-client";
import {
  classifyWorkspaceIntent,
  normalizeDigits,
  TASK_LABELS,
  WORKFLOW_LABELS,
} from "@/lib/workspace-intent";
import "./workspace.css";

type View =
  "home" | "tasks" | "approvals" | "skills" | "connections" | "settings";
type Modal = "invoice" | "help" | "unsupported" | "summary" | null;
const NAV = [
  { id: "home", label: "مساحة العمل", icon: Home },
  { id: "tasks", label: "مهامي", icon: ListChecks },
  { id: "approvals", label: "الموافقات", icon: ShieldCheck },
  { id: "skills", label: "المهارات", icon: Layers3 },
  { id: "connections", label: "التطبيقات", icon: Plug },
] as const;
const STARTERS = [
  {
    title: "جهّز مسودة فاتورة",
    text: "من البيانات إلى مسودة متحققة",
    icon: FileText,
    tone: "mint",
    action: "invoice",
  },
  {
    title: "خلّيني أشوف الصورة كاملة",
    text: "ملخص حقيقي لمهام مساحة العمل",
    icon: ListChecks,
    tone: "blue",
    action: "summary",
  },
  {
    title: "اكتشف إمكانيات وكيل",
    text: "اعرف إيه المتاح، وإيه اللي جاي",
    icon: WandSparkles,
    tone: "peach",
    action: "skills",
  },
] as const;
const EVENT_LABELS: Record<string, string> = {
  task_created: "تم تسجيل المهمة",
  step_started: "بدء خطوة",
  step_succeeded: "اكتملت الخطوة",
  step_failed: "تعذرت الخطوة",
  approval_requested: "طلب موافقة بشرية",
  approval_decided: "تم تسجيل قرارك",
  approval_expired: "انتهت صلاحية الموافقة",
  task_status_changed: "تحديث حالة المهمة",
  verification_result: "نتيجة التحقق",
};
const formatNumber = (n: number) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(n);
const date = (s: string) =>
  new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(s));
const inputOf = (task: TaskView) => task.input as CreateDemoTaskInput;
const titleOf = (task: TaskView) =>
  inputOf(task).memo || `مسودة فاتورة · ${inputOf(task).customerId}`;

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`wk-mark ${small ? "small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M6 10.5 11 23l5-10 5 10 5-13"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="m16 3 .9 3.1L20 7l-3.1.9L16 11l-.9-3.1L12 7l3.1-.9L16 3Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
function ModalFrame({
  open,
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="wk-overlay" />
        <Dialog.Content dir="rtl" className={`wk-dialog ${wide ? "wide" : ""}`}>
          <div className="wk-dialog-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{subtitle}</Dialog.Description>
            </div>
            <Dialog.Close className="wk-icon-button" aria-label="إغلاق">
              <X size={19} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function Status({ task }: { task: TaskView }) {
  return (
    <span className={`wk-status ${task.status}`}>
      <span />
      {TASK_LABELS[task.status]}
    </span>
  );
}

export function Workspace() {
  const [view, setView] = useState<View>("home");
  const [mobile, setMobile] = useState(false);
  const [tenant, setTenant] = useState("");
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [prompt, setPrompt] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [selected, setSelected] = useState<TaskView | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [calm, setCalm] = useState(false);
  const [egg, setEgg] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");
  const [draft, setDraft] = useState<CreateDemoTaskInput>({
    customerId: "",
    memo: "",
    lines: [{ description: "", quantity: 1, unitPrice: 0 }],
  });
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const clicks = useRef(0);
  const operation = useRef(false);
  const intakeKey = useRef("");

  const refresh = useCallback(async (id: string) => {
    try {
      const res = await listDemoTasks(id);
      setTasks(res.tasks);
      setError("");
    } catch {
      setError("تعذّر تحميل المهام. تأكد من الاتصال وأعد المحاولة.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let id = crypto.randomUUID();
    try {
      const saved = localStorage.getItem("wakeel-workspace-id");
      if (saved)
        id = saved as `${string}-${string}-${string}-${string}-${string}`;
      else localStorage.setItem("wakeel-workspace-id", id);
      // Browser-only preference hydration after SSR; external storage is the source.
      setCalm(localStorage.getItem("wakeel-calm") === "true");
    } catch {
      setNotice(
        "التخزين في المتصفح غير متاح؛ قد لا تتمكن من العودة لهذه المساحة بعد إغلاق الصفحة.",
      );
    }
    setTenant(id);
    void refresh(id);
    const focus = () => {
      void refresh(id);
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setView("home");
        setMobile(false);
        setTimeout(() => promptRef.current?.focus(), 50);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    if (!egg) return;
    const id = setTimeout(() => setEgg(false), 2400);
    return () => clearTimeout(id);
  }, [egg]);

  const pending = tasks.filter(
    (t) => t.pendingApproval && t.status === "waiting_for_approval",
  );
  const completed = tasks.filter((t) => t.status === "succeeded");
  const needsReview = tasks.filter((t) =>
    ["partially_succeeded", "failed", "expired"].includes(t.status),
  );
  const navigate = (next: View) => {
    setView(next);
    setMobile(false);
    setSearch("");
    setFilter("all");
  };
  const openInvoice = (example = false) => {
    intakeKey.current = crypto.randomUUID();
    setFormError("");
    setDraft(
      example
        ? {
            customerId: "DEMO-101",
            memo: "خدمات تصميم · مثال تجريبي",
            lines: [
              { description: "تصميم هوية بصرية", quantity: 1, unitPrice: 2500 },
            ],
          }
        : {
            customerId: "",
            memo: prompt.slice(0, 500),
            lines: [{ description: "", quantity: 1, unitPrice: 0 }],
          },
    );
    setModal("invoice");
  };
  const routePrompt = () => {
    if (!prompt.trim()) {
      promptRef.current?.focus();
      return;
    }
    const intent = classifyWorkspaceIntent(prompt);
    if (intent === "invoice") openInvoice();
    else if (intent === "summary") setModal("summary");
    else if (intent === "capabilities") navigate("skills");
    else setModal("unsupported");
  };
  const openTask = async (task: TaskView) => {
    setSelected(task);
    setReviewed(false);
    setReason("");
    setFormError("");
    try {
      const latest = await getDemoTask(tenant, task.id);
      setSelected((current) =>
        current?.id === task.id ? latest.task : current,
      );
    } catch {
      setNotice("تعذّر تحديث المهمة؛ المعروض آخر نسخة محمّلة.");
    }
  };
  async function submitInvoice(e: FormEvent) {
    e.preventDefault();
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setFormError("");
    try {
      if (
        !draft.customerId.trim() ||
        draft.lines.some(
          (l) =>
            !l.description.trim() ||
            !Number.isFinite(l.quantity) ||
            l.quantity <= 0 ||
            !Number.isFinite(l.unitPrice) ||
            l.unitPrice < 0,
        )
      )
        throw new Error(
          "راجع العميل وبنود الفاتورة. الكمية موجبة والسعر لا يقل عن صفر.",
        );
      const res = await createDemoTask(tenant, draft, intakeKey.current);
      setTasks((old) => [res.task, ...old.filter((t) => t.id !== res.task.id)]);
      setModal(null);
      setPrompt("");
      setSelected(res.task);
      setReviewed(false);
      setReason("");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "تعذر إنشاء المهمة.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function taskAction(
    action: "approved" | "rejected" | "cancel" | "resume",
  ) {
    if (!selected || operation.current || (action === "approved" && !reviewed))
      return;
    operation.current = true;
    setBusy(true);
    setFormError("");
    try {
      const res =
        action === "cancel"
          ? await cancelDemoTask(
              tenant,
              selected.id,
              reason || "ألغيت بواسطة المستخدم",
            )
          : action === "resume"
            ? await resumeDemoTask(tenant, selected.id)
            : await decideDemoApproval(tenant, selected.id, action, { reason });
      setSelected(res.task);
      setTasks((old) => old.map((t) => (t.id === res.task.id ? res.task : t)));
      setReviewed(false);
      if (res.task.status === "succeeded")
        setNotice(
          "اكتملت المسودة التجريبية وتم التحقق من بياناتها. إيصال التنفيذ جاهز.",
        );
    } catch {
      setFormError(
        "لم يتم تأكيد العملية. حدّث حالة المهمة قبل المحاولة مجددًا؛ لا تفترض أنها نُفّذت.",
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  function downloadReceipt(task: TaskView) {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            receiptVersion: 1,
            environment: "synthetic-demo",
            exportedAt: new Date().toISOString(),
            task,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wakeel-receipt-${task.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!/\.(txt|json)$/i.test(file.name) || file.size > 8192) {
      setNotice(
        "ارفق ملف TXT أو JSON فقط، بحد أقصى 8 كيلوبايت. لا ترفق بيانات حساسة.",
      );
      return;
    }
    try {
      const text = await file.text();
      setPrompt(text.slice(0, 4000));
      setNotice(
        "تمت قراءة النص محليًا. راجع البيانات قبل بدء المهمة؛ لا يوجد OCR في هذه النسخة.",
      );
      promptRef.current?.focus();
    } catch {
      setNotice("تعذرت قراءة الملف. جرّب لصق النص مباشرة.");
    }
  }
  const taskRows = (list: TaskView[]) =>
    list.map((task) => (
      <button
        type="button"
        className="wk-task-row"
        key={task.id}
        onClick={() => void openTask(task)}
      >
        <span
          className={`wk-task-icon ${task.status === "succeeded" ? "done" : ""}`}
        >
          {task.status === "succeeded" ? (
            <FileCheck2 size={20} />
          ) : (
            <FileText size={20} />
          )}
        </span>
        <span className="wk-task-name">
          <strong>{titleOf(task)}</strong>
          <small>{date(task.createdAt)} · محاكاة محلية</small>
        </span>
        <Status task={task} />
        <ChevronLeft size={17} />
      </button>
    ));
  const visibleTasks = (view === "approvals" ? pending : tasks).filter(
    (t) =>
      (filter === "all" || t.status === filter) &&
      `${titleOf(t)} ${inputOf(t).customerId}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const activeName = NAV.find((n) => n.id === view)?.label || "التفضيلات";

  return (
    <div className={`wk-app ${calm ? "wk-calm" : ""}`} dir="rtl" lang="ar">
      <a href="#wk-main" className="wk-skip">
        انتقل إلى المحتوى
      </a>
      {mobile && (
        <button
          className="wk-mobile-backdrop"
          onClick={() => setMobile(false)}
          aria-label="إغلاق القائمة"
        />
      )}
      <aside className={`wk-sidebar ${mobile ? "is-open" : ""}`}>
        <button
          className="wk-brand"
          aria-label="وكيل، مساحة العمل"
          onClick={() => {
            navigate("home");
            clicks.current++;
            if (clicks.current % 5 === 0) {
              setEgg(true);
              setNotice("لقيت السر ✨ أحسن موظف يعرف إمتى يرجع لك.");
            }
          }}
        >
          <Mark />
          <span>
            وكيل<span className="wk-brand-dot">.</span>
          </span>
          <span className="wk-beta">BETA</span>
        </button>
        <button
          className="wk-workspace-switch"
          onClick={() => setModal("help")}
        >
          <span className="wk-workspace-avatar">و</span>
          <span>
            <strong>مساحتي الشخصية</strong>
            <small>بيئة تجريبية آمنة</small>
          </span>
          <MoreHorizontal size={18} />
        </button>
        <button
          className="wk-new-task"
          onClick={() => {
            navigate("home");
            setPrompt("");
            setTimeout(() => promptRef.current?.focus(), 50);
          }}
        >
          <Plus size={19} />
          مهمة جديدة<kbd>⌘ K</kbd>
        </button>
        <span className="wk-nav-label">مساحتك</span>
        <nav aria-label="القائمة الرئيسية">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`wk-nav-item ${view === id ? "active" : ""}`}
              onClick={() => navigate(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "approvals" && pending.length > 0 && (
                <b>{formatNumber(pending.length)}</b>
              )}
              {id === "connections" && <span className="wk-tiny-dot" />}
            </button>
          ))}
        </nav>
        <div className="wk-sidebar-bottom">
          <div className="wk-trust-note">
            <ShieldCheck size={23} />
            <strong>القرار دايمًا في إيدك.</strong>
            <p>وكيل يجهّز الخطوات، وأنت توافق قبل أي تغيير.</p>
            <button onClick={() => setModal("help")}>
              اعرف إزاي بنحمي شغلك <ArrowLeft size={14} />
            </button>
          </div>
          <button
            className={`wk-nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={19} />
            التفضيلات
          </button>
          <button className="wk-profile" onClick={() => setModal("help")}>
            <span>أ</span>
            <span>
              <strong>أهلًا بيك</strong>
              <small>مساحة محلية · بدون تسجيل</small>
            </span>
            <CircleHelp size={18} />
          </button>
        </div>
      </aside>
      <div className="wk-content">
        <header className="wk-header">
          <div className="wk-breadcrumb">
            <button
              className="wk-icon-button wk-menu"
              onClick={() => setMobile(true)}
              aria-label="فتح القائمة"
            >
              <Menu size={22} />
            </button>
            <span>مساحتي</span>
            <ChevronLeft size={14} />
            <strong>{activeName}</strong>
          </div>
          <div className="wk-header-actions">
            <span className="wk-demo-pill">
              <span />
              وضع التجربة
            </span>
            <button
              className="wk-icon-button"
              aria-label="المساعدة"
              onClick={() => setModal("help")}
            >
              <CircleHelp size={19} />
            </button>
            <button
              className="wk-icon-button wk-notification"
              aria-label={`الموافقات: ${pending.length}`}
              onClick={() => navigate("approvals")}
            >
              <Bell size={19} />
              {pending.length > 0 && <i />}
            </button>
            <span className="wk-user-avatar">أ</span>
          </div>
        </header>
        <main id="wk-main" className="wk-main">
          {error && (
            <div role="alert" className="wk-alert">
              {error}
              <button onClick={() => void refresh(tenant)}>
                إعادة المحاولة <RefreshCw size={14} />
              </button>
            </div>
          )}
          {view === "home" && (
            <div className="wk-home wk-enter">
              <section className="wk-hero">
                <div
                  className={`wk-orbit ${egg ? "easter" : ""}`}
                  aria-hidden="true"
                >
                  <div className="wk-orbit-ring one" />
                  <div className="wk-orbit-ring two" />
                  <div className="wk-orbit-dot" />
                  <span className="wk-orbit-core">
                    <Sparkles size={34} strokeWidth={1.4} />
                  </span>
                  <span className="wk-orbit-spark">✧</span>
                </div>
                <div className="wk-hero-eyebrow">
                  <span />
                  مساحة أقل. إنجاز أكثر.
                </div>
                <h1>
                  عندك شغل في بالك؟
                  <br />
                  <span>وكيل يرتّب لك الخطوات.</span>
                </h1>
                <p className="wk-hero-copy">
                  من أول فكرة لآخر خطوة. اطلب، راجع، وخليك مطمّن.
                </p>
                <form
                  className="wk-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    routePrompt();
                  }}
                >
                  <div className="wk-composer-input">
                    <Sparkles size={21} />
                    <textarea
                      ref={promptRef}
                      aria-label="اطلب من وكيل"
                      placeholder="عايز تنجز إيه النهارده؟"
                      value={prompt}
                      maxLength={4000}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          routePrompt();
                        }
                      }}
                      rows={2}
                    />
                  </div>
                  <div className="wk-composer-bottom">
                    <div>
                      <button
                        type="button"
                        className="wk-attach"
                        onClick={() => uploadRef.current?.click()}
                        aria-label="إرفاق نص محلي"
                      >
                        <Paperclip size={17} />
                        <span>أرفق نص</span>
                      </button>
                      <span className="wk-composer-separator" />
                      <span className="wk-local-label">
                        <ShieldCheck size={14} />
                        تجربة بدون بيانات حقيقية
                      </span>
                    </div>
                    <button
                      className="wk-primary"
                      type="submit"
                      disabled={!prompt.trim() || !tenant}
                    >
                      ابدأ المهمة <ArrowLeft size={17} />
                    </button>
                  </div>
                  <input
                    ref={uploadRef}
                    type="file"
                    accept=".txt,.json"
                    hidden
                    onChange={(e) => {
                      void upload(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </form>
                <div className="wk-input-hint">
                  <span>
                    <kbd>↵</kbd> للبدء <span className="wk-hint-dot">·</span>{" "}
                    <kbd>Shift ↵</kbd> لسطر جديد
                  </span>
                  <span>توجيه محلي للطلبات · لا يوجد نموذج AI متصل</span>
                </div>
              </section>
              <section className="wk-starters" aria-label="ابدأ بفكرة">
                {STARTERS.map(({ title, text, icon: Icon, tone, action }) => (
                  <button
                    key={action}
                    onClick={() =>
                      action === "invoice"
                        ? openInvoice(true)
                        : action === "skills"
                          ? navigate("skills")
                          : setModal("summary")
                    }
                  >
                    <span className={`wk-starter-icon ${tone}`}>
                      <Icon size={21} />
                    </span>
                    <span>
                      <strong>{title}</strong>
                      <small>{text}</small>
                    </span>
                    <ArrowUpLeft size={17} />
                  </button>
                ))}
              </section>
              <section className="wk-how">
                <div>
                  <span className="wk-section-kicker">
                    مش مجرد إجابة. خطوات تقدر تتابعها.
                  </span>
                  <h2>كل مهمة، بطريق واضح.</h2>
                </div>
                <div className="wk-how-steps">
                  {[
                    "راجع البيانات",
                    "افحص السياسة",
                    "خد موافقتك",
                    "نفّذ واتحقق",
                  ].map((s, i) => (
                    <div key={s}>
                      <span>
                        {i === 3 ? <CheckCheck size={17} /> : `0${i + 1}`}
                      </span>
                      <strong>{s}</strong>
                      {i < 3 && <ChevronLeft size={13} />}
                    </div>
                  ))}
                </div>
              </section>
              <section className="wk-recent">
                <div className="wk-section-heading">
                  <h2>
                    آخر مهامك <span>{formatNumber(tasks.length)}</span>
                  </h2>
                  <button onClick={() => navigate("tasks")}>
                    كل المهام <ArrowLeft size={15} />
                  </button>
                </div>
                {loading ? (
                  <div className="wk-loading">
                    <Loader2 className="wk-spin" size={21} /> جارٍ تحميل مساحة
                    العمل…
                  </div>
                ) : tasks.length ? (
                  <div>{taskRows(tasks.slice(0, 3))}</div>
                ) : (
                  <div className="wk-empty-inline">
                    <span className="wk-empty-art">
                      <ListChecks size={25} />
                      <i>
                        <Plus size={11} />
                      </i>
                    </span>
                    <div>
                      <strong>أول إنجاز ليك يبدأ من هنا</strong>
                      <p>جرّب مهمة بسيطة، وشوف كل خطوة بتحصل قدامك.</p>
                    </div>
                    <button
                      className="wk-secondary"
                      onClick={() => openInvoice(true)}
                    >
                      جرّب مثال جاهز <ArrowLeft size={15} />
                    </button>
                  </div>
                )}
              </section>
              <footer className="wk-footer">
                <span>
                  <Mark small />
                  مصمم عشان تركز على اللي يهم.
                </span>
                <span>محاكاة ERP · موافقة بشرية · نتيجة قابلة للفحص</span>
              </footer>
            </div>
          )}
          {(view === "tasks" || view === "approvals") && (
            <section className="wk-page wk-enter">
              <div className="wk-page-heading">
                <div>
                  <span className="wk-section-kicker">كل خطوة ليها أثر</span>
                  <h1>
                    {view === "approvals"
                      ? "القرار عندك."
                      : "شغلك، من غير ما يتوه."}
                  </h1>
                  <p>
                    {view === "approvals"
                      ? "راجع تفاصيل الإجراء بالضبط قبل الموافقة. لا كتابة بدون إذنك."
                      : "آخر ١٠٠ مهمة محفوظة على هذا السيرفر، حتى بعد إعادة تشغيله."}
                  </p>
                </div>
                <button className="wk-primary" onClick={() => openInvoice()}>
                  <Plus size={17} />
                  مهمة جديدة
                </button>
              </div>
              <div className="wk-stats">
                <div>
                  <span>إجمالي المهام المعروضة</span>
                  <strong>{formatNumber(tasks.length)}</strong>
                </div>
                <div>
                  <span>بانتظار موافقتك</span>
                  <strong className="amber">
                    {formatNumber(pending.length)}
                  </strong>
                </div>
                <div>
                  <span>مكتملة ومتحققة</span>
                  <strong className="green">
                    {formatNumber(completed.length)}
                  </strong>
                </div>
              </div>
              <div className="wk-list-panel">
                <div className="wk-list-toolbar">
                  <label className="wk-search">
                    <Search size={17} />
                    <input
                      aria-label="ابحث في المهام"
                      placeholder="ابحث باسم المهمة أو العميل…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  {view === "tasks" && (
                    <select
                      aria-label="تصفية الحالة"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">كل الحالات</option>
                      {Object.entries(TASK_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    className="wk-icon-button"
                    aria-label="تحديث المهام"
                    onClick={() => void refresh(tenant)}
                  >
                    <RefreshCw size={17} />
                  </button>
                </div>
                {loading ? (
                  <div className="wk-loading">جارٍ التحميل…</div>
                ) : visibleTasks.length ? (
                  taskRows(visibleTasks)
                ) : (
                  <div className="wk-empty">
                    <CircleDashed size={38} />
                    <h3>
                      {view === "approvals"
                        ? "مفيش موافقات مستنية."
                        : "مفيش مهام هنا لسه."}
                    </h3>
                    <p>
                      {search || filter !== "all"
                        ? "جرّب تغيير البحث أو فلتر الحالة."
                        : "ابدأ بمسودة فاتورة تجريبية، وراجع خطواتها بنفسك."}
                    </p>
                    <button
                      className="wk-secondary"
                      onClick={() => openInvoice(true)}
                    >
                      جرّب مهمة
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}
          {view === "skills" && (
            <section className="wk-page wk-enter">
              <div className="wk-page-heading">
                <div>
                  <span className="wk-section-kicker">
                    قدرات واضحة. مش وعود مفتوحة.
                  </span>
                  <h1>لكل شغل، مهارة.</h1>
                  <p>
                    المهارات المتاحة هنا محددة وقابلة للاختبار. المهام العامة
                    تحتاج نموذجًا وخدمات متصلة.
                  </p>
                </div>
                <span className="wk-soft-tag">٣ قدرات محلية</span>
              </div>
              <div className="wk-skill-grid">
                {[
                  {
                    icon: FileText,
                    title: "مسودة فاتورة",
                    description:
                      "مراجعة المدخلات، فحص السياسة، موافقتك، إنشاء مسودة والتحقق منها.",
                    badge: "تنفيذ تجريبي",
                    action: () => openInvoice(true),
                    cta: "جرّب المهارة",
                    color: "mint",
                  },
                  {
                    icon: ListChecks,
                    title: "ملخص مساحة العمل",
                    description:
                      "إحصاءات مباشرة من مهامك المحفوظة، بدون أرقام أو وفورات مختلقة.",
                    badge: "قراءة فقط",
                    action: () => setModal("summary"),
                    cta: "اعرض الملخص",
                    color: "blue",
                  },
                  {
                    icon: Fingerprint,
                    title: "إيصال التنفيذ",
                    description:
                      "تتبّع حالة الخطوات والموافقات ونتيجة التحقق. نزّل السجل بصيغة JSON.",
                    badge: "دليل قابل للفحص",
                    action: () => navigate("tasks"),
                    cta: "افتح مهامك",
                    color: "peach",
                  },
                ].map(
                  ({
                    icon: Icon,
                    title,
                    description,
                    badge,
                    action,
                    cta,
                    color,
                  }) => (
                    <article className="wk-skill-card" key={title}>
                      <div>
                        <span className={`wk-starter-icon ${color}`}>
                          <Icon size={25} />
                        </span>
                        <span className="wk-soft-tag">{badge}</span>
                      </div>
                      <h2>{title}</h2>
                      <p>{description}</p>
                      <button onClick={action}>
                        {cta}
                        <ArrowLeft size={16} />
                      </button>
                    </article>
                  ),
                )}
              </div>
              <div className="wk-boundary">
                <ShieldCheck size={25} />
                <div>
                  <h3>وكيل يعرف حدوده.</h3>
                  <p>
                    إرسال الإيميلات، الدفع، التصفح المستقل، والتخطيط العام
                    بالذكاء الاصطناعي غير مفعّلة. المحاكاة لا تنشئ أي فاتورة في
                    Odoo حقيقي.
                  </p>
                </div>
                <a href="/demo/invoice">
                  مختبر الأعطال <ArrowUpLeft size={16} />
                </a>
              </div>
            </section>
          )}
          {view === "connections" && (
            <section className="wk-page wk-enter">
              <div className="wk-page-heading">
                <div>
                  <span className="wk-section-kicker">
                    الأدوات الصح، في المكان الصح
                  </span>
                  <h1>شغلك مش في تطبيق واحد.</h1>
                  <p>
                    هذه صفحة حالة الاتصالات، وليست تدفق OAuth. لا توجد حسابات
                    خارجية متصلة بهذه المساحة.
                  </p>
                </div>
              </div>
              <div className="wk-connection-list">
                {[
                  {
                    name: "ERP Sandbox",
                    letter: "W",
                    description:
                      "بيانات محاكاة محفوظة محليًا. كتابة مسودات فقط بعد الموافقة.",
                    ready: true,
                  },
                  {
                    name: "Odoo",
                    letter: "O",
                    description:
                      "موصّل موجود في الكود؛ يحتاج بيئة اختبار ومصادقة وربطًا بالـ runtime.",
                    ready: false,
                  },
                  {
                    name: "Google Workspace",
                    letter: "G",
                    description:
                      "البريد والمستندات والتقويم: غير موصّلة بالتطبيق. صلاحيات محددة مطلوبة.",
                    ready: false,
                  },
                  {
                    name: "Microsoft 365",
                    letter: "M",
                    description:
                      "Outlook وTeams وOneDrive: تكامل مستقبلي، غير منفّذ هنا.",
                    ready: false,
                  },
                ].map((c) => (
                  <div className="wk-connection" key={c.name}>
                    <span className={`wk-app-letter ${c.ready ? "ready" : ""}`}>
                      {c.letter}
                    </span>
                    <div>
                      <h3 dir="ltr">{c.name}</h3>
                      <p>{c.description}</p>
                    </div>
                    <span className={`wk-soft-tag ${c.ready ? "green" : ""}`}>
                      {c.ready ? "محاكاة محلية" : "غير متصل"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="wk-info">
                <ShieldCheck size={19} />
                لا تدخل مفاتيح API أو بيانات عملاء في مساحة التجربة. الربط
                الحقيقي يحتاج إدارة أسرار ومصادقة خادمية.
              </div>
            </section>
          )}
          {view === "settings" && (
            <section className="wk-page wk-enter">
              <div className="wk-page-heading">
                <div>
                  <span className="wk-section-kicker">على راحتك</span>
                  <h1>مساحة شبهك.</h1>
                  <p>اختيارات بسيطة. سياسات الأمان ليست إعدادًا يمكن تعطيله.</p>
                </div>
              </div>
              <div className="wk-settings">
                <div>
                  <span>
                    <strong>وضع هادئ</strong>
                    <small>
                      إيقاف الحركات الزخرفية. نحترم إعداد تقليل الحركة في جهازك
                      أيضًا.
                    </small>
                  </span>
                  <button
                    role="switch"
                    aria-label="وضع هادئ"
                    aria-checked={calm}
                    className={`wk-switch ${calm ? "on" : ""}`}
                    onClick={() => {
                      setCalm(!calm);
                      try {
                        localStorage.setItem("wakeel-calm", String(!calm));
                      } catch {
                        setNotice("تم تطبيق الإعداد لهذه الجلسة فقط.");
                      }
                    }}
                  >
                    <i />
                  </button>
                </div>
                <div>
                  <span>
                    <strong>الموافقة على الكتابة</strong>
                    <small>
                      مطلوبة لكل مسودة. لا تُلغى من الواجهة ولا من مدخلات الطلب.
                    </small>
                  </span>
                  <span className="wk-soft-tag green">
                    <ShieldCheck size={14} />
                    مفعّلة دائمًا
                  </span>
                </div>
                <div>
                  <span>
                    <strong>حفظ المهام</strong>
                    <small>
                      SQLite على قرص السيرفر. ليس تخزينًا سحابيًا أو خدمة متعددة
                      النسخ.
                    </small>
                  </span>
                  <span className="wk-soft-tag">محلي</span>
                </div>
                <div>
                  <span>
                    <strong>مساحة التجربة</strong>
                    <small>
                      تعريف عشوائي محفوظ في المتصفح، وليس حساب مستخدم موثّقًا.
                    </small>
                  </span>
                  <code>{tenant.slice(0, 8)}</code>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
      {notice && (
        <div role="status" className="wk-toast">
          <ShieldCheck size={19} />
          <span>{notice}</span>
          <button aria-label="إخفاء الإشعار" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}

      <ModalFrame
        open={modal === "invoice"}
        title="خلّينا نجهّز مسودة الفاتورة"
        subtitle="املأ البيانات الناقصة. هنراجعها ونطلب موافقتك قبل الإنشاء في المحاكاة."
        onClose={() => !busy && setModal(null)}
        wide
      >
        <form onSubmit={submitInvoice} className="wk-invoice-form">
          <div className="wk-info">
            <ShieldCheck size={17} />
            محاكاة فقط · بدون دفع أو ترحيل محاسبي · القيم بدون ضرائب أو عملة
            محددة
          </div>
          <div className="wk-field-grid">
            <label>
              معرّف العميل التجريبي
              <input
                required
                maxLength={100}
                placeholder="مثل DEMO-101"
                value={draft.customerId}
                onChange={(e) =>
                  setDraft({ ...draft, customerId: e.target.value })
                }
              />
            </label>
            <label>
              اسم المهمة / ملاحظة
              <input
                maxLength={500}
                placeholder="مثل: خدمات تصميم لشهر أكتوبر"
                value={draft.memo}
                onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
              />
            </label>
          </div>
          <div className="wk-invoice-labels">
            <span>وصف البند</span>
            <span>الكمية</span>
            <span>سعر الوحدة</span>
            <span />
          </div>
          {draft.lines.map((line, i) => (
            <div className="wk-invoice-line" key={i}>
              <input
                required
                aria-label={`وصف البند ${i + 1}`}
                maxLength={500}
                placeholder="اسم الخدمة أو المنتج"
                value={line.description}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    lines: draft.lines.map((l, j) =>
                      j === i ? { ...l, description: e.target.value } : l,
                    ),
                  })
                }
              />
              <input
                required
                aria-label={`كمية البند ${i + 1}`}
                type="number"
                min="0.01"
                step="any"
                value={Number.isNaN(line.quantity) ? "" : line.quantity}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    lines: draft.lines.map((l, j) =>
                      j === i
                        ? {
                            ...l,
                            quantity: Number.parseFloat(
                              normalizeDigits(e.target.value),
                            ),
                          }
                        : l,
                    ),
                  })
                }
              />
              <input
                required
                aria-label={`سعر البند ${i + 1}`}
                type="number"
                min="0"
                step="any"
                value={Number.isNaN(line.unitPrice) ? "" : line.unitPrice}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    lines: draft.lines.map((l, j) =>
                      j === i
                        ? {
                            ...l,
                            unitPrice: Number.parseFloat(
                              normalizeDigits(e.target.value),
                            ),
                          }
                        : l,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="wk-icon-button"
                disabled={draft.lines.length === 1}
                aria-label={`حذف البند ${i + 1}`}
                onClick={() =>
                  setDraft({
                    ...draft,
                    lines: draft.lines.filter((_, j) => j !== i),
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div className="wk-invoice-total">
            <button
              type="button"
              className="wk-text-button"
              disabled={draft.lines.length >= 20}
              onClick={() =>
                setDraft({
                  ...draft,
                  lines: [
                    ...draft.lines,
                    { description: "", quantity: 1, unitPrice: 0 },
                  ],
                })
              }
            >
              <Plus size={16} />
              إضافة بند
            </button>
            <span>
              الإجمالي{" "}
              <strong>
                {formatNumber(
                  draft.lines.reduce(
                    (s, l) => s + (l.quantity * l.unitPrice || 0),
                    0,
                  ),
                )}
              </strong>
            </span>
          </div>
          <div className="wk-plan-preview">
            <h3>
              <ListChecks size={18} />
              خطة المهمة
            </h3>
            <ol>
              {Object.values(WORKFLOW_LABELS).map((label) => (
                <li key={label}>
                  <Check size={13} />
                  {label}
                </li>
              ))}
            </ol>
          </div>
          {formError && (
            <p role="alert" className="wk-form-error">
              {formError}
            </p>
          )}
          <div className="wk-dialog-footer">
            <span>هذه الخطوة لا تنشئ فاتورة بعد.</span>
            <button className="wk-primary" disabled={busy || !tenant}>
              {busy ? (
                <Loader2 className="wk-spin" size={17} />
              ) : (
                <ArrowLeft size={17} />
              )}
              راجع وأنشئ المهمة
            </button>
          </div>
        </form>
      </ModalFrame>

      <ModalFrame
        open={!!selected}
        title={selected ? titleOf(selected) : "المهمة"}
        subtitle="المصدر: ERP تجريبي محلي. الحالة والخطوات من محرك التنفيذ، وليست رسوم تقدم تقديرية."
        onClose={() => {
          if (!busy) {
            setSelected(null);
            setFormError("");
          }
        }}
        wide
      >
        {selected && (
          <div className="wk-task-detail">
            <div className="wk-detail-bar">
              <Status task={selected} />
              <span>{date(selected.createdAt)}</span>
              <button
                className="wk-icon-button"
                aria-label="تحديث حالة المهمة"
                disabled={busy}
                onClick={() => void openTask(selected)}
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <ol className="wk-timeline">
              {selected.steps.map((step, i) => (
                <li key={step.id} className={step.status}>
                  <span className="wk-step-indicator">
                    {step.status === "succeeded" ? (
                      <Check size={16} />
                    ) : step.status === "failed" ? (
                      <X size={16} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div>
                    <strong>{WORKFLOW_LABELS[step.name]}</strong>
                    <small>
                      {step.status === "succeeded"
                        ? "تمت الخطوة"
                        : step.status === "waiting_for_approval"
                          ? "متوقف بأمان، في انتظار قرارك"
                          : step.status === "failed"
                            ? "تحتاج تدخلًا"
                            : step.status === "running"
                              ? "قيد التنفيذ"
                              : "لم تبدأ بعد"}
                      {step.attempt > 0 &&
                        ` · محاولة ${formatNumber(step.attempt)}`}
                    </small>
                  </div>
                  {step.status === "succeeded" && <CheckCheck size={15} />}
                </li>
              ))}
            </ol>
            <div className="wk-approved-data">
              <h3>الإجراء المطلوب: إنشاء مسودة فقط</h3>
              <div>
                <span>
                  العميل <b dir="auto">{inputOf(selected).customerId}</b>
                </span>
                <span>
                  الإجمالي{" "}
                  <b>
                    {formatNumber(
                      inputOf(selected).lines.reduce(
                        (s, l) => s + l.quantity * l.unitPrice,
                        0,
                      ),
                    )}
                  </b>
                </span>
              </div>
              <ul>
                {inputOf(selected).lines.map((l, i) => (
                  <li key={i}>
                    <span>{l.description}</span>
                    <span>
                      {formatNumber(l.quantity)} × {formatNumber(l.unitPrice)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {selected.pendingApproval && (
              <div className="wk-approval-box">
                <h3>
                  <ShieldCheck size={20} />
                  راجع التفاصيل. أنت صاحب القرار.
                </h3>
                <p>
                  الموافقة مربوطة بهذه البيانات تحديدًا. لا دفع، لا إرسال، ولا
                  ترحيل. تنتهي صلاحيتها في{" "}
                  {date(selected.pendingApproval.expiresAt)}.
                </p>
                <details>
                  <summary>بصمة الإجراء المعتمَد</summary>
                  <code>{selected.pendingApproval.actionHash}</code>
                  <small>
                    السياسة: {selected.pendingApproval.policyVersion}
                  </small>
                </details>
                <label className="wk-review-check">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  راجعت العميل والبنود والقيم وأوافق على إنشاء مسودة تجريبية.
                </label>
                <input
                  aria-label="سبب القرار"
                  placeholder="ملاحظة على القرار (اختياري)"
                  value={reason}
                  maxLength={1000}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className="wk-approval-actions">
                  <button
                    className="wk-primary"
                    disabled={busy || !reviewed}
                    onClick={() => void taskAction("approved")}
                  >
                    {busy ? (
                      <Loader2 className="wk-spin" size={16} />
                    ) : (
                      <Check size={16} />
                    )}
                    أوافق، أنشئ المسودة
                  </button>
                  <button
                    className="wk-secondary"
                    disabled={busy}
                    onClick={() => void taskAction("rejected")}
                  >
                    رفض الإجراء
                  </button>
                </div>
              </div>
            )}
            {selected.result && (
              <div
                className={`wk-result ${selected.status === "succeeded" ? "success" : ""}`}
              >
                <ShieldCheck size={22} />
                <div>
                  <h3>
                    {selected.status === "succeeded"
                      ? "تم الإنشاء، واتحققنا من النتيجة."
                      : TASK_LABELS[selected.status]}
                  </h3>
                  <p>
                    {selected.status === "succeeded"
                      ? "أعاد المحرك قراءة السجل وتحقق من العميل والحالة والقيم والبنود في النظام التجريبي."
                      : selected.result.summary}
                  </p>
                  {selected.result.unresolvedIssues.length > 0 && (
                    <ul dir="auto">
                      {selected.result.unresolvedIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            <details className="wk-evidence">
              <summary>
                <Fingerprint size={17} />
                سجل التنفيذ{" "}
                <span>{formatNumber(selected.events.length)} حدث</span>
              </summary>
              <ol>
                {selected.events.map((event) => (
                  <li key={event.id}>
                    <span>{EVENT_LABELS[event.type] || event.type}</span>
                    <time>{date(event.createdAt)}</time>
                    <details>
                      <summary>البيانات</summary>
                      <pre dir="ltr">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </details>
                  </li>
                ))}
              </ol>
            </details>
            {formError && (
              <p role="alert" className="wk-form-error">
                {formError}
              </p>
            )}
            <div className="wk-dialog-footer">
              <button
                className="wk-secondary"
                onClick={() => downloadReceipt(selected)}
              >
                <Download size={16} />
                تنزيل إيصال JSON
              </button>
              <div className="wk-inline-actions">
                {!selected.result && (
                  <>
                    <button
                      className="wk-text-button"
                      disabled={busy}
                      onClick={() => void taskAction("resume")}
                    >
                      <RefreshCw size={14} />
                      استئناف آمن
                    </button>
                    <button
                      className="wk-text-button danger"
                      disabled={busy}
                      onClick={() => void taskAction("cancel")}
                    >
                      إلغاء المهمة
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </ModalFrame>

      <ModalFrame
        open={modal === "help"}
        title="موظف رقمي، بحدود واضحة."
        subtitle="نسخة محلية لتجربة التشغيل المسؤول، وليست منتجًا جاهزًا لبيانات الإنتاج."
        onClose={() => setModal(null)}
      >
        <div className="wk-help">
          <div>
            <ShieldCheck />
            <h3>مفيش تغيير من وراك</h3>
            <p>
              التنفيذ ينتظر موافقتك على البيانات نفسها. المحرك يتحقق من النتيجة
              قبل إعلان النجاح.
            </p>
          </div>
          <div>
            <BookOpen />
            <h3>كل خطوة ليها سجل</h3>
            <p>
              المهام والموافقات والنتائج محفوظة محليًا في SQLite. استئناف المهمة
              لا يعيد الخطوات المكتملة.
            </p>
          </div>
          <div>
            <Plug />
            <h3>دي تجربة، مش حساباتك الحقيقية</h3>
            <p>
              لا Odoo حقيقي ولا نموذج لغوي متصل. التوجيه يعتمد على كلمات
              مفتاحية. استخدم بيانات وهمية فقط. سجل التنفيذ ليس سجلًا غير قابل
              للتلاعب من مسؤول السيرفر.
            </p>
          </div>
          <div className="wk-info">
            <Command size={17} />
            اختصار Ctrl / ⌘ + K يفتح مساحة طلب جديدة. جرّب الضغط على شعار وكيل ٥
            مرات ✨
          </div>
        </div>
      </ModalFrame>
      <ModalFrame
        open={modal === "unsupported"}
        title="طلبك محتاج مهارة مش متصلة لسه."
        subtitle="مش هنحوّل طلب عام لنجاح وهمي أو ننفّذ إجراء مختلف من غير ما تعرف."
        onClose={() => setModal(null)}
      >
        <div className="wk-help">
          <blockquote>{prompt.slice(0, 1000)}</blockquote>
          <p>
            هذه النسخة تستخدم توجيهًا محليًا بسيطًا وليست تحليلًا بنموذج ذكاء
            اصطناعي. يمكنك تجربة مسودة فاتورة بمراجعة بشرية، أو الاطلاع على
            المهارات المتاحة.
          </p>
          <div className="wk-approval-actions">
            <button className="wk-primary" onClick={() => openInvoice()}>
              جهّز مسودة فاتورة
            </button>
            <button
              className="wk-secondary"
              onClick={() => {
                setModal(null);
                navigate("skills");
              }}
            >
              اعرض المهارات
            </button>
          </div>
        </div>
      </ModalFrame>
      <ModalFrame
        open={modal === "summary"}
        title="الصورة كاملة، من بياناتك."
        subtitle="ملخص محسوب من آخر ١٠٠ مهمة محمّلة في هذه المساحة، وليس تقريرًا مولّدًا بنموذج لغوي."
        onClose={() => setModal(null)}
      >
        <div className="wk-summary">
          <div className="wk-stats">
            <div>
              <span>مهام</span>
              <strong>{formatNumber(tasks.length)}</strong>
            </div>
            <div>
              <span>تم التحقق منها</span>
              <strong className="green">
                {formatNumber(completed.length)}
              </strong>
            </div>
            <div>
              <span>بانتظارك</span>
              <strong className="amber">{formatNumber(pending.length)}</strong>
            </div>
          </div>
          <p>
            {tasks.length === 0
              ? "لسه مفيش نشاط. أول مهمة هتظهر هنا بمجرد تسجيلها."
              : pending.length
                ? `عندك ${formatNumber(pending.length)} مهمة مستنية موافقتك قبل أي كتابة.`
                : "لا توجد موافقات معلقة في المهام المحمّلة."}
          </p>
          {needsReview.length > 0 && (
            <p>
              {formatNumber(needsReview.length)} مهمة تحتاج مراجعة بسبب فشل أو
              تعذر تحقق أو انتهاء المهلة.
            </p>
          )}
          <div className="wk-info">
            <CircleHelp size={18} />
            لم يتم قياس الوقت أو التكلفة البشرية المرجعية؛ لذلك لا ندّعي وفورات
            أو عائد استثمار.
          </div>
          <button
            className="wk-primary"
            onClick={() => {
              setModal(null);
              navigate(pending.length ? "approvals" : "tasks");
            }}
          >
            افتح {pending.length ? "الموافقات" : "مهامي"}
            <ArrowLeft size={16} />
          </button>
        </div>
      </ModalFrame>
    </div>
  );
}
