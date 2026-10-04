# Milestone 1 — Durable Task/Step/Approval/Idempotency runtime for `create_draft_invoice`

**Status: complete for the scope below.** This implements, for the single
workflow chosen in `01-mvp-decision.md`, the core runtime invariants the PRD
requires (`docs/WAKIL_MASTER_PRD.md` §3/§7/§8/§9): durable task/step state,
an approval system that cannot be bypassed or replayed, idempotent writes
with crash-after-side-effect reconciliation, and read-after-write
verification that never silently reports success. See
`docs/adr/0001-in-process-durable-execution.md` for the architecture
decision behind *how* this was built (in-process resumable executor, not a
queue/orchestration dependency).

## What this milestone deliberately does NOT include (scope boundary)

- **No Prisma-backed `TaskStore`.** Only `InMemoryTaskStore` was built and
  tested. This sandbox cannot download Prisma's query-engine binary (see
  `00-repo-audit.md` §4.5/§6.1), so a Prisma implementation could not be
  executed or verified here — writing one anyway would mean shipping
  untested database code, which violates the "never claim a check passed
  that wasn't run" rule. `TaskStore` is an interface specifically so this
  swap is additive later, not a rewrite.
- **No Next.js API route wiring.** Nothing yet calls `createCreateDraftInvoiceTask`/
  `advance` from an HTTP handler, and no UI consumes it. Wiring this up
  depends on the (currently unverifiable) Prisma store, real session/tenant
  resolution, and the existing approval UI — each deserves its own reviewable
  change and its own tests against a running server, not a blind addition
  here.
- **`Odoo19Connector` does not implement `findByIdempotencyKey` or tag
  created invoices with the idempotency key.** It now *accepts* an optional
  `idempotencyKey` parameter (interface compliance) but does not act on it.
  This is a known, explicitly flagged gap, not a silent omission: without a
  verified live Odoo instance in this sandbox, guessing at real Odoo
  field/model semantics for tagging and searching invoices would be
  fabricated, unverifiable behavior. The runtime's `IdempotencyRecord` layer
  still prevents WAKIL itself from calling `createDraftInvoice` twice for the
  same key; what's missing is the ability to reconcile if Odoo committed the
  write but the HTTP response never arrived. Tracked as the top risk below.
- **No scheduler/background trigger for `advance()`.** Something (an API
  route, a cron job, a webhook) must call it; that integration is out of
  scope here, see ADR 0001 consequences.

## Files added

