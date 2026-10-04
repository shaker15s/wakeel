# WAKIL — Final Report (this engagement)

Branch: `arena/01a1076b-wakeel` (off `main`). All work described below is on this
branch only; nothing has been merged or deployed anywhere.

## 1. Summary of what changed and why

The brief (`docs/WAKIL_CODING_AGENT_EXECUTION_PROMPT.md`) asked for one bounded
workflow turned into a vertical slice where **deterministic runtime code, not
the model, owns** durable state, validation, authorization, approval,
idempotency, retries, verification, and evidence. Work proceeded in the
required order:

1. **Phase 0 — audit** (`docs/implementation/00-repo-audit.md`): found the
   existing app's "agent" path was a thin LLM-calls-tools loop with no durable
   task state, no server-side approval enforcement, an auth bypass, and a
   cross-tenant IDOR. Both were fixed immediately (commit `1973372`) because
   they were live, severe security bugs, not just design gaps.
2. **Phase 1 — narrow the slice** (`docs/implementation/01-mvp-decision.md`):
   chose `create_draft_invoice` (vendor-bill-style structured input → policy
   check → mandatory human approval → idempotent Odoo draft-invoice write →
   read-after-write verification) as the one workflow to implement end-to-end,
   over alternatives, with explicit exclusions and kill criteria.
3. **Phase 2 — ADR** (`docs/adr/0001-in-process-durable-execution.md`):
   documented the decision to implement durable execution in-process (an
   explicit `Task`/`Step`/`Approval`/`IdempotencyRecord` state machine over a
   swappable `TaskStore`), rather than pulling in Temporal/Restate/a queue,
   with the trade-offs made explicit.
4. **Phase 3 — the safety-critical runtime** (commit `efc04d5`,
   `src/server/runtime/*`): the actual executor, action-hash-bound approvals,
   idempotent writes, crash-after-write reconciliation, bounded retries,
   read-after-write verification, and an in-memory `TaskStore`.
5. **Security tests for the runtime layer**: approval bypass/replay/expiry/
   tampering, idempotency collisions, crash-after-side-effect, invalid args,
   verification mismatch, retry/deadline exhaustion, tenant isolation, policy
   denial — all as real, executing `vitest` cases in `tests/runtime/*.test.ts`.
