# WAKEEL — Agent Evaluation Report

**Suite version:** `2026-10-04.1` (src/server/eval/scenarios.ts)
**Generated:** 2026-10-04T17:05:02.873Z · Node v22.22.3
**Generator:** `npm run eval:report` → `scripts/eval-report.ts`

> Regenerate this file (`npm run eval:report`) any time `src/server/eval/scenarios.ts`
> or the runtime it exercises changes, so this report never drifts from what the code
> actually does. The same scenarios also run as real assertions in
> `tests/eval/suite.test.ts` (part of `npm test`), so a stale/hand-edited report here
> cannot silently diverge from CI-enforced behavior.

## Scope and what this is NOT

- Workflow under test: `create_draft_invoice` only (the one vertical slice implemented —
  see docs/implementation/01-mvp-decision.md). No other workflow exists yet to evaluate.
- Connector: `FakeERPConnector` (deterministic, in-memory). **No real Odoo instance, no
  network call, no paid API of any kind is used anywhere in this suite.**
- Model/agent: none. Inputs are structured JSON (as if already extracted/validated),
  not free text an LLM interprets. There is no model-in-the-loop in this slice yet.
- **Sample size is 15 scenarios.** This is evidence about these 15 specific,
  hand-authored cases, not a statistical safety claim about the runtime in general.
- Explicitly NOT covered by this suite (do not interpret their absence as "passing"):
  - **Prompt injection in untrusted document/tool output** — there is no model or
    untrusted-document ingestion path in this slice to attack. Deferred in
    docs/implementation/03-milestone-1-report.md.
  - **Live-provider experiments / real cost measurement** — no real model or ERP API is
    called anywhere here by design (rule: deterministic fakes only, no unsafe autonomous
    writes). Cost is reported as N/A below, not zero.

## Aggregate metrics (n = 15)

| Metric | Value | Sample |
| --- | --- | --- |
| Scenarios passed | 15 / 15 (100%) | n=15 |
| Verified task success (outcome=succeeded AND passed) | 4 | n=15 |
| First-pass success (succeeded with no retry/replay/crash involved) | 1 | n=12 |
| Recovery success (succeeded despite transient failure / crash-after-write / replay) | 3 / 3 | n=3 |
| Silent wrong completion (outcome=succeeded when it should not have been) | 0 observed | n=15 (see caveat below) |
| Policy denials correctly blocked | 1 | n=1 |
| Duplicate side effects (>1 connector write in a replay/crash/retry scenario) | 0 | n=3 |
| Review-required outcomes (partially_succeeded) | 2 | n=15 |
| Receipt completeness (non-empty summary + evidence event when required) | 15 / 15 (100%) | n=15 |
| Latency p50 / p95 (ms, in-process, fake connector — NOT representative of real ERP/network latency) | 0.99 / 31.19 | n=15 |
| Cost | N/A — no paid API called | n/a |

**Silent wrong completion caveat:** "0 observed" means none of these 15 scenarios
triggered it, not that it is impossible. It is only disprovable for the specific cases this
suite checks (e.g. verification-mismatch and verification-read-failed scenarios below, which
assert the outcome is `partially_succeeded`, never `succeeded`).

## Per-scenario results

| ID | Category | Passed | Final status | Outcome | Connector writes | Events | Receipt complete | Latency (ms) | Failure reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary-success-01 | ordinary_success | ✅ | succeeded | succeeded | 1 | 7 | yes | 23.22 | — |
| missing-input-01 | missing_or_ambiguous_input | ✅ | failed | failed | 0 | 2 | yes | 1.31 | — |
| invalid-args-01 | invalid_tool_arguments | ✅ | failed | failed | 0 | 2 | yes | 0.51 | — |
| policy-denial-01 | policy_denial | ✅ | failed | failed | 0 | 2 | yes | 0.54 | — |
| approval-rejected-01 | approval_rejected | ✅ | failed | failed | 0 | 4 | yes | 1.12 | — |
| approval-expired-01 | approval_expired | ✅ | failed | failed | 0 | 4 | yes | 31.19 | — |
| transient-recovered-01 | transient_failure_recovered | ✅ | succeeded | succeeded | 1 | 8 | yes | 1.62 | — |
| retry-exhausted-01 | retry_budget_exhausted | ✅ | failed | failed | 0 | 7 | yes | 0.99 | — |
| crash-after-write-01 | crash_after_side_effect | ✅ | succeeded | succeeded | 1 | 6 | yes | 0.99 | — |
| duplicate-replay-01 | duplicate_replayed_request | ✅ | succeeded | succeeded | 1 | 8 | yes | 0.82 | — |
| verification-mismatch-01 | verification_mismatch | ✅ | partially_succeeded | partially_succeeded | 1 | 7 | yes | 0.67 | — |
| verification-read-failed-01 | verification_read_failed | ✅ | partially_succeeded | partially_succeeded | 1 | 7 | yes | 0.99 | — |
| cross-tenant-01 | cross_tenant_access_denied | ✅ | waiting_for_approval | — | 0 | 2 | yes | 0.36 | — |
| action-tampering-01 | action_tampering_blocked | ✅ | failed | failed | 0 | 4 | yes | 0.50 | — |
| idempotency-collision-01 | idempotency_key_collision | ✅ | failed | failed | 1 | 8 | yes | 0.55 | — |

## Result: all scenarios passed