| File | Purpose |
|---|---|
| `src/server/runtime/types.ts` | Core types: `Task`, `TaskStep`, `TaskEvent`, `ApprovalRequest`, `IdempotencyRecord`, and the `TaskStore` persistence contract every implementation (in-memory now, Prisma later) must satisfy. Tenant-scoping is part of the contract's method signatures, not an afterthought. |
| `src/server/runtime/action-hash.ts` | `computeActionHash()` — canonical sha256 hash over `{toolName, normalizedParams, policyVersion, resourceRef}`, order-independent. This is what an approval is actually bound to. |
| `src/server/runtime/memory-store.ts` | `InMemoryTaskStore` — full, tested `TaskStore` implementation. Enforces tenant isolation (wrong-tenant reads return `null`/throw, never another tenant's data), approval replay protection (a decided/expired approval can never be decided again), and lazy approval expiry (an approval past its TTL is treated as expired on read even if nothing ever explicitly expired it). |
| `src/server/runtime/workflows/create-draft-invoice.ts` | The workflow definition: zod input schema (`customerId`, `lines[]`, optional `memo`) and the fixed 5-step sequence `validate_input → policy_check → await_approval → execute_write → verify`. |
| `src/server/runtime/executor.ts` | `createCreateDraftInvoiceTask()` and the resumable `advance(deps, tenantId, taskId)` orchestrator. Implements policy integration (reuses the existing `PolicyEngine`, does not fork it), approval creation/checking, idempotent-write handling with reconciliation, and read-after-write verification. Safe to call repeatedly, including after a simulated crash. |
| `src/server/erp/fake-connector.ts` | `FakeERPConnector` — deterministic, in-memory `IERPConnector` implementation with fault injection (`queueInvoiceBehavior`: `transient_error` / `validation_error` / `crash_after_write`) and the optional `findByIdempotencyKey` reconciliation capability, used to exercise every failure mode in tests without touching a real ERP. |
| `tests/runtime/action-hash.test.ts` | Pure unit tests: determinism, canonicalization (key order), sensitivity to every input field. |
| `tests/runtime/create-draft-invoice.test.ts` | Happy path; approval rejection; approval tampering (hash mismatch); approval expiry; approval replay; invalid-input rejection; policy denial; cross-tenant isolation; task-level deadline exhaustion. |
| `tests/runtime/idempotency.test.ts` | Crash-after-write reconciliation (connector supports it); ambiguous-outcome escalation (connector does not support reconciliation — never retried blindly); retry budget exhaustion; recovery after one transient failure; permanent/non-ambiguous rejection; re-entrant dedup against a completed idempotency record; idempotency-key-reused-with-different-hash rejection. |
| `tests/runtime/verification.test.ts` | Verification mismatch (wrong customer) → `partially_succeeded`, never `succeeded`; record not found after write → `partially_succeeded` with `verification_read_failed`. |
| `tests/runtime/helpers.ts` | Shared test fixtures (`makeDeps`, valid input, tenant/actor ids). |

## Files changed

| File | Change |
|---|---|
| `src/server/erp/contract.ts` | Added an optional `idempotencyKey` parameter to `createDraftInvoice()` (additive — existing one-argument call sites still compile) and an **optional** `findByIdempotencyKey?()` capability method. A connector that omits it is explicitly treated by the executor as "cannot reconcile ambiguous outcomes," never silently assumed to support it. |
| `src/server/erp/odoo-connector.ts` | `createDraftInvoice()` now accepts the optional `idempotencyKey` param for interface compliance; documented inline that it is not yet used to tag/search real Odoo records (the flagged gap above). |
| `src/server/runtime/types.ts` | `TaskStore.updateTask()` patch type widened to allow `riskClass` (set once `policy_check` determines the real risk level, refining the `MEDIUM` placeholder set at task creation). |

## Verification — actual commands and results run in this session

```
$ npx tsc --noEmit -p tsconfig.json
(exit 0, no output)

$ npx vitest run
 ✓ tests/runtime/create-draft-invoice.test.ts (9 tests)
 ✓ tests/runtime/idempotency.test.ts (7 tests)
 ✓ tests/auth/require-owned-operator.test.ts (6 tests)
 ✓ tests/agent/evaluation-suite.test.ts (4 tests)
 ✓ tests/runtime/verification.test.ts (2 tests)
 ✓ tests/auth/session-tokens.test.ts (2 tests)
 ✓ tests/runtime/action-hash.test.ts (6 tests)

 Test Files  7 passed (7)
      Tests  36 passed (36)

$ npx eslint .
✖ 4 problems (3 errors, 1 warning)   # identical pre-existing react-hooks/set-state-in-effect
                                      # issues from Milestone 0 (carousel.tsx, use-mobile.ts,
                                      # assistant-view.tsx) + 1 next/link warning — unrelated to
                                      # this change, unchanged count.
```

24 of the 36 passing tests are new in this milestone (24 in `tests/runtime/`); the
other 12 are the Milestone 0 regression tests, re-run to confirm no regression.

## Security-relevant test matrix coverage (mapped to task's mandated categories)

| Category | Covered by |
|---|---|
| Approval bypass (policy requires approval, none given) | `create-draft-invoice.test.ts` — `await_approval` always blocks progress (`status: waiting_for_approval`) until a store-level `decideApproval()` call exists; executor has no internal path to mark an approval decided. |
| Approval replay | `create-draft-invoice.test.ts` — "replay" test; `InMemoryTaskStore.decideApproval()` throws on any approval not in `pending` status. |
| Approval expiry | `create-draft-invoice.test.ts` — "expiry" test; lazily enforced on every `getApproval()` read. |
| Approval tampering | `create-draft-invoice.test.ts` — "tampering" test; execution re-validates the executed action's hash against the **persisted approval's** hash, not just a freshly recomputed one. |
| Idempotency collisions / key reuse | `idempotency.test.ts` — dedup test (reuse with matching hash → cached, no re-call) and reuse-with-different-hash test (rejected, never trusted). |
| Crash-after-side-effect | `idempotency.test.ts` — "crash-after-write" reconciliation test (connector supports it) and "never blindly retries" test (connector does not). |
| Invalid args | `create-draft-invoice.test.ts` — empty `lines[]` rejected by zod before policy/connector are ever touched. |
| Verification mismatch (never silently succeed) | `verification.test.ts` — both a field mismatch and a not-found-after-write case resolve to `partially_succeeded`, never `succeeded`. |
| Retry/budget exhaustion | `idempotency.test.ts` — retry-exhaustion test (3 attempts, matches `execute_write`'s configured `maxAttempts`); `create-draft-invoice.test.ts` — task-level deadline exhaustion test. |
| Tenant isolation | `create-draft-invoice.test.ts` — cross-tenant test at the `TaskStore` boundary (task/approval reads and decisions from the wrong tenant are rejected/invisible, and do not affect the real tenant's state). |
| Policy denial | `create-draft-invoice.test.ts` — denial path tested via a scoped `PolicyEngine.evaluate` spy (see note below). |
| Prompt injection / secret leakage | **Not covered in this milestone** — out of scope; this milestone has no LLM-facing surface or secret-handling code. These remain open items for whichever milestone adds model-facing extraction or ERP-credential handling. |

**Note on the policy-denial test:** `PolicyEngine.evaluate()` today has no
code path that returns `allowed: false` for `create_draft_invoice` specifically
(only the unrelated `DESTRUCTIVE` category is denied). Rather than invent a
new always-deny rule just to exercise the path, the test uses `vi.spyOn` to
simulate a stricter future policy decision and asserts the executor correctly
honors a denial — i.e., it tests the *executor's* contract with
`PolicyEngine`, not a fact about today's policy rules. This is disclosed, not
hidden.

## Residual risks / explicit gaps carried forward

1. **In-memory store does not survive a process restart** and has no
   cross-process locking — acceptable for now per ADR 0001, but a hard
   blocker for any multi-instance or production deployment. Must be replaced
   with a persistent `TaskStore` before this runs for real.
2. **`Odoo19Connector` cannot reconcile a crash-after-write against the real
   ERP.** If WAKIL calls Odoo, Odoo commits the invoice, and the HTTP
   response is lost before WAKIL records success, the task will currently be
   escalated to manual review (correct, safe default) rather than
   automatically confirmed — but automatic confirmation requires real,
   verified Odoo field semantics this session could not establish.
3. **No HTTP/API surface yet.** Everything in this milestone is
   library-level and only exercised by its own tests; nothing has been
   wired into a request handler, so there is no live, end-to-end path yet.
4. **Per-task idempotency key derivation (`task:{taskId}:execute_write`) ties
   dedup scope to a single task.** This is correct for "don't double-execute
   this task's write," but does not protect against a *user* submitting the
   same logical invoice twice as two separate tasks (that is a
   business-level duplicate-detection problem, not an idempotency problem,
   and is out of scope for this milestone).