6. **Scope pivot, user-directed**: before Phase 4/5, the user asked to first
   wire the already-built runtime into something actually visible and usable
   (no real Odoo available or expected soon), then improve design/animation
   once that was real. This produced:
   - a demo-only, no-login HTTP surface (`d419d65`): `/api/demo/invoice-task*`
     + `/demo/invoice`, running the real executor against `FakeERPConnector`;
   - three sandbox-preview-specific bugs found and fixed live (`45bdc87`,
     `91161c7`, `b75a823`): a `X-Frame-Options: DENY` header silently blocking
     the preview iframe from painting anything at all; Next.js dev mode
     blocking cross-origin HMR/RSC requests from the sandbox's real preview
     origin; and a cookie-based tenant identity silently failing because
     browsers block/partition cookies set inside third-party iframes (fixed
     by moving tenant identity to an explicit request header instead);
   - a design/animation/accessibility pass (`75ff5a2`) — including finding
     and fixing a real, concrete cause of "the UI looks cheap": the brand
     fonts (`next/font/google`) were silently failing to download in this
     sandbox the whole time (no route to `fonts.googleapis.com`), so every
     page had been rendering in a generic system font. Fixed by self-hosting
     the same fonts via `@fontsource/*` + `next/font/local` (the npm registry
     *is* reachable here, Google's font CDN is not).
7. **Phase 4 — evaluation harness** (`23f50aa`): a versioned, 15-scenario
   suite (`src/server/eval/scenarios.ts`) driving the real executor through
   every Phase-4-required category this one slice can exercise, run both as
   CI-enforced tests (`tests/eval/suite.test.ts`) and as a human-readable
   report generator (`npm run eval:report` →
   `docs/implementation/04-evaluation-report.md`).
8. **User asked "is anything missing?", answer: yes — three concrete gaps,
   all closed this turn**: no CI pipeline, no cancel/resume capability, and
   no secret-redaction mechanism (a Tier-0 release-blocker category, until
   now unverified). See §1a below.

## 1a. What was added after "is anything missing?"

- **Secret redaction, enforced at the actual persistence boundary**
  (`src/server/runtime/redact.ts` + wired into
  `InMemoryTaskStore.appendEvent()`): a generic, key-name-based deep
  redactor (`password`, `token`, `apiKey`, `credential`, `authorization`,
  etc., case-insensitive, nested objects/arrays). This is enforced at the
  store, not left to every call site in `executor.ts` to remember — closing
  the gap where a code comment referenced a `redact()` in a `receipt.ts`
  that never existed. Tested in `tests/runtime/redact.test.ts` (6 cases),
  including one that proves a simulated leaked credential never survives
  `appendEvent()` → `listEvents()` round-trip.
- **Cancellation** (`cancelTask()` in `src/server/runtime/executor.ts`):
  cancels a task on explicit human request. Safe by construction — a no-op
  on an already-terminal task (including double-cancel), and explicitly
  **refused** once `execute_write` has already succeeded (a real side effect
  cannot be silently un-done by a cancel; that needs a compensating action
  this workflow does not implement). Also resolves any still-pending
  approval as `rejected` so a UI never shows a stale "approve this" card for
  a task that is already over — a real bug caught live via `curl` against
  the running demo before this report was written, not just in unit tests.
  Tested in `tests/runtime/cancellation.test.ts` (4 cases) and wired into
  the demo surface end-to-end: `POST /api/demo/invoice-task/[taskId]/cancel`,
  `cancelDemoTask()` in the client, and a visible "Cancel" button in
  `/demo/invoice` (hidden once the task is terminal). Added to the
  evaluation suite as a 16th scenario (`cancellation-01`).
- **CI pipeline** (`.github/workflows/ci.yml`, new): runs typecheck +
  `vitest run` (now including the eval suite) on every push/PR as a required
  check, plus a non-blocking lint job (see the workflow file's inline note
  for why lint isn't a hard gate yet — 4 pre-existing problems in unrelated
  legacy code would make it permanently red). Caught and fixed a real bug
  before it ever reached GitHub: `npm ci` requires a committed
  `package-lock.json`, which this repo deliberately does not have (`bun.lock`
  is the intended lockfile, per §6.2 of the repo audit) — the workflow was
  rewritten to use plain `npm install` instead, with the trade-off
  documented inline, since bun itself is unavailable in this sandbox to
  verify a `bun install`-based job would work.

## 2. Files changed

See `git log --oneline main..HEAD` on this branch for the exact commit list.
Grouped by area:

- **Docs**: `docs/implementation/00..05-*.md`, `docs/adr/0001-*.md`.
- **Runtime (Milestone 1, plus cancellation + redaction added this turn)**:
  `src/server/runtime/{executor,memory-store,redact}.ts`,
  `src/server/erp/{contract,fake-connector,odoo-connector}.ts`,
  `tests/runtime/*` (including new `cancellation.test.ts`, `redact.test.ts`).
- **Evaluation harness**: `src/server/eval/scenarios.ts`,
  `tests/eval/suite.test.ts`, `scripts/eval-report.ts`,
  `docs/implementation/04-evaluation-report.md`, `package.json` (`eval:report`
  script + `tsx` devDependency).
- **CI (new this turn)**: `.github/workflows/ci.yml`.
- **Demo surface**: `src/server/runtime/{demo-store,demo-tenant,demo-view}.ts`,
  `src/app/api/demo/invoice-task/**` (including new `[taskId]/cancel/route.ts`),
  `src/lib/demo-invoice-client.ts`, `src/app/demo/invoice/page.tsx`
  (added a Cancel button + cancelled-state styling), `src/components/app/agent-orb.tsx`.
- **Sandbox-preview fixes**: `next.config.ts` (removed `X-Frame-Options`,
  added `allowedDevOrigins`, a temporary `/` → `/demo/invoice` redirect,
  explicit `Cache-Control: no-store`), `src/lib/wakeel/http.ts` (log 4xx
  reasons server-side).
- **Fonts**: `src/app/layout.tsx` (switched to `next/font/local` +
  `@fontsource/*`), `package.json`.
- **Prior security fix (before this engagement's main work)**: cross-tenant
  IDOR and an auth-bypass path in the legacy agent/tools code, commit
  `1973372` — see that commit and `docs/implementation/00-repo-audit.md` for
  detail; not re-litigated here since it predates the runtime rebuild.

## 3. Architecture decisions and trade-offs

- **In-process durable execution over a swappable `TaskStore` interface**,
  not Temporal/Restate/a queue (ADR 0001). Trade-off: no built-in
  cross-process durability or horizontal worker scaling; acceptable because
  the current store is in-memory and single-process anyway, and a persistent
  `TaskStore` implementation (e.g. Prisma-backed) can be swapped in later
  without changing the executor.
- **Idempotency via a per-task derived key + connector-level
  `findByIdempotencyKey` reconciliation**, not a database transaction
  spanning the external call — because a DB transaction cannot atomically
  include a third-party HTTP call. This is what makes crash-after-write
  recovery work without ever double-creating an invoice.
- **Verification is mandatory for `succeeded`.** A write that cannot be
  confirmed read-after-write becomes `partially_succeeded`, never `succeeded`
  — this is enforced in the executor, not left to caller discipline.
- **Demo surface is explicitly a parallel, isolated path** (own store
  singleton, own tenant model, own API routes under `/api/demo/*`), not a
  shortcut bolted onto the real authenticated app. This was a deliberate
  trade-off to let the user see and use the real runtime without conflating
  it with (or being blocked by) the still-broken Prisma/auth path.
- **Removed `X-Frame-Options: DENY` globally**, a real trade-off worth
  flagging explicitly: this is a genuine clickjacking defense in a normal
  deployment. It was removed because this sandbox's live preview embeds the
  app in a third-party iframe and the header made the browser refuse to
  paint anything at all. `next.config.ts` documents this inline and
  specifies the real fix for an actual deployment (a scoped
  `frame-ancestors` CSP directive instead of a blanket `DENY`) — this must
  not ship to a real production deployment unexamined.
- **Fonts self-hosted via `@fontsource/*` instead of `next/font/google`**,
  because this sandbox cannot reach Google's font CDN but can reach the npm
  registry. This is arguably a strict improvement regardless of the sandbox
  (fewer runtime dependencies on a third-party CDN) but was motivated by a
  concrete, reproducible failure here.

## 4. Exact commands run and their real results (most recent, this turn)

```
$ npx tsc --noEmit -p tsconfig.json
(exit 0, no output)

$ npx vitest run
 Test Files  10 passed (10)
      Tests  63 passed (63)
   (tests/runtime/*.test.ts: 40, tests/auth/*.test.ts: 8, tests/agent/evaluation-suite.test.ts: 4, tests/eval/suite.test.ts: 17)

$ npx eslint .
4 problems (3 errors, 1 warning) — unchanged from the Milestone 1 baseline,
in pre-existing, unrelated legacy code: src/components/app/console/views/
assistant-view.tsx (1 error + 1 warning), src/components/ui/carousel.tsx
(1 error), src/hooks/use-mobile.ts (1 error). Not introduced by this
engagement's changes — verified by diffing the count after every commit.

$ npm run eval:report
16/16 scenarios passed. Report written to
docs/implementation/04-evaluation-report.md.
```

Demo surface, verified live over real HTTP (not simulated) earlier this
session: create → policy → approval card → approve/reject →
execute → verify → succeeded/partially_succeeded/failed, including
`transient_once`, `crash_after_write`, and rejection paths, plus a cross-tenant
404 and a 400 on invalid input — all via `curl` against the running dev
server, not asserted only in-process.

## 5. Test counts and failures

- **36/36** (Milestone 1 baseline) → **52/52** (Phase 4 eval harness) →
  **63/63** (after adding cancellation + secret-redaction tests this turn).
  **Zero failures, zero skips, throughout.**
- `tsc --noEmit`: clean, before and after every change.
- `eslint`: 4 pre-existing problems, unchanged across this entire engagement
  (not touched, not newly introduced — verified by diffing the count after
  every commit).

## 6. Benchmark results (sample sizes stated explicitly)

See `docs/implementation/04-evaluation-report.md` for the full table. Headline
numbers, **n = 16 scenarios** (15 + the new cancellation scenario), against
`create_draft_invoice` + `FakeERPConnector` only:

| Metric | Result | n |
| --- | --- | --- |
| Scenarios passed | 16/16 (100%) | 16 |
| Verified task success | 4 | 16 |
| Recovery success (transient/crash/replay) | 3/3 | 3 |
| Duplicate side effects observed | 0 | 3 (replay/crash/retry scenarios) |
| Policy denials correctly blocked | 1/1 | 1 |
| Receipt completeness | 16/16 (100%) | 16 |
| Latency p50 / p95 | 0.60ms / 31.00ms | 16 (in-process, fake connector — not representative of real network/ERP latency) |
| Cost | N/A | no paid API called anywhere |

**This is not a statistical safety claim.** 16 is a small, hand-authored set
covering specific known-important cases, not a random or adversarial sample.
Two Phase-4-required categories are explicitly NOT covered and are called out
as such in the report rather than silently omitted: prompt injection
(no model/untrusted-document path exists in this slice) and live-provider
cost/latency (no real model or ERP API is called anywhere, by design).

## 7. Known limitations and unresolved risks

1. **`InMemoryTaskStore` does not survive a process restart** and has no
   cross-process locking (ADR 0001, accepted trade-off for now — hard
   blocker for any real multi-instance deployment).
2. **No real Odoo crash-after-write reconciliation has been verified** —
   `Odoo19Connector` exists but its crash-recovery semantics against a real
   Odoo instance were never established (no Odoo instance available; not
   expected to become available soon per explicit user direction). On
   ambiguous outcomes it correctly escalates to manual review rather than
   guessing, which is the safe default, but is unverified against reality.
3. **No real, authenticated, persisted HTTP path for this workflow.** The
   demo surface is deliberately separate, uses `FakeERPConnector`, and
   identifies "tenants" via a browser-generated id in a request header, not
   `src/lib/auth.ts` sessions or a real database.
4. **Prompt injection is untested**, because there is no model-in-the-loop or
   untrusted-document ingestion in this slice to attack yet. This is a real,
   not cosmetic, gap once a model starts producing the tool calls (today a
   human fills a form; nothing an LLM would hallucinate is in the loop).
   Secret leakage is now partially addressed (see §1a: generic redaction
   enforced at the store boundary, tested) but only against the shapes this
   suite thought to test — not a formal guarantee.
5. **`bun.lock` was not regenerated** after `npm install`-ing
   `@fontsource/*` and `tsx` (bun is unavailable in this sandbox).
   `package-lock.json` stays gitignored per the project's existing
   dual-lockfile decision (`docs/implementation/00-repo-audit.md` §6.2).
   Needs one `bun install` pass wherever bun is actually available. The new
   `.github/workflows/ci.yml` uses `npm install` for the same reason —
   **this CI workflow has been validated locally (YAML syntax, and every
   command it runs was independently verified in this sandbox) but has
   never actually executed on GitHub's own runners**, since nothing has
   been pushed/opened as a PR yet. Confirm its first real run before relying
   on it as a gate.
6. **`X-Frame-Options: DENY` was removed globally**, not scoped — see §3.
   Must be revisited (scoped CSP `frame-ancestors`) before any real
   deployment outside this sandbox's iframe-embedded preview.
7. **The `/` → `/demo/invoice` redirect in `next.config.ts` is sandbox-only
   scaffolding**, explicitly commented as such, tied to Prisma being
   non-functional here. Must be removed once a real database/auth path
   exists for `/`.
8. **Evaluation suite covers exactly one workflow.** A second, differently
   shaped workflow would substantially strengthen confidence that the
   runtime's invariants generalize rather than having been tuned to one case.
9. **Cancellation does not compensate an already-completed write.** Once
   `execute_write` succeeds, `cancelTask()` correctly *refuses* rather than
   lying about undoing it — but there is no voiding/compensating-action path
   implemented, so a user who wants to undo a completed draft invoice has no
   runtime-supported way to do that yet (would need a new, separate
   `void_draft_invoice`-style workflow, not a bigger cancel).
10. **No real, authenticated, persisted HTTP path for this workflow.** The
    demo surface is deliberately separate, uses `FakeERPConnector`, and
    identifies "tenants" via a browser-generated id in a request header, not
    `src/lib/auth.ts` sessions or a real database.
11. **No real Odoo crash-after-write reconciliation has been verified** —
    `Odoo19Connector` exists but its crash-recovery semantics against a real
    Odoo instance were never established (no Odoo instance available; not
    expected to become available soon per explicit user direction). On
    ambiguous outcomes it correctly escalates to manual review rather than
    guessing, which is the safe default, but is unverified against reality.
12. **`InMemoryTaskStore` does not survive a process restart** and has no
    cross-process locking (ADR 0001, accepted trade-off for now — hard
    blocker for any real multi-instance deployment).

## 8. Migration / rollback instructions

Nothing in this engagement has been deployed anywhere or merged to `main` —
everything lives on `arena/01a1076b-wakeel`. Rollback is therefore:

- **To discard everything**: do not merge the branch; it has no effect on
  `main` or any deployed environment until merged.
- **To discard part of it**: the work is in small, reviewable commits (see
  §2); `git revert <sha>` any individual commit. The demo surface and the
  sandbox-preview fixes in `next.config.ts` are fully isolated from the
  Milestone 1 runtime (`src/server/runtime/executor.ts` and friends) and can
  be reverted independently without touching it.
- **Database**: no migrations were added or changed. `prisma/schema.prisma`
  is untouched; the in-memory `TaskStore` requires no migration.
- **Feature flag**: there is no flag because nothing writes to a real ERP —
  `FakeERPConnector` is hardcoded in both the demo surface and the
  evaluation harness. Wiring a real Odoo connector in would be the point to
  add a flag/shadow-mode switch, per Phase 7 of the execution brief.

## 9. How to run this locally (brief runbook)

```bash
npm install
npx tsc --noEmit -p tsconfig.json   # typecheck
npx vitest run                       # 52 tests, including the eval suite
npm run eval:report                  # regenerates docs/implementation/04-evaluation-report.md
npx next dev -p 3000 -H 0.0.0.0      # then open /demo/invoice
```

The real app's other routes (`/`, `/api/auth/*`, the authenticated console)
require a working Prisma client and database, which this sandbox cannot
provide (no network route to `binaries.prisma.sh`) — `/demo/invoice` is the
only path that is guaranteed to work without that dependency.

## 10. Next 3 highest-value tasks

1. **Persistent `TaskStore` + real auth wiring.** Implement a Prisma-backed
   `TaskStore` (schema already sketched in spirit by `src/server/runtime/types.ts`)
   and wire the real app's `src/lib/auth.ts` session/tenant context into the
   executor, replacing the demo surface's throwaway header-based identity.
   This is the single biggest gap between "works in a sandbox demo" and
   "a real product."
2. **Establish real Odoo 19 crash-after-write semantics** and implement
   genuine reconciliation in `Odoo19Connector` (today: safe escalation to
   manual review, not verified automatic recovery) — needs a real or
   realistic sandboxed Odoo instance, which is explicitly not expected soon;
   flag this as blocked until that changes.
3. **Add a second, differently-shaped workflow to the evaluation suite**
   (e.g. a read-heavy query workflow, or one with a genuinely untrusted
   document-ingestion step) to start exercising prompt-injection and
   cross-workflow generalization — the two biggest gaps called out in §7.
