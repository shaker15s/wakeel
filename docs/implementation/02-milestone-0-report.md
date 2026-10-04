# Milestone 0 — Make the baseline true and close the critical auth gaps

**Status: complete.** Scope was deliberately bounded (see `00-repo-audit.md` §9) to the smallest change set that makes "the repository builds / typechecks / has running tests" and "the primary auth guard enforces tenant isolation" true statements, without adding any new WAKIL runtime functionality (durable tasks, approvals-as-objects, idempotency — those are future milestones gated on `01-mvp-decision.md`).

## Objective and invariants established

1. **The repository must build and typecheck** — a prerequisite for everything else; previously false (`00-repo-audit.md` §4).
2. **Tenant isolation must hold in the primary route guard** — `requireOwnedOperator()` must never return another tenant's operator workspace as if it were the caller's (PRD principle 11, "tenant isolation is checked server-side on every read and write").
3. **Unauthenticated requests must not silently impersonate an operator in production** unless explicitly opted into (PRD principle: deny-by-default authorization).
4. **A session token issued by this process must verify in this process** — a prerequisite for (2)/(3) meaning anything at all (an auth guard can't enforce tenant isolation if sessions never verify).
5. **"Tests pass" must be a checkable claim** — there must be an installed runner and executing tests, not an unused function.

## Files changed

| File | Change |
|---|---|
| `src/app/api/agent/chat/route.ts` | Removed the corrupted/dead inline system-prompt array that was pasted over by an unfinished edit (this was the fatal parse error blocking `tsc`/`next build`); imported `AgentRuntime`/`Odoo19Connector` (previously used but never imported). Documented, not hidden, that this removes workspace systems/activity grounding text that AgentRuntime does not currently consume anyway — a pre-existing gap, now explicit instead of buried in a syntax error. |
| `src/lib/auth.ts` | (a) Added `allowUnauthenticatedFallback()`, gating the "local trial" unauthenticated fallback behind `NODE_ENV !== 'production'` or an explicit `WAKEEL_ALLOW_UNAUTHENTICATED_TRIAL=true` opt-in; applied it in `requireOwnedOperator()` and `requireSession()`. (b) Fixed `requireOwnedOperator()` to verify `user.accountId === account.id` whenever a `userId` is supplied and a session exists, returning 403 instead of silently granting access — this was the cross-tenant IDOR in `00-repo-audit.md` §5.1. (c) Cached the dev-only session-signing secret per process instead of regenerating it (via `randomBytes`) on every `sessionSecret()` call, which previously meant a token signed by `createSessionToken()` could never successfully verify via `verifySessionToken()` without `AUTH_SECRET` set. |
| `src/app/api/auth/[action]/route.ts` | `GET /api/auth/me` now honors `allowUnauthenticatedFallback()` and returns `{ account: null, operators: [] }` instead of bootstrapping/returning an arbitrary operator when disabled. The frontend already treats `session: null` as "show the auth gate" (`src/components/app/app-shell.tsx`), so this required no client-side change. |
| `src/app/api/agent/execute-approval/route.ts` | Fixed `z.record(z.any())` → `z.record(z.string(), z.any())` (Zod 4's two-argument signature; every other `z.record(...)` call site in the codebase already used the correct form — this one was a latent type error). |
| `src/server/agent/tools.ts` | Gave `executeToolCall()` an explicit `ToolCallResult` return type so the policy-denied / approval-required / connector-result branches share one checkable shape instead of an unnamed, partially-overlapping union `tsc` could not validate property access against. |
| `src/components/app/console/views/assistant-view.tsx` | Added missing `ShieldCheck`/`Loader2` imports from `lucide-react` (both were referenced in JSX and undefined — a guaranteed runtime crash the first time that code path rendered). |
| `src/app/api/erp/odoo/status/route.ts` | Deleted — a 0-byte stub file with zero exports, confirmed unused by the frontend (`grep` found no caller), which made it an invalid Next.js route module and the sole reason `tsc` still failed after the chat-route fix. |
| `tsconfig.json` | Excluded `examples/` (an unrelated websocket demo scaffold missing `socket.io`/`socket.io-client` dependencies) from typecheck, matching eslint's existing ignore of the same directory. |
| `.gitignore` | Stopped tracking `db/*.db` (the live SQLite file, which had real account rows — see `00-repo-audit.md` §5.5), `tool-results/`, `download/`, and `package-lock.json` (this repo's lockfile convention is `bun.lock`; npm was used in this sandbox only because `bun` isn't installed here — see §6.2 of the audit). |
| `package.json` | Added `vitest` as a dev dependency and `test`/`test:watch` scripts. |
| `vitest.config.ts` (new) | Minimal Node-environment test config with the same `@/*` alias as the app. |
| `tests/agent/evaluation-suite.test.ts` | Rewritten from a function nothing called into real, executing `describe`/`it` cases (ported the original three assertions unchanged in intent) — plus one new test that **pins the current allow-by-default policy gap** (`00-repo-audit.md` §5.6) as a visible, intentional assertion so a future fix is a deliberate change, not a silent behavior flip. |
| `tests/auth/require-owned-operator.test.ts` (new) | Regression tests for the IDOR fix and the fallback-gating fix, with `@/lib/db` mocked (Prisma's engine binary cannot be downloaded in this sandbox — see audit §4.5/§6.1, so these are unit tests of the guard's decision logic, not a live DB integration test). |
| `tests/auth/session-tokens.test.ts` (new) | Regression test for the session-secret caching fix (sign now, verify in the same process, must succeed). |

Files removed from git tracking (left on disk, not deleted — except the stray `--clip` file, a committed PNG with a nonsensical name, which was deleted since it has no identifiable purpose): `db/custom.db`, `tool-results/**`, `download/**`.

## Verification — actual commands and results run in this session

```
$ npx eslint .
✖ 4 problems (3 errors, 1 warning)   # all react-hooks/set-state-in-effect + one next/link warning,
                                      # pre-existing, unrelated UI-polish lint rules — see "Not fixed" below.
                                      # (down from 6 errors + 1 warning; the parse error and the two
                                      # undefined-icon errors are gone)

$ rm -rf .next && npx tsc --noEmit -p tsconfig.json
(exit 0 — clean)

$ npx vitest run
 ✓ tests/auth/require-owned-operator.test.ts (6 tests)
 ✓ tests/agent/evaluation-suite.test.ts (4 tests)
 ✓ tests/auth/session-tokens.test.ts (2 tests)
 Test Files  3 passed (3)
 Tests  12 passed (12)

$ npx next build
# still fails — but ONLY on next/font's Google Fonts fetch (fonts.googleapis.com is
# blocked by this sandbox's network allowlist, confirmed independently with curl in
# 00-repo-audit.md §6.1). The parse error that previously failed the build first is gone;
# this is an environment limitation of this coding session, not a code defect introduced
# or left by this milestone.
```

**Regression-test sanity check performed:** the ownership-check fix in `requireOwnedOperator()` was temporarily reverted and `tests/auth/require-owned-operator.test.ts` was re-run to confirm it fails without the fix (it did — `expected true to be false`), then the fix was restored and the suite re-verified green. This confirms the new test is not a tautology.

## What this milestone deliberately did NOT do

- No durable `Task`/`TaskStep`/`ApprovalRequest`/`IdempotencyRecord` persistence — that depends on the workflow decision in `01-mvp-decision.md` and is Milestone 1.
- No fix for the allow-by-default policy fallthrough (`00-repo-audit.md` §5.6) — pinned as a known, tested gap rather than silently changed, since changing default-allow to default-deny for unrecognized tools is a policy-engine redesign, not a one-line fix, and deserves its own milestone/tests.
- No fix for plaintext ERP credential storage (`00-repo-audit.md` §5.5) — requires a secret-storage design decision (encrypt-in-place vs. external secret manager), out of scope for "make the baseline true."
- No fix for the three pre-existing `react-hooks/set-state-in-effect` lint errors in unrelated UI files (`use-mobile.ts`, `carousel.tsx`, `assistant-view.tsx`'s speech-recognition effect) — cosmetic React best-practice warnings, not defects that break functionality, and touching them is unrelated UI churn outside this milestone's security/build scope.
- No change to `bun.lock` — this sandbox has no `bun` binary to regenerate it; `package.json` reflects the new `vitest` dependency but someone with `bun` available needs to run `bun install` to refresh `bun.lock` before this is merged into a bun-based workflow.
- `next build` was not made to fully succeed in this sandbox — that specific remaining failure is a network-egress limitation of this coding session (confirmed via direct `curl`), not a code change this milestone could make without altering the font-loading strategy (self-hosting fonts), which is an unrelated branding/architecture decision.

## Known residual risks (carried forward, not resolved by this milestone)

Everything in `00-repo-audit.md` §5 and §8 that is not listed as fixed above remains open: plaintext ERP credentials at rest, no server-bound approval object, no idempotency on `createDraftInvoice`, no durable task state, allow-by-default policy fallthrough for unrecognized tools, no CI. These are the subject of the next milestones once `01-mvp-decision.md`'s workflow is confirmed.
