import { strictCsv } from "@/server/finance/calculations";
import {
  executeWorkpaper,
  profileDocument,
  exportWorkpaper,
} from "@/server/finance/workpapers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getFinanceStore } from "@/server/finance/store";
import {
  FinanceError,
  modelConfigSchema,
  odooConfigSchema,
} from "@/server/finance/types";
import { OpenAIPlanningModel } from "@/server/finance/model";
import { FinanceOdoo } from "@/server/finance/odoo";
import { validateEndpoint } from "@/server/finance/transport";
import {
  decideJournal,
  runTurn,
  running,
  safeError,
  sessionView,
} from "@/server/finance/runner";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
const globals = globalThis as typeof globalThis & {
  financeConfigLocks?: Set<string>;
};
const configLocks = (globals.financeConfigLocks ??= new Set<string>());
type Params = { params: Promise<{ path?: string[] }> };
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
async function readBody(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new FinanceError("استخدم طلب JSON.", 415);
  const reader = req.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 300000) {
      await reader.cancel();
      throw new FinanceError("الطلب أكبر من الحد المسموح.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new FinanceError("صيغة الطلب غير صالحة.");
  }
}
async function handle(req: Request, { params }: Params) {
  try {
    const path = (await params).path ?? [],
      store = getFinanceStore();
    const origin = req.headers.get("origin");
    if (
      req.method !== "GET" &&
      origin &&
      new URL(origin).host !== req.headers.get("host")
    )
      throw new FinanceError("مصدر الطلب غير مسموح.", 403);
    if (path[0] === "bootstrap" && req.method === "POST") {
      if (!rateLimit("finance:bootstrap", { windowMs: 3600000, max: 100 }).ok)
        throw new FinanceError("طلبات كثيرة. حاول لاحقًا.", 429);
      return json(store.createWorkspace(), 201);
    }
    const token =
      req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const workspace = store.authenticate(token);
    if (!workspace)
      throw new FinanceError("تعذر التعرف على مساحة العمل. حدّث الصفحة.", 401);
    if (
      req.method !== "GET" &&
      !rateLimit(`finance:${workspace}`, { windowMs: 60000, max: 40 }).ok
    )
      throw new FinanceError("انتظر قليلًا قبل إرسال طلب جديد.", 429);
    if (path[0] === "status" && req.method === "GET")
      return json({
        connections: store.publicConnections(workspace),
        sessions: store.listSessions(workspace),
        documents: store.listDocuments(workspace),
      });
    if (path[0] === "sheets" && path.length === 1 && req.method === "POST") {
      const body = z
        .object({
          title: z.string().trim().min(1).max(170),
          content: z.string().min(1).max(64000),
        })
        .parse(await readBody(req));
      if (strictCsv(body.content).length < 2)
        throw new FinanceError("يلزم عنوان أعمدة وصف بيانات واحد على الأقل.");
      const doc = store.addDocument(
        workspace,
        body.title.replace(/\.csv$/i, "") + ".csv",
        body.content,
        "document",
      );
      return json({ profile: profileDocument(store, workspace, doc.id) }, 201);
    }
    if (path[0] === "sheets" && path.length === 2 && req.method === "GET")
      return json({ profile: profileDocument(store, workspace, path[1]) });
    if (path[0] === "workpapers") {
      if (path.length === 1 && req.method === "POST")
        return json(
          {
            workpaper: executeWorkpaper(store, workspace, await readBody(req)),
          },
          201,
        );
      if (path.length === 1 && req.method === "GET")
        return json({ workpapers: store.listWorkpapers(workspace) });
      if (
        req.method === "GET" &&
        (path.length === 2 || (path.length === 3 && path[2] === "export"))
      ) {
        const p = store.getWorkpaper(workspace, path[1]);
        if (!p) throw new FinanceError("ورقة العمل غير موجودة.", 404);
        if (path.length === 3)
          return new Response(exportWorkpaper(p), {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="wakil-workpaper-${p.id.slice(0, 12)}.csv"`,
              "Cache-Control": "no-store",
            },
          });
        return json({ workpaper: p });
      }
    }
    if (path[0] === "sessions" && path.length === 1) {
      if (req.method === "GET")
        return json({ sessions: store.listSessions(workspace) });
      if (req.method === "POST") {
        const body = z
          .object({ title: z.string().trim().min(1).max(4000) })
          .parse(await readBody(req));
        return json(
          { session: store.createSession(workspace, body.title) },
          201,
        );
      }
    }
    if (path[0] === "sessions" && path.length === 2 && req.method === "GET")
      return json({ session: sessionView(store, workspace, path[1]) });
    if (path[0] === "sessions" && path[2] === "run" && req.method === "POST") {
      const body = z
        .object({
          requestId: z.string().uuid(),
          message: z.string().trim().min(1).max(8000).optional(),
          documentIds: z.array(z.string().uuid()).max(5).optional(),
        })
        .parse(await readBody(req));
      if (!store.getSession(workspace, path[1]))
        throw new FinanceError("الجلسة غير موجودة.", 404);
      if (running.has(path[1]))
        throw new FinanceError("هناك تنفيذ جارٍ في هذه الجلسة.", 409);
      const stop = new AbortController();
      const signal = AbortSignal.any([
        req.signal,
        stop.signal,
        AbortSignal.timeout(170000),
      ]);
      const encoder = new TextEncoder();
      let open = true;
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (type: string, data: unknown) => {
            if (open) {
              try {
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({ type, ...(data as object) }) + "\n",
                  ),
                );
              } catch {
                open = false;
              }
            }
          };
          try {
            await runTurn(
              store,
              workspace,
              path[1],
              body.requestId,
              body.message,
              (session) => send("session", { session }),
              signal,
              { documentIds: body.documentIds },
            );
          } catch (error) {
            send("error", { error: safeError(error) });
          } finally {
            if (open) {
              try {
                controller.close();
              } catch {
                /* disconnected reader */
              }
            }
            open = false;
          }
        },
        cancel() {
          open = false;
          stop.abort();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    }
    if (path[0] === "documents") {
      if (req.method === "GET" && path.length === 1)
        return json({ documents: store.listDocuments(workspace) });
      if (req.method === "GET" && path.length === 2) {
        const document = store.getDocument(workspace, path[1]);
        if (!document) throw new FinanceError("المستند غير موجود.", 404);
        return json({ document });
      }
      if (req.method === "POST" && path.length === 1) {
        const body = z
          .object({
            title: z.string().trim().min(1).max(180),
            content: z.string().trim().min(1).max(64000),
            kind: z.enum(["document", "policy"]).default("document"),
          })
          .parse(await readBody(req));
        const doc = store.addDocument(
          workspace,
          body.title,
          body.content,
          body.kind,
        );
        return json(
          { document: { id: doc.id, title: doc.title, hash: doc.hash } },
          201,
        );
      }
      if (req.method === "DELETE" && path.length === 2) {
        store.deleteDocument(workspace, path[1]);
        return json({ deleted: true });
      }
    }
    if (path[0] === "connections") {
      if (req.method === "GET")
        return json({ connections: store.publicConnections(workspace) });
      if (req.method === "POST") {
        const body = z
          .discriminatedUnion("kind", [
            z.object({ kind: z.literal("model"), config: modelConfigSchema }),
            z.object({ kind: z.literal("odoo"), config: odooConfigSchema }),
          ])
          .parse(await readBody(req));
        if (configLocks.has(workspace))
          throw new FinanceError("اختبار اتصال آخر جارٍ. انتظر اكتماله.", 409);
        configLocks.add(workspace);
        try {
          if (body.kind === "model") {
            validateEndpoint(body.config.baseUrl);
            await new OpenAIPlanningModel(body.config).plan(
              {
                request:
                  "اختبار اتصال: رد بتحية مختصرة في summary مع steps فارغة وclarification null.",
              },
              req.signal,
            );
            const c = store.getConnections(workspace);
            c.model = body.config;
            c.modelVerifiedAt = new Date().toISOString();
            store.saveConnections(workspace, c);
          } else {
            validateEndpoint(body.config.url);
            await new FinanceOdoo(body.config).test(req.signal);
            const c = store.getConnections(workspace);
            c.odoo = body.config;
            c.odooVerifiedAt = new Date().toISOString();
            store.saveConnections(workspace, c);
          }
          return json({ connections: store.publicConnections(workspace) });
        } finally {
          configLocks.delete(workspace);
        }
      }
      if (req.method === "DELETE" && ["model", "odoo"].includes(path[1])) {
        if (configLocks.has(workspace))
          throw new FinanceError("اختبار اتصال جارٍ. انتظر اكتماله.", 409);
        const c = store.getConnections(workspace);
        if (path[1] === "model") {
          delete c.model;
          delete c.modelVerifiedAt;
        } else {
          delete c.odoo;
          delete c.odooVerifiedAt;
        }
        store.saveConnections(workspace, c);
        return json({ connections: store.publicConnections(workspace) });
      }
    }
    if (path[0] === "approvals" && path.length === 2 && req.method === "POST") {
      const body = z
        .object({
          decision: z.enum(["approve", "reject"]),
          actionHash: z.string().length(64),
        })
        .parse(await readBody(req));
      return json({
        approval: await decideJournal(
          store,
          workspace,
          path[1],
          body.decision,
          body.actionHash,
        ),
      });
    }
    throw new FinanceError("المسار غير موجود.", 404);
  } catch (error) {
    return json(
      { error: safeError(error) },
      error instanceof FinanceError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 500,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
