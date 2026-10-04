# WAKIL — Repository Audit (Phase 0)

**Date:** 2026-10-04
**Branch audited:** `arena/01a1076b-wakeel` @ `d088859` (single squashed commit on `main`; no prior history, no `prisma/migrations/`)
**Auditor:** coding agent, static code reading + the checks the sandbox could actually execute (see §6). No paid model calls, no live Odoo instance, and no live HTTP traffic against a running `next dev`/`next start` server were performed — reasons are documented in §6.1.

> No completed WAKIL Deep Research report exists in the repository. `find . -iname "*research*"` returns only `docs/WAKIL_DEEP_RESEARCH_PROMPT.md` (the prompt itself), not a filled-in report. **Every market/competitive/model-pricing claim in this audit and in `01-mvp-decision.md` is therefore explicitly marked as "not yet researched"; nothing from that missing report is invented.** This is a hard open dependency, not a detail.

---

## 1. What this repository actually is today

The repo is **not yet the WAKIL runtime described in the PRD**. It is a single-page Next.js 16 (App Router, Turbopack) demo product called "WAKEEL (وكيل)" — an "AI employee" console UI with:

- A SQLite/Prisma-backed multi-tenant-*looking* workspace model (`Account` → `User` "operator" → `AiSystem` → `SystemRecord`/`Activity`/`ChatMessage`/`ScanSession`/`AutomationRun`/`ShareLink`).
- A chat dock that calls one LLM (`z-ai-web-dev-sdk`, optionally an OpenAI-compatible proxy) to: (a) "discover" fictitious systems via web search, (b) "forge" new ad-hoc CRUD mini-apps persisted as JSON blobs, (c) chat in character, (d) connect to a real Odoo 19 instance and expose four read tools + one write tool (`create_draft_invoice`).
- A worklog (`worklog.md`, 73 KB) written by prior coding-agent sessions ("Task ID 1..15") that is the *de facto* design history, since there is no git history and no ADRs.

The ERP/Odoo/policy/agent code that is most relevant to the WAKIL mission (`src/server/**`) is real, but small, uncomposed with the rest of the product, and — as shown below — **currently does not even compile**, because the one file meant to wire it into the live chat endpoint is a corrupted partial edit.

**Conclusion:** this is a reasonable, reusable *starting point* for the model gateway, Odoo connector, and a first cut of a policy engine — not a working vertical slice, and not evidence of a validated workflow. Treat everything below `src/server/` as a rough draft, not a tested foundation.

---

## 2. Actual architecture / request path

```
Browser (single route "/")
  └─ src/app/page.tsx → <AppShell/> (src/components/app/app-shell.tsx)
       ├─ landing → onboarding (dialog) → console (client-side view switch, zustand store: src/lib/store.ts)
       └─ console/views/* talk to src/lib/api-client.ts (typed fetch helpers, React Query)
API routes (src/app/api/**, Next.js Route Handlers, all JSON)
  ├─ /api/auth/[action]          → src/lib/auth.ts (register/login/logout/me)
  ├─ /api/users, /api/users/[id] → operator ("workspace") CRUD
  ├─ /api/discovery/scan         → LLM + web_search → fabricated "discovered systems"
  ├─ /api/systems/forge          → LLM → generates a JSON "blueprint" CRUD mini-app
  ├─ /api/systems/[id]/*         → records/automations/share/seed/import for the generic mini-apps
  ├─ /api/erp/odoo/connect       → tests + stores a live Odoo 19 connection (src/server/erp/odoo-connector.ts)
  ├─ /api/agent/chat             → BROKEN, does not compile (see §4.1) — intended to call src/server/agent/runtime.ts
  ├─ /api/agent/execute-approval → re-runs a "tool" against Odoo after a client-side confirm click
  └─ /api/agent/digest           → LLM-generated "status digest" over workspace activity
Persistence: Prisma 6 → SQLite file db/custom.db (checked into git — see §5.5)
Agent/ERP layer (not wired into a working endpoint today):
  src/server/agent/tools.ts     → ERP_TOOLS registry (5 tools) + executeToolCall()
  src/server/agent/runtime.ts   → AgentRuntime.run() — one LLM call picks a tool, one LLM call drafts a reply
  src/server/policy/engine.ts   → PolicyEngine.evaluate() — in-memory, stateless, no persistence
  src/server/erp/contract.ts    → IERPConnector interface ("Universal ERP Contract")
  src/server/erp/odoo-connector.ts → Odoo19Connector (real JSON-RPC calls to Odoo external API)
```

