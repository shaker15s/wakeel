"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeftRight,
  ClipboardCheck,
  TrendingUp,
  Upload,
  Download,
  FileSpreadsheet,
  Loader2,
  CheckCheck,
  AlertTriangle,
  History,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { financeApi, type DocumentSummary } from "@/lib/finance-client";
import type {
  Workpaper,
  WorkpaperRequest,
  PaperTable,
} from "@/server/finance/workpapers";
import type { profileDocument } from "@/server/finance/workpapers";
import "./workpapers.css";
type Profile = ReturnType<typeof profileDocument>;
type Operation = WorkpaperRequest["operation"];
type Saved = {
  id: string;
  title: string;
  createdAt: string;
  assessment: string;
};
const modes = [
  {
    id: "ledger_check" as const,
    title: "فحص القيود",
    description: "توازن، ميزان حسابات، واستثناءات",
    icon: ClipboardCheck,
  },
  {
    id: "reconcile" as const,
    title: "مطابقة مصدرين",
    description: "مراجع ومبالغ وعملات، بدون تخمين",
    icon: ArrowLeftRight,
  },
  {
    id: "budget_variance" as const,
    title: "الفعلي والموازنة",
    description: "فروق دقيقة، بندًا وعملةً",
    icon: TrendingUp,
  },
];
const fields: Record<Operation, string[]> = {
  ledger_check: ["entry", "account", "debit", "credit", "currency"],
  reconcile: ["amount", "currency", "reference"],
  budget_variance: ["category", "actual", "budget", "currency"],
};
const labels: Record<string, string> = {
  entry: "رقم القيد",
  account: "الحساب",
  debit: "المدين",
  credit: "الدائن",
  currency: "العملة",
  amount: "المبلغ الموقّع",
  reference: "مرجع المطابقة",
  category: "البند",
  actual: "الفعلي",
  budget: "الموازنة",
};
const aliases: Record<string, string[]> = {
  entry: ["entry", "entry_id", "journal_entry", "رقم القيد", "القيد"],
  account: ["account", "account_id", "الحساب"],
  debit: ["debit", "مدين", "المدين"],
  credit: ["credit", "دائن", "الدائن"],
  currency: ["currency", "العملة", "عملة"],
  amount: ["amount", "المبلغ", "مبلغ"],
  reference: ["reference", "ref", "مرجع", "المرجع"],
  category: ["category", "البند", "نوع"],
  actual: ["actual", "الفعلي"],
  budget: ["budget", "الموازنة"],
};
function suggest(p: Profile | null, op: Operation) {
  return Object.fromEntries(
    fields[op].map((f) => [
      f,
      p?.columns.find((c) => aliases[f].includes(c.name.toLowerCase().trim()))
        ?.name ?? "",
    ]),
  );
}
function Grid({ table }: { table: PaperTable }) {
  return (
    <section className="wp-grid">
      <div className="wp-grid-title">
        <h3>{table.title}</h3>
        <span>
          {table.rows.length} / {table.totalRows} سجل
        </span>
      </div>
      {table.rows.length ? (
        <div
          className="wp-scroll"
          tabIndex={0}
          role="region"
          aria-label={table.title}
        >
          <table>
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j} dir="auto">
                      {v === null ? "غير محسوبة" : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="wp-no-rows">لا سجلات في هذا القسم.</p>
      )}
      {table.truncated && (
        <p className="wp-note">
          التفاصيل معروضة لأول 100 سجل فقط. إجماليات التحليل تشمل كامل المصدر.
        </p>
      )}
    </section>
  );
}
export function WorkpapersPane({
  token,
  documents,
  onUpload,
  onRefresh,
  initialId,
}: {
  initialId?: string | null;
  token: string;
  documents: DocumentSummary[];
  onUpload: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [operation, setOperation] = useState<Operation>("ledger_check"),
    [left, setLeft] = useState(""),
    [right, setRight] = useState("");
  const [lp, setLp] = useState<Profile | null>(null),
    [rp, setRp] = useState<Profile | null>(null),
    [lm, setLm] = useState<Record<string, string>>({}),
    [rm, setRm] = useState<Record<string, string>>({});
  const [direction, setDirection] = useState<"expense" | "income">("expense"),
    [paper, setPaper] = useState<Workpaper | null>(null),
    [saved, setSaved] = useState<Saved[]>([]);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [downloading, setDownloading] = useState(false),
    [creating, setCreating] = useState(false);
  const csv = documents.filter((d) => /\.csv$/i.test(d.title));
  useEffect(() => {
    if (!left && csv.length && !initialId) setLeft(csv[0].id);
  }, [documents, left, initialId]);
  useEffect(() => {
    if (token)
      void financeApi<{ workpapers: Saved[] }>(token, "workpapers")
        .then((r) => setSaved(r.workpapers))
        .catch((e) => setError(e.message));
  }, [token]);
  useEffect(() => {
    let alive = true;
    setLp(null);
    setRp(null);
    setPaper(null);
    setError("");
    setLoading(true);
    void Promise.all([
      left
        ? financeApi<{ profile: Profile }>(token, "sheets/" + left)
        : Promise.resolve(null),
      operation === "reconcile" && right
        ? financeApi<{ profile: Profile }>(token, "sheets/" + right)
        : Promise.resolve(null),
    ])
      .then(([l, r]) => {
        if (alive) {
          setLp(l?.profile ?? null);
          setRp(r?.profile ?? null);
          setLm(suggest(l?.profile ?? null, operation));
          setRm(suggest(r?.profile ?? null, operation));
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [left, right, operation, token]);
  useEffect(() => {
    let alive = true;
    if (initialId)
      void financeApi<{ workpaper: Workpaper }>(
        token,
        "workpapers/" + initialId,
      )
        .then((r) => {
          if (alive) setPaper(r.workpaper);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [initialId, token]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      const r = await financeApi<{ profile: Profile }>(token, "sheets", {
        method: "POST",
        body: JSON.stringify({
          title: data.get("title"),
          content: data.get("content"),
        }),
      });
      await onRefresh();
      setLeft(r.profile.documentId);
      setCreating(false);
      form.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function analyze(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setPaper(null);
    try {
      const body =
        operation === "reconcile"
          ? {
              operation,
              left: { documentId: left, columns: lm },
              right: { documentId: right, columns: rm },
            }
          : {
              operation,
              documentId: left,
              columns: lm,
              ...(operation === "budget_variance" ? { direction } : {}),
            };
      const r = await financeApi<{ workpaper: Workpaper }>(
        token,
        "workpapers",
        { method: "POST", body: JSON.stringify(body) },
      );
      setPaper(r.workpaper);
      const list = await financeApi<{ workpapers: Saved[] }>(
        token,
        "workpapers",
      );
      setSaved(list.workpapers);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function open(id: string) {
    setSaving(true);
    setError("");
    try {
      const r = await financeApi<{ workpaper: Workpaper }>(
        token,
        "workpapers/" + id,
      );
      setPaper(r.workpaper);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function exportCsv() {
    if (!paper) return;
    setDownloading(true);
    try {
      const r = await fetch("/api/finance/workpapers/" + paper.id + "/export", {
        headers: { Authorization: "Bearer " + token },
      });
      if (!r.ok) throw new Error("تعذر تنزيل الورقة.");
      const u = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = u;
      a.download = "wakil-workpaper-" + paper.id.slice(0, 12) + ".csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }
  const mapFields = (
    profile: Profile | null,
    values: Record<string, string>,
    set: (v: Record<string, string>) => void,
    side: string,
  ) => (
    <div className="wp-mappings">
      {fields[operation].map((f) => (
        <label key={f}>
          {labels[f]}
          <select
            required
            aria-label={`${labels[f]} — ${side}`}
            value={values[f] ?? ""}
            onChange={(e) => {
              set({ ...values, [f]: e.target.value });
              setPaper(null);
            }}
          >
            <option value="">اختر عمودًا</option>
            {profile?.columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
  return (
    <section className="fw-page wp-page">
      <div className="fw-page-heading">
        <div>
          <span className="fw-eyebrow">من المصدر إلى الدليل</span>
          <h1>الأرقام تشتغل معاك.</h1>
          <p>
            افحص الجداول، طابق المصادر، وراجع الفروق. حسابات مباشرة قابلة لإعادة
            الفحص، حتى قبل توصيل نموذج الذكاء.
          </p>
        </div>
        <div className="fw-heading-actions">
          <button
            className="fw-secondary"
            disabled={saving}
            onClick={() => setCreating(!creating)}
          >
            <Plus size={16} />
            جدول جديد
          </button>
          <button className="fw-primary" onClick={onUpload} disabled={saving}>
            <Upload size={16} />
            رفع CSV
          </button>
        </div>
      </div>
      <div role="alert" className={error ? "fw-error" : ""}>
        {error}
      </div>
      {creating && (
        <form onSubmit={(e) => void create(e)} className="wp-create">
          <h2>أنشئ مصدرًا من بياناتك</h2>
          <p>
            العنوان في أول سجل، والفاصل فاصلة إنجليزية. الصفوف محفوظة كما
            أدخلتها؛ ليست بيانات تجريبية.
          </p>
          <label>
            اسم الجدول
            <input
              required
              name="title"
              maxLength={170}
              placeholder="مراجعة أكتوبر"
            />
          </label>
          <label>
            محتوى CSV
            <textarea
              required
              name="content"
              maxLength={64000}
              rows={7}
              dir="auto"
              placeholder="الصق جدول CSV بعناوين أعمدته هنا"
            />
          </label>
          <button className="fw-primary" disabled={saving}>
            {saving ? (
              <Loader2 size={16} className="fw-spin" />
            ) : (
              <CheckCheck size={16} />
            )}
            حفظ الجدول
          </button>
        </form>
      )}
      <div className="wp-modes" aria-label="نوع الفحص">
        {modes.map((m) => (
          <button
            key={m.id}
            aria-pressed={operation === m.id}
            disabled={saving}
            className={operation === m.id ? "active" : ""}
            onClick={() => setOperation(m.id)}
          >
            <m.icon size={20} />
            <strong>{m.title}</strong>
            <small>{m.description}</small>
          </button>
        ))}
      </div>
      {!csv.length ? (
        <div className="fw-memory-empty">
          <div>
            <FileSpreadsheet size={28} />
          </div>
          <h2>ابدأ بجدول، مش بتخمين.</h2>
          <p>
            ارفع CSV من حساباتك، أو أنشئ جدولًا من بياناتك.
            <br />
            ستظهر مصادر النتائج وبصماتها، ولا يتغير أي سجل في Odoo.
          </p>
          <button className="fw-primary" onClick={onUpload}>
            اختيار ملف CSV
            <Upload size={16} />
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void analyze(e)} className="wp-config">
          <fieldset disabled={saving}>
            <div className="wp-section-label">
              <span>01</span>
              <h2>حدّد المصدر واربط الأعمدة</h2>
            </div>
            <p className="wp-note">
              اقتراح الربط يعتمد على اسم العمود فقط. راجع المعنى والدقة قبل
              تشغيل الفحص؛ لا نستنتج عملة أو فترة ناقصة.
            </p>
            <div
              className={
                operation === "reconcile" ? "wp-sources two" : "wp-sources"
              }
            >
              <div>
                <label>
                  المصدر الأول
                  <select
                    required
                    aria-label="المصدر الأول"
                    value={left}
                    onChange={(e) => setLeft(e.target.value)}
                  >
                    <option value="">اختر جدولًا</option>
                    {csv.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </label>
                {mapFields(lp, lm, setLm, "الأول")}
              </div>
              {operation === "reconcile" && (
                <div>
                  <label>
                    المصدر الثاني
                    <select
                      required
                      aria-label="المصدر الثاني"
                      value={right}
                      onChange={(e) => setRight(e.target.value)}
                    >
                      <option value="">اختر جدولًا مختلفًا</option>
                      {csv
                        .filter((d) => d.id !== left)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  {mapFields(rp, rm, setRm, "الثاني")}
                </div>
              )}
            </div>
            {operation === "budget_variance" && (
              <label>
                نوع الموازنة
                <select
                  value={direction}
                  onChange={(e) => {
                    setDirection(e.target.value as "expense" | "income");
                    setPaper(null);
                  }}
                >
                  <option value="expense">مصروفات — الزيادة غير ملائمة</option>
                  <option value="income">إيرادات — النقص غير ملائم</option>
                </select>
              </label>
            )}
            {operation === "reconcile" && (
              <p className="wp-caution">
                المطابقة بالمرجع الحرفي، المبلغ بنفس الإشارة، والعملة. لا ندعي
                دعم المدفوعات المجمّعة أو المطابقة التقريبية؛ المكرر يبقى
                للمراجعة.
              </p>
            )}
            {operation === "ledger_check" && (
              <p className="wp-caution">
                المدين والدائن بعملة الشركة. الخانة الفارغة = صفر فقط عند وجود
                الطرف الآخر. القيود المتوازنة قد تظل موجهة لحساب خاطئ.
              </p>
            )}
            {operation === "budget_variance" && (
              <p className="wp-caution">
                كل صف يجب أن يضيف مساهمة مستقلة للموازنة. لا تستخدم موازنة شهرية
                مكررة على كل معاملة.
              </p>
            )}
            {lp && (
              <details className="wp-preview">
                <summary>
                  معاينة المصدر · {lp.rowCount} سجل · {lp.columns.length} أعمدة
                </summary>
                <Grid
                  table={{
                    title: "معاينة أول 8 سجلات",
                    columns: lp.columns.map((c) => c.name),
                    rows: lp.preview,
                    totalRows: lp.rowCount,
                    truncated: false,
                  }}
                />
                <p className="wp-note">
                  خلايا فارغة: {lp.columns.reduce((n, c) => n + c.blank, 0)} ·
                  مجموعات صفوف متطابقة في المعاينة التشخيصية:{" "}
                  {lp.duplicateGroups.length} (حتى 30 مجموعة)
                </p>
              </details>
            )}
            <div className="wp-run">
              <button
                className="fw-primary"
                disabled={
                  !lp ||
                  loading ||
                  saving ||
                  (operation === "reconcile" && (!rp || left === right))
                }
              >
                {loading || saving ? (
                  <Loader2 size={17} className="fw-spin" />
                ) : (
                  <ClipboardCheck size={17} />
                )}
                شغّل الفحص
              </button>
              <span>
                <ShieldCheck size={14} />
                قراءة وحساب فقط. بلا كتابة في ERP.
              </span>
            </div>
          </fieldset>
        </form>
      )}
      {paper && (
        <article className="wp-result" aria-label="نتيجة الفحص">
          <div className="wp-result-head">
            <div>
              <span className="fw-eyebrow">02 · ورقة عمل محفوظة</span>
              <h2>{paper.analysis.title}</h2>
              <span className={"wp-verdict " + paper.analysis.assessment}>
                {paper.analysis.assessment === "review_required" ? (
                  <AlertTriangle size={14} />
                ) : (
                  <CheckCheck size={14} />
                )}{" "}
                {paper.analysis.assessment === "review_required"
                  ? "ملاحظات تحتاج مراجعة"
                  : "لا استثناءات في الفحوص المحددة"}
              </span>
            </div>
            <button
              className="fw-secondary"
              onClick={() => void exportCsv()}
              disabled={downloading}
            >
              <Download size={15} />
              تنزيل CSV
            </button>
          </div>
          <p className="wp-note">
            تنزيل CSV يصدّر ورقة الفحص والجداول المعروضة: حتى 100 نتيجة لكل قسم،
            وليس نسخة كاملة من دفتر الأستاذ.
          </p>
          <ul className="wp-summary">
            {paper.analysis.summary.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {paper.analysis.tables.map((t, i) => (
            <Grid key={i} table={t} />
          ))}
          {paper.analysis.findings.length > 0 && (
            <section className="wp-findings">
              <h3>قائمة المراجعة · {paper.analysis.findingCount} ملاحظة</h3>
              <p className="wp-note">
                تُعرض أول {paper.analysis.findings.length} ملاحظة. الاستثناء ليس
                اتهامًا أو حكمًا نهائيًا.
              </p>
              {paper.analysis.findings.map((f, i) => (
                <div key={i}>
                  <AlertTriangle size={15} />
                  <p>
                    {f.message}
                    <small>سجلات المصدر: {f.records.join("، ")}</small>
                  </p>
                </div>
              ))}
            </section>
          )}
          <details className="wp-provenance">
            <summary>المصادر وحدود النتيجة</summary>
            <p>
              أُعدت {new Date(paper.createdAt).toLocaleString("ar-EG")} ·{" "}
              {paper.engineVersion}. هذه لقطة محفوظة، لا قراءة ERP حية.
            </p>
            {paper.sources.map((s) => (
              <div key={s.id}>
                <strong>{s.title}</strong>
                <code>{s.hash}</code>
              </div>
            ))}
            <ul>
              {paper.analysis.limitations.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        </article>
      )}
      {saved.length > 0 && (
        <section className="wp-history">
          <h2>
            <History size={17} />
            أوراق العمل المحفوظة
          </h2>
          <p>
            يقدر وكيل يرجع لها في المحادثة بمصادرها وتاريخها، من غير اعتبارها
            بيانات جديدة.
          </p>
          {saved.map((s) => (
            <button
              key={s.id}
              disabled={saving}
              onClick={() => void open(s.id)}
            >
              <FileSpreadsheet size={18} />
              <span>
                {s.title}
                <small>{new Date(s.createdAt).toLocaleString("ar-EG")}</small>
              </span>
              <span>
                {s.assessment === "review_required"
                  ? "تحتاج مراجعة"
                  : "لا استثناءات ضمن النطاق"}
              </span>
            </button>
          ))}
        </section>
      )}
    </section>
  );
}
