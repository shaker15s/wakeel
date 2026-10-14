import type { Workpaper, WorkpaperRequest, Analysis } from "./workpapers";
import { getBuiltinModule } from "node:process";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  Connections,
  FinanceError,
  FinanceSession,
  JournalApproval,
  MemoryDocument,
} from "./types";
const { DatabaseSync } = getBuiltinModule(
  "node:sqlite",
) as typeof import("node:sqlite");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class FinanceStore {
  private db: InstanceType<typeof DatabaseSync>;
  private key: Buffer;
  constructor(filename: string, key?: Buffer) {
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS finance_workspaces(id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS finance_objects(kind TEXT NOT NULL,id TEXT NOT NULL,workspace TEXT NOT NULL,data TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE INDEX IF NOT EXISTS finance_scope ON finance_objects(workspace,kind,updated);`);
    if (key) this.key = key;
    else if (filename === ":memory:") this.key = randomBytes(32);
    else {
      const path = filename + ".key";
      try {
        writeFileSync(path, randomBytes(32), { flag: "wx", mode: 0o600 });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
      this.key = readFileSync(path);
      if (this.key.length !== 32) throw new Error("Invalid finance vault key");
    }
  }
  close() {
    this.db.close();
  }
  createWorkspace() {
    const count = this.db
      .prepare("SELECT COUNT(*) AS n FROM finance_workspaces")
      .get() as { n: number };
    if (count.n >= 1000)
      throw new FinanceError(
        "وصلت مساحة الخادم للحد المسموح. تواصل مع المسؤول.",
        429,
      );
    const token = randomBytes(32).toString("base64url"),
      id = randomUUID();
    this.db
      .prepare("INSERT INTO finance_workspaces VALUES (?,?)")
      .run(id, digest(token));
    return { id, token };
  }
  authenticate(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return (
      (
        this.db
          .prepare("SELECT id FROM finance_workspaces WHERE token_hash=?")
          .get(digest(token)) as { id: string } | undefined
      )?.id ?? null
    );
  }
  private put(kind: string, id: string, workspace: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO finance_objects VALUES (?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated=excluded.updated WHERE workspace=excluded.workspace",
      )
      .run(
        kind,
        id,
        workspace,
        JSON.stringify(value),
        new Date().toISOString(),
      );
  }
  private get<T>(kind: string, id: string, workspace: string): T | null {
    const row = this.db
      .prepare(
        "SELECT data FROM finance_objects WHERE kind=? AND id=? AND workspace=?",
      )
      .get(kind, id, workspace) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }
  private list<T>(kind: string, workspace: string): T[] {
    return (
      this.db
        .prepare(
          "SELECT data FROM finance_objects WHERE kind=? AND workspace=? ORDER BY updated DESC LIMIT 500",
        )
        .all(kind, workspace) as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  createSession(workspaceId: string, title: string) {
    if (this.listSessions(workspaceId).length >= 500)
      throw new FinanceError("وصلت للحد المحلي للجلسات.", 429);
    const session: FinanceSession = {
      id: randomUUID(),
      workspaceId,
      title: title.slice(0, 90),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      turns: [],
    };
    this.saveSession(session);
    return session;
  }
  getSession(workspaceId: string, id: string) {
    return this.get<FinanceSession>("session", id, workspaceId);
  }
  saveSession(session: FinanceSession) {
    session.updatedAt = new Date().toISOString();
    this.put("session", session.id, session.workspaceId, session);
  }
  listSessions(workspaceId: string) {
    return this.list<FinanceSession>("session", workspaceId).map(
      ({ id, title, updatedAt, turns }) => ({
        id,
        title,
        updatedAt,
        status: turns.at(-1)?.status ?? "queued",
        preview: turns.at(-1)?.request.slice(0, 100) ?? "",
      }),
    );
  }
  addDocument(
    workspaceId: string,
    title: string,
    content: string,
    kind: MemoryDocument["kind"],
  ) {
    const docs = this.listDocuments(workspaceId);
    if (docs.length >= 100)
      throw new FinanceError("الحد الأقصى ١٠٠ مستند لكل مساحة.", 429);
    const hash = digest(content);
    const prior = docs.find((d) => d.hash === hash);
    if (prior) return this.getDocument(workspaceId, prior.id)!;
    const doc: MemoryDocument = {
      id: randomUUID(),
      workspaceId,
      title,
      content,
      kind,
      hash,
      createdAt: new Date().toISOString(),
    };
    this.put("document", doc.id, workspaceId, doc);
    return doc;
  }
  getDocument(workspace: string, id: string) {
    return this.get<MemoryDocument>("document", id, workspace);
  }
  listDocuments(workspace: string) {
    return this.list<MemoryDocument>("document", workspace).map(
      ({ content, ...doc }) => ({ ...doc, characters: content.length }),
    );
  }
  deleteDocument(workspace: string, id: string) {
    this.db
      .prepare(
        "DELETE FROM finance_objects WHERE kind='document' AND id=? AND workspace=?",
      )
      .run(id, workspace);
  }
  searchDocuments(workspace: string, query: string) {
    const normalize = (s: string) =>
      s
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\u064B-\u065F]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه");
    const terms = [
      ...new Set(
        normalize(query)
          .split(/[^\p{L}\p{N}]+/u)
          .filter((w) => w.length > 2),
      ),
    ].slice(0, 30);
    return this.list<MemoryDocument>("document", workspace)
      .map((doc) => {
        const body = normalize(doc.content),
          title = normalize(doc.title);
        const score = terms.reduce(
          (n, t) =>
            n + (title.includes(t) ? 5 : 0) + (body.includes(t) ? 1 : 0),
          0,
        );
        const at = Math.max(
          0,
          ...terms
            .map((t) => body.indexOf(t))
            .filter((i) => i >= 0)
            .slice(0, 1),
        );
        return {
          id: doc.id,
          title: doc.title,
          hash: doc.hash,
          kind: doc.kind,
          score,
          excerpt: doc.content.slice(Math.max(0, at - 100), at + 3900),
        };
      })
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
  getConnections(workspace: string): Connections {
    const blob = this.get<{ iv: string; tag: string; body: string }>(
      "vault",
      workspace,
      workspace,
    );
    if (!blob) return {};
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(blob.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(workspace));
    decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(blob.body, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
  }
  saveConnections(workspace: string, connections: Connections) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(workspace));
    const body = Buffer.concat([
      cipher.update(JSON.stringify(connections)),
      cipher.final(),
    ]);
    this.put("vault", workspace, workspace, {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      body: body.toString("base64"),
    });
  }
  publicConnections(workspace: string) {
    const c = this.getConnections(workspace);
    return {
      model: c.model
        ? {
            baseUrl: c.model.baseUrl,
            model: c.model.model,
            verifiedAt: c.modelVerifiedAt ?? null,
          }
        : null,
      odoo: c.odoo
        ? {
            url: c.odoo.url,
            database: c.odoo.database,
            username: c.odoo.username,
            companyId: c.odoo.companyId,
            verifiedAt: c.odooVerifiedAt ?? null,
          }
        : null,
    };
  }
  saveWorkpaper(
    workspace: string,
    request: WorkpaperRequest,
    analysis: Analysis,
    sources: Workpaper["sources"],
  ): Workpaper {
    const id = digest(
      JSON.stringify({
        workspace,
        request,
        sources,
        engineVersion: "workpapers-v1",
      }),
    );
    const existing = this.getWorkpaper(workspace, id);
    if (existing) return existing;
    if (this.listWorkpapers(workspace).length >= 100)
      throw new FinanceError(
        "وصلت للحد المحلي: ١٠٠ ورقة عمل. راجع سياسة الاحتفاظ قبل إضافة المزيد.",
        429,
      );
    const paper: Workpaper = {
      id,
      workspaceId: workspace,
      createdAt: new Date().toISOString(),
      engineVersion: "workpapers-v1",
      request,
      analysis,
      sources,
    };
    if (JSON.stringify(paper).length > 90000)
      throw new FinanceError("ورقة العمل أكبر من حد الأدلة. قلّل نطاق المصدر.");
    this.put("workpaper", id, workspace, paper);
    return paper;
  }
  searchWorkpapers(workspace: string, query: string) {
    const normalize = (s: string) =>
      s
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\u064B-\u065F]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه");
    const terms = [
      ...new Set(
        normalize(query)
          .split(/[^\p{L}\p{N}]+/u)
          .filter((t) => t.length > 2),
      ),
    ].slice(0, 30);
    return this.listWorkpapers(workspace)
      .map((p) => ({
        ...p,
        score: terms.reduce(
          (n, t) =>
            n +
            (normalize(
              p.title + " " + p.sources.map((s) => s.title).join(" "),
            ).includes(t)
              ? 1
              : 0),
          0,
        ),
      }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
  getWorkpaper(workspace: string, id: string) {
    return this.get<Workpaper>("workpaper", id, workspace);
  }
  listWorkpapers(workspace: string) {
    return this.list<Workpaper>("workpaper", workspace).map((p) => ({
      id: p.id,
      title: p.analysis.title,
      createdAt: p.createdAt,
      assessment: p.analysis.assessment,
      sources: p.sources,
    }));
  }
  getApproval(workspace: string, id: string) {
    return this.get<JournalApproval>("approval", id, workspace);
  }
  saveApproval(approval: JournalApproval) {
    this.put("approval", approval.id, approval.workspaceId, approval);
  }
  approvalsForSession(workspace: string, id: string) {
    return this.list<JournalApproval>("approval", workspace).filter(
      (a) => a.sessionId === id,
    );
  }
}
const globalFinance = globalThis as unknown as { financeStore?: FinanceStore };
export function getFinanceStore() {
  if (!globalFinance.financeStore) {
    const base = process.env.WAKEEL_RUNTIME_DB
      ? dirname(process.env.WAKEEL_RUNTIME_DB)
      : resolve(process.cwd(), "data");
    globalFinance.financeStore = new FinanceStore(
      process.env.WAKEEL_FINANCE_DB || resolve(base, "finance.sqlite"),
    );
  }
  return globalFinance.financeStore;
}