There is **no queue, no worker process, no background job runner, no task/step state machine, no approval table, no idempotency table, and no audit-event table** anywhere in the codebase or schema. "Execution" is a single synchronous HTTP request: LLM call → (maybe) one tool call → LLM call → HTTP response. If the Next.js process dies mid-request, nothing is recoverable because nothing about the in-flight step was durably recorded before the external call.

---

## 3. Capability matrix (PRESENT / PARTIAL / MISSING / MISALIGNED)

| PRD capability | Status | Evidence |
|---|---|---|
| Tenant/actor model | **PARTIAL** | `Account` (real login) → `User` ("operator"/workspace) → owns `AiSystem` etc. (`prisma/schema.prisma`). Reasonable shape, but see §5.1/§5.2 for enforcement defects. |
| Server-derived auth context | **MISALIGNED** | `src/lib/auth.ts` *claims* to derive actor/tenant from the httpOnly session cookie, but `requireOwnedOperator()` (lines 196-253) accepts a **client-supplied `userId` and does not check it belongs to the authenticated account** when both a session and a `userId` body param are present (lines 232-241). It only checks ownership when no `userId` is given — the opposite of how every caller actually uses it (see §5.1). |
| Durable task/step state machine | **MISSING** | No `Task`/`TaskStep` tables, no status enum, no state-transition code anywhere in `prisma/schema.prisma` or `src/server/**`. |
| Typed tool registry + schema validation | **PARTIAL/MISALIGNED** | `ERP_TOOLS` (`src/server/agent/tools.ts:9-49`) declares a `parametersSchema` field per tool, but it is a free-form JS object used only for the prompt text (`ERP_TOOLS.map(t => ...)` in `runtime.ts:38`); **nothing ever validates the model's proposed arguments against it** — `executeToolCall()` passes `parameters` straight through to the Odoo connector (`tools.ts:93-105`) with only ad-hoc `Number(...)` coercions inside the connector itself. |
| Model gateway / provider adapter | **PARTIAL** | `src/lib/wakeel/ai.ts` is a single-file abstraction (`chatJSON`, `chatText`, `chatTextStream`, `runWebSearch`) that branches between an OpenAI-compatible HTTP proxy (`AI_BASE_URL`) and the `z-ai-web-dev-sdk` fallback — this is a real, swappable seam (good instinct), but there is no `ModelProvider` interface/class, no capability declarations, no per-provider conformance tests, and only one path is ever exercised. |
| Policy engine (deny-by-default, authorize every call) | **PARTIAL/MISALIGNED** | `PolicyEngine.evaluate()` (`src/server/policy/engine.ts`) is pure, stateless, hard-codes two tool names (`create_draft_invoice`, `create_draft_purchase_order`) and one risk threshold (25,000). It never sees tenant/actor scope, has no policy version, and is **allow-by-default** for any `toolName` it doesn't recognize (`engine.ts:94-101`, the final `return { allowed: true, ... }`) — a newly added tool is implicitly trusted unless someone remembers to add a branch for it. |
| Approval binding (exact action hash, resource, params, expiry, approver) | **MISSING** | The "approval" is an `approvalCard` object returned to the browser (`engine.ts:52-67`) and re-submitted by the client to `/api/agent/execute-approval` as **fresh, client-controlled `toolName`/`parameters` JSON** (`src/app/api/agent/execute-approval/route.ts:8-13, 60-66`). There is no server-side approval record, no action hash, no expiry, no policy-version binding, and nothing stops the browser from approving different parameters than were shown to the human. This is a confirm dialog, not an approval gate. |
| Idempotency / duplicate-write prevention | **MISSING** | `Odoo19Connector.createDraftInvoice()` (`src/server/erp/odoo-connector.ts:~390-420`) calls Odoo's `create` directly with no idempotency key, no dedupe table, and no read-after-write check. Resubmitting the same approval (double-click, retry, replay) creates a second real invoice in Odoo. |
| Postcondition verification vs. source of truth | **MISSING** | Every write path treats "the RPC call returned" as success (`return { success: true, data: {...} }`). Nothing re-reads Odoo to confirm the invoice exists with the expected fields before reporting success to the user. |
| Retry/backoff classification | **MISSING** | No retry logic anywhere; a transient Odoo timeout and a permanent validation error are handled identically (caught, wrapped in `{ success:false, error }`, surfaced once). |
| Pause/resume/cancel, worker crash recovery | **MISSING** (no concept of a long-running task exists to pause/resume/crash-recover). |
| Append-only audit trail / receipt | **PARTIAL/MISALIGNED** | `Activity` rows are created per action (`db.activity.create(...)`, e.g. `execute-approval/route.ts:67-75`) but they are plain mutable rows (no hash chain, no previous-event linkage, UPDATE/DELETE possible via raw Prisma), store a mix of free text and `JSON.stringify(result)` (which, for Odoo tools, can include customer names/amounts — no redaction pass), and there is no "receipt" endpoint/object that links a request to its approvals + verification evidence. |
| Secrets handling | **MISALIGNED** | Odoo `apiKeyOrPassword` is stored **in plaintext** inside `AiSystem.blueprint` (a `String` column holding `JSON.stringify({ url, db, username, apiKeyOrPassword, ... })`, `src/app/api/erp/odoo/connect/route.ts:52-61`) with no encryption, and that column is returned in full to the client by at least `GET /api/systems/[id]` (needs confirmation per-route, but the model is "store everything, trust every reader"). Separately, `worklog.md` (committed, now public on GitHub) documents a live-looking demo credential `owner@wakeel.app / Wakeel-2025!` in plaintext (Task 15 entry). |
| Evaluation harness | **MISALIGNED** | `tests/agent/evaluation-suite.test.ts` exports a function `runAgentEvaluationSuite()` with three hand-rolled assertions. It is **never imported or invoked anywhere** (`grep -rn runAgentEvaluationSuite` only matches its own definition), there is no test runner installed (no `vitest`/`jest`/`mocha` in `package.json` dependencies, no `"test"` script), and no CI workflow exists (`.github/` is absent). It reads as a test but has never actually run as one. |
| CI | **MISSING** | No `.github/workflows/*`, no other CI config found. |
| Metrics / cost / latency tracking | **MISSING** | No instrumentation beyond `console.error`/`console.warn` in `ai.ts`. |

