# WAKEEL Accounting Agent: implementation and evaluation

**Updated:** 2026-10-14  
**Branch:** `codex/wakil-accounting-agent`  
**Evaluation:** synthetic fixtures only; no company ERP data used.

## What the branch adds

- The existing conversation runtime now routes registered financial reads through typed schemas and creates durable, tenant/operator-scoped tasks for draft customer invoices and supplier bills.
- Each draft write is bound to an exact action hash, requires a persisted human decision, is idempotent, checks partner role, reconciles uncertain outcomes where supported, verifies the saved record, and returns a receipt. A fresh concurrent advance does not issue a second connector call.
- Explicit memory is scoped to the operator and company. Memory is inspectable and editable, is not a source of authorization or accounting policy, and is not silently written by the model.
- Accounting read tools return source and calculation evidence. The FakeERP fixture implements a chart, trial balance, activity, aging, and P&L/balance-sheet reports.
- New deterministic accounting helpers validate balanced journal proposals, generate read-only bank-match proposals, assess policy-bound expenses, calculate straight-line schedules with exact minor-unit allocation, compute budget variances, and identify incomplete period-close controls.
- The conversation runtime now exposes six deterministic calculators (`calculate_budget_variance`, `build_period_close_checklist`, `assess_expense`, `calculate_asset_schedule`, `propose_bank_matches`, `prepare_journal_entry_proposal`) alongside live ERP tools. Calculators need no ERP connection and run on user-supplied data only; journal proposals are validated against the connector's verified chart, never against model-supplied account lists.
- Tool visibility is capability-filtered per turn: the model only sees tools whose required capability is confirmed (live tools come from server-resolved ERP permissions; calculators are always available). Live ERP tools are hidden and refused when no connector is present.
- Expense and asset tools fail closed to `review_required` when company policy is absent; they never infer tax treatment or depreciation policy. Bank matching remains suggestion-only.
- The approval panel surfaces exact pending action details, decision state, and verified receipt in the existing assistant experience.

## Evaluation evidence

| Evidence | Result | Scope |
| --- | ---: | --- |
| Business-owner scenarios | 47 / 47 passed | Synthetic journal, reconciliation, expense, fixed-asset, budget, and close-policy cases (`tests/agent/business-owner-scenarios.test.ts`) |
| Focused accounting/runtime checks after the AP/AR changes | 64 / 64 passed | Six accounting and business-owner test files; typecheck passed separately |
| Full suite after wiring calculators into the conversation runtime | 204 passed, 1 skipped | `bun run test`; `bunx tsc --noEmit` and `bun run lint` both passed; legacy eval harness report regenerated (16 / 16 scenarios) |
| Focused AP/AR persistence, replay, concurrent-write, API scope, and chat handoff checks | 40 / 40 passed | Eight Vitest files; TypeScript passed |
| KiosAPI model/tool-call smoke | 1 synthetic call passed | Checks provider connectivity and structured tool-call parsing only; not an accounting-quality benchmark |
| Live ERP checks | Not run | No authenticated company Odoo sandbox or verified target schema/permissions was available |
| Real business transactions | 0 | None; connector-backed writes in the reviewed scenarios use FakeERP only |

These are hand-authored deterministic cases, not a statistical claim that the system is error-free or better than a human accountant. The model smoke proves only that one synthetic structured call traversed the provider adapter. It does not establish accounting correctness, latency guarantees, or live ERP compatibility.

## Capability and safety limits

- Odoo accounting report schema and permissions remain unverified. New accounting reports fail closed without a network call until a real sandbox confirms the target database models and permissions.
- Odoo supplier-bill creation is disabled. Draft AP/AR task execution is exercised only against FakeERP; enabling a live connector requires an Odoo sandbox and verified read-after-write/idempotency behavior.
- Journal output is a balanced, unposted proposal. There is no journal ERP write tool, posting action, or bank-reconciliation mutation.
- Bank matching is suggestion-only. Duplicate or near matches and insufficient evidence require a human review.
- Expense eligibility requires explicit company policy and receipts. Unknown tax treatment remains review-required.
- Asset schedules currently support configured straight-line depreciation only; other methods and missing policy require review.
- Period-close output is a checklist for human review and cannot close or post a period.
- The legacy customer-invoice compatibility executor still accepts JavaScript numeric inputs; this gap remains documented. New vendor bills use decimal-string money.
- KiosAPI model availability and free-tier limits can change. The API key stays in ignored local configuration and is not part of this branch.

## Commands recorded during implementation

```text
bunx vitest run tests/agent/business-owner-scenarios.test.ts tests/accounting/journal-entry.test.ts tests/accounting/reconciliation.test.ts tests/accounting/expenses.test.ts tests/accounting/fixed-assets.test.ts tests/accounting/budgets.test.ts
  6 files, 62 tests passed

bunx tsc --noEmit -p tsconfig.json
  passed

bunx vitest run tests/runtime/create-draft-vendor-bill.test.ts tests/agent/vendor-bill-agent-flow.test.ts tests/runtime/create-draft-invoice.test.ts tests/runtime/idempotency.test.ts tests/agent/tool-registry.test.ts tests/api/agent-tasks.test.ts tests/api/agent-chat-conversation.test.ts tests/runtime/store-restart.test.ts
  8 files, 40 tests passed

bunx tsc --noEmit -p tsconfig.json
  passed
```

The legacy invoice-only harness report remains in [04-evaluation-report.md](04-evaluation-report.md); it must not be read as the scope of this branch's full focused test set.
