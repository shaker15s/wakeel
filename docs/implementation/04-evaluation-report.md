# WAKEEL — Agent Evaluation Report

> Historical customer-invoice runtime scenarios only. This is not the full accounting evaluation. The separate 47-case synthetic accounting suite and current capability limits are documented in [06-accounting-agent-report.md](06-accounting-agent-report.md).

**Suite version:** `2026-10-14.2` (src/server/eval/scenarios.ts)
**Generated:** 2026-10-14T20:35:28.153Z · Node v24.14.1
**Generator:** `npm run eval:report` → `scripts/eval-report.ts`

> Regenerate this file (`npm run eval:report`) any time `src/server/eval/scenarios.ts`
> or the runtime it exercises changes, so this report never drifts from what the code
> actually does. The same scenarios also run as real assertions in
> `tests/eval/suite.test.ts` (part of `npm test`), so a stale/hand-edited report here
> cannot silently diverge from CI-enforced behavior.

## Scope and what this is NOT

- Workflow under test: legacy customer-invoice task executor only. Supplier-bill, financial-read, and accounting-calculation tests are outside this legacy harness; see the current accounting report.
- Connector: `FakeERPConnector` (deterministic, in-memory). **No real Odoo instance, no
  network call, no paid API of any kind is used anywhere in this suite.**
- Model/agent: none in this executor harness. The live chat has a separate model-in-the-loop runtime; this report does not evaluate it.
- **Sample size is 16 scenarios.** This is evidence about these 16 specific,
  hand-authored cases, not a statistical safety claim about the runtime in general.
- Explicitly NOT covered by this suite (do not interpret their absence as "passing"):
  - **Prompt injection in untrusted document/tool output** — not exercised by this structured-input executor suite. Separate tool-boundary tests cover selected user-text and bill-field injection cases.
  - **Live-provider experiments / real cost measurement** — no real model or ERP API is
    called anywhere here by design (rule: deterministic fakes only, no unsafe autonomous
    writes). Cost is reported as N/A below, not zero.

## Aggregate metrics (n = 16)

| Metric | Value | Sample |
| --- | --- | --- |
| Scenarios passed | 16 / 16 (100%) | n=16 |
| Verified task success (outcome=succeeded AND passed) | 4 | n=16 |
| First-pass success (succeeded with no retry/replay/crash involved) | 1 | n=13 |
| Recovery success (succeeded despite transient failure / crash-after-write / replay) | 3 / 3 | n=3 |
| Silent wrong completion (outcome=succeeded when it should not have been) | 0 observed | n=16 (see caveat below) |
| Policy denials correctly blocked | 1 | n=1 |
| Duplicate side effects (>1 connector write in a replay/crash/retry scenario) | 0 | n=3 |
| Review-required outcomes (partially_succeeded) | 2 | n=16 |
| Receipt completeness (non-empty summary + evidence event when required) | 16 / 16 (100%) | n=16 |
| Latency p50 / p95 (ms, in-process, fake connector — NOT representative of real ERP/network latency) | 2.14 / 422.58 | n=16 |
| Cost | N/A — no paid API called | n/a |

**Silent wrong completion caveat:** "0 observed" means none of these 16 scenarios
triggered it, not that it is impossible. It is only disprovable for the specific cases this
suite checks (e.g. verification-mismatch and verification-read-failed scenarios below, which
assert the outcome is `partially_succeeded`, never `succeeded`).

## Per-scenario results

| ID | Category | Passed | Final status | Outcome | Connector writes | Events | Receipt complete | Latency (ms) | Failure reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary-success-01 | ordinary_success | ✅ | succeeded | succeeded | 1 | 7 | yes | 422.58 | — |
| missing-input-01 | missing_or_ambiguous_input | ✅ | failed | failed | 0 | 2 | yes | 2.14 | — |
| invalid-args-01 | invalid_tool_arguments | ✅ | failed | failed | 0 | 2 | yes | 1.47 | — |
| policy-denial-01 | policy_denial | ✅ | failed | failed | 0 | 2 | yes | 1.10 | — |
| approval-rejected-01 | approval_rejected | ✅ | failed | failed | 0 | 4 | yes | 2.04 | — |
| approval-expired-01 | approval_expired | ✅ | failed | failed | 0 | 4 | yes | 31.69 | — |
| transient-recovered-01 | transient_failure_recovered | ✅ | succeeded | succeeded | 1 | 8 | yes | 2.90 | — |
| retry-exhausted-01 | retry_budget_exhausted | ✅ | failed | failed | 0 | 7 | yes | 7.44 | — |
| crash-after-write-01 | crash_after_side_effect | ✅ | succeeded | succeeded | 1 | 6 | yes | 2.00 | — |
| duplicate-replay-01 | duplicate_replayed_request | ✅ | succeeded | succeeded | 1 | 8 | yes | 2.68 | — |
| verification-mismatch-01 | verification_mismatch | ✅ | partially_succeeded | partially_succeeded | 1 | 7 | yes | 3.86 | — |
| verification-read-failed-01 | verification_read_failed | ✅ | partially_succeeded | partially_succeeded | 1 | 7 | yes | 1.60 | — |
| cross-tenant-01 | cross_tenant_access_denied | ✅ | waiting_for_approval | — | 0 | 2 | yes | 1.47 | — |
| action-tampering-01 | action_tampering_blocked | ✅ | failed | failed | 0 | 4 | yes | 3.95 | — |
| idempotency-collision-01 | idempotency_key_collision | ✅ | failed | failed | 1 | 8 | yes | 2.71 | — |
| cancellation-01 | cancellation | ✅ | cancelled | cancelled | 0 | 3 | yes | 1.42 | — |

## Result: all scenarios passed