---

## 4. Baseline checks — real commands, real results

Environment: Node v22.22.3 / npm 10.9.8 (the sandbox has no `bun`, even though every script in `package.json`/`.zscripts/*` assumes `bun`). `npm install --no-audit --no-fund` succeeded (844 packages, ~75s).

### 4.1 Lint — `npx eslint .`
**Result: FAILED, exit code 1, 6 errors + 1 warning.**
```
/home/user/wakeel/src/app/api/agent/chat/route.ts
  101:4  error  Parsing error: Expression or comma expected

/home/user/wakeel/src/components/app/console/views/assistant-view.tsx
  99:9   error  react-hooks/set-state-in-effect (setSpeechSupported in a bare useEffect)
  454:22 error  'ShieldCheck' is not defined  react/jsx-no-undef
  476:26 error  'Loader2' is not defined      react/jsx-no-undef

/home/user/wakeel/src/components/ui/carousel.tsx
  98:5   error  react-hooks/set-state-in-effect

/home/user/wakeel/src/hooks/use-mobile.ts
  14:5   error  react-hooks/set-state-in-effect

/home/user/wakeel/src/components/app/shared-system-view.tsx
  37:5   warning  no-location-assign-relative-destination
```
The most important finding is the **parsing error**: `src/app/api/agent/chat/route.ts` is mid-edit-corrupted — a block of code (loading the Odoo connector and calling `AgentRuntime.run`) was pasted *inside* an array literal that builds the system prompt (see exact excerpt in §4.3). `AgentRuntime` and `Odoo19Connector` are referenced at lines 125 and 101 respectively but **never imported** in that file. This route cannot run at all today; it is the file that was supposed to connect the chat UI to `src/server/agent/runtime.ts`.

`assistant-view.tsx` references `<ShieldCheck/>` and `<Loader2/>` (lucide icons) without importing them — a real runtime crash waiting to happen the first time that code path renders (approval-card UI, per the component name/context).

### 4.2 Typecheck — `npx tsc --noEmit -p tsconfig.json`
**Result: FAILED, exit code 2, 1 error reported** (tsc aborts further diagnostics once it hits the fatal parse error):
```
src/app/api/agent/chat/route.ts(101,5): error TS1137: Expression or comma expected.
```
Note `next.config.ts` sets `typescript: { ignoreBuildErrors: true }` — meaning a real `next build` would **silently swallow type errors** (not syntax errors — Turbopack's parser still fails on those, see §4.4). Combined with no CI, there is currently no automated gate that would catch a type regression before it ships.

### 4.3 Build — `npx next build`
**Result: FAILED, exit code 1.**
```
Turbopack build failed with 4 errors:
./src/app/api/agent/chat/route.ts:101:5
Error: Expression expected
   99 |       '',
  100 |     // Load active Odoo connection if available
> 101 |     const erpSystem = await db.aiSystem.findFirst({
      |     ^^^^^
  102 |       where: { userId: guard.user.id, category: 'ERP', status: 'ACTIVE' },
  103 |     });
Parsing ecmascript source code failed
```
Plus 3 Google Fonts fetch failures (`next/font/google` for IBM Plex Mono / IBM Plex Sans Arabic / Space Grotesk) — these are **environment-specific** (this sandbox's network egress allowlist blocks `fonts.googleapis.com`; confirmed separately with `curl`, see §6.1) and would likely not reproduce on a host with normal internet access, but they are a real fragility: the production build depends on live network access to Google at build time with no fallback/self-hosted font strategy.

**The repository, as committed, does not build.** This must be treated as the actual starting baseline, not a hypothetical.

### 4.4 Tests
No test runner is installed and no `"test"` script exists in `package.json`. The only matching file, `tests/agent/evaluation-suite.test.ts`, exports a function that nothing calls (§3). **There are zero executable application tests in this repository today.**

Two shell "tests" exist for the platform's generic deploy tooling (`tests/database-runtime-build.sh`, `tests/python-runtime-build.sh`, `tests/python-runtime-container.sh`) — these test `.zscripts/*.sh` build scripts, not WAKIL application logic:
- `bash tests/database-runtime-build.sh` → **PASSED** (exit 0).
- `bash tests/python-runtime-build.sh` → **FAILED** (exit 1): `❌ 检测到 Python 项目，但构建环境中没有 uv` — the sandbox lacks the `uv` Python package manager these scripts require. Not an application defect; an environment gap in scripts unrelated to WAKIL's business logic.
- `bash tests/python-runtime-container.sh` → same failure, same reason.

### 4.5 Database
`npx prisma generate` and `npx prisma db push` both **FAILED**: Prisma needs to download a query-engine binary from `binaries.prisma.sh`, which this sandbox's network allowlist blocks (confirmed: `registry.npmjs.org` → 200, `api.github.com` → 200, `binaries.prisma.sh` → TLS connection refused, `registry.npmmirror.com` mirror also blocked). **This is an environment limitation of this coding session, not a repository defect** — but it means no live database-backed request could be executed to dynamically confirm the IDOR described in §5.1; that finding is a static-code-reading result, cross-checked line-by-line against every call site, and corroborated by the prior agent's *own* worklog entry describing a live IDOR exploit it believed it had fixed (`worklog.md`, Task 14 → Task 15). I was not able to re-run that live exploit in this session.

### 4.6 Summary table

| Check | Command | Result |
|---|---|---|
| Install | `npm install` | ✅ OK (844 packages) |
| Lint | `npx eslint .` | ❌ 6 errors, 1 warning |
| Typecheck | `npx tsc --noEmit` | ❌ 1 fatal parse error (blocks further diagnostics) |
| Build | `npx next build` | ❌ fails (parse error + sandbox-only font fetch errors) |
| App tests | n/a | ❌ none exist / none runnable |
| Deploy-script tests | `bash tests/*.sh` | 1 passed, 2 failed on missing `uv` (env gap) |
| Prisma generate/push | `npx prisma generate` | ❌ blocked by sandbox network allowlist |

---

## 5. Security weaknesses and failure scenarios (static analysis)

### 5.1 Cross-tenant IDOR in the primary auth guard (critical, unconfirmed live but high-confidence)
`src/lib/auth.ts`, `requireOwnedOperator()`:
```ts
// lines 196-253 (paraphrased structure, see file for exact text)
const account = await getSessionAccount(req);
if (!account) { /* ...dev fallback, see 5.2... */ }

const user = userId
  ? await db.user.findUnique({ where: { id: userId }, select: {...} })   // <-- NO accountId check
  : await db.user.findFirst({ where: { accountId: account.id }, ... });  // ownership only checked here

if (!user) return 404;
return { ok: true, account, user };
```
Every one of the 10 route files that call `requireOwnedOperator(req, userId)` with a **client-supplied `userId`** (`activity`, `agent/chat` GET+POST, `agent/digest`, `agent/execute-approval`, `discovery/scan`, `erp/odoo/connect`, `scans`, `systems/forge`, `users/[id]`, `users/[id]/systems` — confirmed via `grep -rn requireOwnedOperator src/app/api`) skips the ownership check entirely whenever a session cookie *is* present, because the ownership check only runs in the `userId` **absent** branch. A logged-in attacker who knows or enumerates another workspace's `userId` (a `cuid()`, not secret, and already returned to clients in several list/detail responses) can read that workspace's activity/chat history, trigger chat/LLM calls against it, connect/replace its Odoo integration, and execute approved ERP tool calls (including `create_draft_invoice`) against someone else's connected ERP, all while authenticated as their own account.

This directly contradicts the prior worklog's own closing claim ("IDOR CLOSED — all 21 routes guarded", Task 15) — the guard function introduced to fix the problem has a latent gap for the exact call pattern (`userId` supplied + session present) that essentially every real caller uses. `requireOwnedSystem`/`requireOwnedRecord` (same file, used for `/api/systems/[id]/*` and `/api/records/[id]/*`) **do** perform the correct `row.user.accountId !== session.account.id` check — so the fix pattern is known and correctly implemented elsewhere, just not inside `requireOwnedOperator`.

*I could not reproduce this live in this session* because Prisma's engine couldn't be downloaded (§4.5/§6.1); this is reported as a precise, line-cited static-analysis finding, not a proven live exploit, and must be the **first thing confirmed or refuted with a running server** before anything else.

### 5.2 Unconditional unauthenticated-fallback ("local-dev trial mode") with no environment gate
`requireOwnedOperator()` lines ~202-230 and `requireSession()` lines ~260-268 and `GET /api/auth/me` (`src/app/api/auth/[action]/route.ts` ~108-132): when no session cookie is present, **all three** silently fall back to "the account's most-recently-created operator" (or create a brand-new blank one) and proceed as `ok: true`, instead of returning 401. This fallback has **no `NODE_ENV` or feature-flag gate** — it is unconditional code, not a dev-only branch, despite the comment ("In development / local trial mode"). In any deployment where this code runs as-is, an unauthenticated request to most mutating endpoints succeeds by impersonating an arbitrary pre-existing operator. Combined with §5.1, this is a full authentication/authorization bypass on the current code path, not just a tenant-scoping bug.

### 5.3 Approval is a client-side confirm dialog, not a server-enforced gate
`PolicyEngine.evaluate()` returns an `approvalCard` containing `mutationPayload` to the browser (`src/server/policy/engine.ts:52-67`); the browser is expected to show it and then POST the **same (or any) parameters** back to `/api/agent/execute-approval` with `confirmed: true` (`src/app/api/agent/execute-approval/route.ts`). Nothing server-side records that a specific approval was requested, nothing hashes the proposed action, there is no expiry, no policy-version pin, and no check that the re-submitted `toolName`/`parameters` match what was actually shown to a human. A compromised/malicious client (or a buggy frontend) can submit `confirmed: true` with different `parameters` than the ones displayed, or submit it without ever having shown a card at all, and `execute-approval` will happily run it (modulo §5.1's unrelated ownership gap). This directly violates the PRD's "approval bound to the exact action hash... any material change invalidates the approval" requirement and the "never let the model approve its own action" principle is moot because there is no server-side approval object to bypass in the first place — it simply doesn't exist yet.

### 5.4 No idempotency on the one real write path
`Odoo19Connector.createDraftInvoice()` calls Odoo's `create` RPC directly. A double-submitted approval, a client retry after a timeout, or a replayed request produces a second real draft invoice in the connected Odoo instance. There is no idempotency-key table, no dedupe-by-request-hash, and no read-after-write reconciliation.

### 5.5 Secrets at rest and in version control
- Odoo credentials (`apiKeyOrPassword`) are stored in **plaintext** inside `AiSystem.blueprint` (a JSON string column), not in an encrypted secret store (`src/app/api/erp/odoo/connect/route.ts:52-61`). The same blueprint is read back and reused on every chat/approval call (`execute-approval/route.ts:33-49`).
- `db/custom.db`, the live SQLite database, **is committed to git** (`git ls-files | grep db/custom.db` confirms it is tracked, not gitignored). It currently contains two real `Account` rows with scrypt password hashes (verified by reading the file directly with Python's `sqlite3` module — `owner@wakeel.app` and `nour@wakeel.test`). Shipping the database file in source control is a durable secrets/PII leak vector regardless of today's content.
- `worklog.md` (committed, now on a public-looking GitHub remote) documents a real-looking demo credential in plaintext: `owner@wakeel.app / Wakeel-2025!` (Task 15 entry). Anyone who can read the repository has that login.
- A stray file literally named `--clip` at the repo root is a committed PNG (confirmed via magic-byte read) — harmless but is evidence of accidental `git add -A` hygiene problems that also likely explain how `db/custom.db` and the `tool-results`/`download` QA-screenshot directories (100+ files, several MB) ended up tracked.

### 5.6 Allow-by-default policy fallthrough
`PolicyEngine.evaluate()`'s final branch (`engine.ts:94-101`) returns `{ allowed: true, requiresApproval: false, riskLevel: 'LOW' }` for **any** `ActionRequest` that isn't one of the two explicitly-named tools or the `DESTRUCTIVE`/`READ` categories. A new write tool added to `ERP_TOOLS` without a matching policy branch is implicitly trusted and executes with no approval — the opposite of the PRD's "deny-by-default" requirement.

### 5.7 No request size/shape hardening on the one audited write path
`create_draft_invoice`'s `parametersSchema` is descriptive only (§3); `executeToolCall` never validates `customerId`/`lines` types or bounds before calling the connector, which does `Number(payload.customerId)` and maps over `payload.lines` — a malformed or missing `lines` array throws an unhandled exception inside the route (caught generically by `handleRoute`, per `src/lib/wakeel/http.ts`, but with no specific "invalid tool arguments" error class or test).

### 5.8 Prompt-injection surface (not yet tested)
`AgentRuntime.run()` feeds raw ERP tool results (`JSON.stringify(toolRes)`) directly into the synthesis prompt as "REAL ERP VERIFIED DATA" (`runtime.ts:79-95`). Odoo field values (customer names, invoice lines, notes) are attacker-influenceable in a real deployment (anyone who can create a contact/invoice line in the connected Odoo can shape what the model sees) and are not sanitized or delimited beyond a markdown-ish header. No adversarial test exists for this yet.

---

## 6. Environment notes affecting this and future sessions

### 6.1 Network allowlist
Confirmed reachable: `registry.npmjs.org` (200), `api.github.com` (200).
Confirmed blocked (TLS connection refused): `binaries.prisma.sh`, `registry.npmmirror.com`, `fonts.googleapis.com`.
Consequences: `prisma generate`/`db push`/`migrate` cannot run, so **no live, DB-backed dev server could be started in this session**, and `next build` fails on Google Fonts in addition to the real code defect. Any future session should check whether the production/CI environment has broader egress (it must, for `next build` with `next/font/google` and for `prisma generate` to have ever worked before) — if not, both issues (self-host fonts; vendor or cache the Prisma engine) need explicit fixes independent of the WAKIL runtime work.

### 6.2 Package manager mismatch
`package.json` scripts and `.zscripts/*.sh` assume `bun` (`bun run dev`, `bun .next/standalone/server.js`), and `bun.lock` is the committed lockfile, but this sandbox only has `node`/`npm`/`npx`. `npm install` worked and produced a usable `node_modules`, but there is **no `package-lock.json`** — dependency resolution is not guaranteed identical to what `bun` would produce from `bun.lock`. Document, don't silently "fix" by switching package managers mid-session without a decision.

---

## 7. What to keep, refactor, replace, or remove

**Keep (real, reusable building blocks):**
- `prisma/schema.prisma`'s `Account`/`User` split and the scrypt+HMAC session design in `src/lib/auth.ts` (minus the two defects in §5.1/§5.2) — this is a legitimate, dependency-free auth foundation worth keeping rather than bolting on NextAuth.
- `src/lib/wakeel/ai.ts`'s provider-switch shape (`AI_BASE_URL`/`OPENAI_BASE_URL` vs. SDK fallback) as the seed of a real model-adapter interface.
- `src/server/erp/contract.ts` (`IERPConnector`) and `src/server/erp/odoo-connector.ts` as the seed of a real connector — the JSON-RPC calls against Odoo's external API look structurally correct (`authenticate` → `execute_kw`, `check_access_rights` probes before claiming a permission) and are worth keeping and hardening rather than rewriting.
- `src/lib/rate-limit.ts` — a small, honest, documented-as-single-node in-memory limiter; fine to keep for now, already correctly flagged by the prior worklog as needing a shared store at scale.
- The security-headers block in `next.config.ts`.

**Refactor (concept is right, implementation is not safe/durable yet):**
- `src/server/policy/engine.ts` → needs tenant/actor scoping, a policy version, a real allow/deny default, and persistence of the decision (today it's a pure function with no record of what it decided).
- `src/server/agent/tools.ts` → needs real schema validation (zod) per tool, normalized error types, and timeouts, not just a registry list.
- `requireOwnedOperator()` → fix the ownership-check gap (§5.1) and decide explicitly, with the user, whether the unauthenticated fallback (§5.2) should exist at all outside local development, gated by `NODE_ENV`.

**Replace/build fresh (does not exist yet, cannot be "refactored" from nothing):**
- Durable `Task`/`TaskStep`/`TaskEvent`/`ApprovalRequest`/`IdempotencyRecord` persistence and state machine.
- A server-side approval object bound to an action hash + expiry + policy version.
- Postcondition verification against Odoo (read-after-write).
- A real, runnable evaluation harness (delete or rewrite `tests/agent/evaluation-suite.test.ts` once a test runner is chosen).

**Remove / stop committing:**
- `db/custom.db` from git (keep the directory gitignored; ship a `db:push`/seed step instead).
- `tool-results/`, `download/qa/*`, and the root `--clip` file — QA screenshots and scratch artifacts from prior agent sessions; not source, and large (several MB).
- The plaintext demo credential in `worklog.md` should be rotated/removed from future docs (cannot un-publish git history here, but stop repeating it).
- `src/app/api/agent/chat/route.ts`'s corrupted block needs a real fix (see milestone proposal), not a workaround.

None of the above removals are executed in this phase; Phase 0 is audit-only per the operating brief. They are listed here as recommendations for the first implementation milestones.

---

## 8. Top 10 risks (ranked, with confidence)

1. **(Confidence: high, static)** Cross-tenant IDOR via `requireOwnedOperator` when a session exists and `userId` is client-supplied — affects ~10 route files including the ERP-connect and approval-execution endpoints. Needs live confirmation the moment a DB-capable environment is available, then an immediate fix.
2. **(Confidence: high, static)** Unconditional unauthenticated fallback in `requireOwnedOperator`/`requireSession`/`auth/me` with no environment gate — full-strength auth bypass risk if ever deployed as-is.
3. **(Confidence: high)** The one real write path (`create_draft_invoice`) has no idempotency protection — duplicate real-money documents in Odoo on retry/replay.
4. **(Confidence: high)** "Approval" has no server-side object, hash, or expiry — it is a confirm dialog, trivially bypassable or tamperable by the client.
5. **(Confidence: high)** The repository does not build (`next build` fails on a corrupted file) — there is currently no deployable artifact at all.
6. **(Confidence: high)** Secrets at rest: ERP credentials stored in plaintext in a generic JSON blob column; live DB file and a plaintext demo password committed to git.
7. **(Confidence: medium)** Policy engine is allow-by-default for unrecognized tools — safe only as long as every future tool author remembers to add a branch.
8. **(Confidence: medium)** No durable task state at all — any request that crashes mid-flight (including after a successful Odoo write) leaves no record to recover or reconcile from.
9. **(Confidence: medium)** No CI and no runnable tests — every one of the above can regress silently; the prior worklog's "lint 0 / tsc 0" claims after Task 15 are not reproducible today, which itself is evidence that "we ran it and it passed" claims in this codebase's history should be treated as unverified until re-run.
10. **(Confidence: low-medium, needs product validation)** The majority of the shipped product surface (discovery "scan" of fictitious systems, "forge" of generic CRUD mini-apps) is unrelated to, and arguably in tension with, the WAKIL thesis ("not a new ERP", "not a generic multi-agent framework") — continuing to build on it without a deliberate scope decision risks recreating the PRD's explicit anti-goals.

---

## 9. Proposed first implementation milestone

See `docs/implementation/01-mvp-decision.md` for the workflow choice and `docs/implementation/02-milestone-0.md`-style planning to follow in the next turn. At a minimum, before any new WAKIL runtime feature is built, the smallest reviewable milestone is:

**Milestone 0 — make the baseline true and the IDOR not exploitable**, strictly bounded to:
1. Fix the parse error in `src/app/api/agent/chat/route.ts` so the repository builds again (either restore the intended wiring to `AgentRuntime`/`Odoo19Connector`, or — if that wiring is premature — cleanly remove the dangling fragment so the file is valid and the route behaves as it did before the corruption; decide based on whether chat-triggered ERP tool calls are in scope for the chosen MVP workflow).
2. Fix `requireOwnedOperator()`'s missing ownership check (§5.1) and gate the unauthenticated fallback (§5.2) behind an explicit, documented flag rather than leaving it unconditional.
3. Stop tracking `db/custom.db` and the QA-artifact directories in git; add them to `.gitignore`.
4. Add a minimal, actually-runnable test setup (pick one runner) and port the three existing policy assertions into it as real, executing tests, so "tests pass" claims going forward are verifiable.

This milestone intentionally does **not** yet add durable task state, approvals, or idempotency — those depend on the MVP workflow decision in `01-mvp-decision.md` and are the subject of the next milestone.
