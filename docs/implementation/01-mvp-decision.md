# WAKIL — Narrow MVP Workflow Decision

**Date:** 2026-10-04
**Status:** Provisional / hypothesis — **no completed WAKIL Deep Research report exists in the repository** (confirmed by `find . -iname "*research*"`, see `docs/implementation/00-repo-audit.md` header). Every market, willingness-to-pay, and competitive-intensity judgment below is explicitly marked unresearched. This document should be revisited the moment that research exists; do not treat it as validated product-market fit.

---

## 1. Candidates considered

| # | Candidate | Source |
|---|---|---|
| A | Vendor-bill intake → structured extraction → human review → approved, idempotent, verified draft-invoice creation in Odoo | PRD §5 default candidate, scoped down (see §3) |
| B | Spreadsheet reconciliation and exception reporting | PRD §5 option B |
| C | General document/data operations across common SaaS tools | PRD §5 option C — explicitly discouraged by the PRD itself ("too broad") |
| D | Read-only ERP "ask a question, get a grounded answer" (sales/receivables/inventory summaries) | What ~80% of the existing `src/server/agent` code already does today |

## 2. Scorecard (1–5, evidence + confidence noted; "N/A — unresearched" where no repo evidence exists)

| Factor | A: Invoice intake→Odoo draft | B: Spreadsheet reconciliation | D: Read-only ERP Q&A |
|---|---|---|---|
| Frequency/pain | N/A — unresearched (hypothesis only, per PRD §2) | N/A — unresearched | N/A — unresearched |
| Willingness to pay | N/A — unresearched | N/A — unresearched | N/A — unresearched |
| Ease of representative test data | 3 — can hand-author realistic vendor-bill text fixtures; no real customer data available | 2 — no spreadsheet connector or fixtures exist at all today | 4 — read tools already call live Odoo demo/sandbox data shapes |
| Deterministic verifiability | 4 — Odoo is a real source of truth; read-after-write on `account.move` gives an unambiguous postcondition | 4 — arithmetic match/mismatch is deterministic, but no connector exists to read either side | 2 — "is this answer correct" requires grounding checks against the same read tools, lower stakes, less to verify |
| Reversibility / risk | 4 — this slice only ever creates **draft** (unposted) invoices; Odoo drafts are deletable/editable before posting, so a mistake is recoverable before money moves | 5 — pure read/report, no writes at all | 5 — read-only |
| Integration cost | 3 — `Odoo19Connector` already implements authenticate/execute_kw/`createDraftInvoice`/read-back calls; needs hardening (idempotency, verification, schema validation), not a rewrite | 1 — nothing exists; would need a new Sheets/Excel connector from zero | 1 (already mostly done) — but doesn't exercise the hard runtime invariants (approval, idempotency, verification of a **write**) that are the point of WAKIL |
| Time to first value | 3 | 2 | 5 (already mostly built) but low value for proving the mission |
| Competitive intensity / platform risk | N/A — unresearched | N/A — unresearched | N/A — unresearched |
| Gross margin potential | N/A — unresearched | N/A — unresearched | N/A — unresearched |
| Fit with current code/assets | 4 — directly extends `IERPConnector`, `PolicyEngine`, `ERP_TOOLS` | 1 — zero existing code | 5 — already built, but see risk below |

### Counterfactual 1 — If WAKIL had no Odoo/ERP code, would the ERP wedge still win?
Unknown with confidence, because the willingness-to-pay/frequency/competitive rows are unresearched. What can be said from repo evidence alone: candidate A is the only option where "runtime owns execution, permissions, verification, idempotency, auditability" (the actual mission) can be demonstrated against a **real external system with real consequences**, rather than against the product's own SQLite-backed toy "forge" systems. Candidate B would need a connector built from nothing, which is a bigger first bet with zero code leverage and zero evidence it's wanted. This audit's answer is: **plausibly yes, but only because A is the cheapest way to prove the hard parts of the runtime, not because of validated demand** — the honest counterfactual answer requires the Deep Research report's wedge-comparison section, which does not exist yet.

### Counterfactual 2 — If all assets were equally cheap to rebuild, which wedge wins?
Cannot be answered without the missing research (pain/frequency/WTP data for reconciliation vs. invoice workflows in the target segment). **Flagged as an open research dependency**, not guessed.

## 3. Decision

**Chosen workflow for the first vertical slice: Candidate A, deliberately narrowed.**

> **"Vendor-bill request → validated structured fields → mandatory human approval → idempotent, verified draft-invoice creation in a connected Odoo instance."**

Narrowing applied, and why:
- **No OCR/image extraction in v0.** The PRD's default candidate starts from an arbitrary document (PDF/image). Building reliable document OCR + extraction is a separate, large, unvalidated problem (no labeled dataset, no OCR pipeline in the repo, no evidence it's needed vs. a structured form). v0 takes **plain text** input (operator pastes/uploads the bill's text, or fills a short structured form) and runs it through LLM extraction into a typed schema. This keeps the "extraction can be wrong / low-confidence → route to review" verification problem from the PRD (§12) without betting the whole slice on OCR quality, which is explicitly called out as unmeasured.
- **Only `createDraftInvoice`, never `post`/pay.** The connector and policy engine already model this as the one approval-gated write; posting/paying an invoice is a real financial action and stays out of scope (PRD §4 explicitly excludes "autonomous external payments... irreversible financial actions").
- **One tenant, one Odoo connection, one model provider** at a time, consistent with PRD §4 MVP scope.

### Why this beats the alternatives for *this* phase specifically
It is the only candidate that lets the next milestones exercise **every non-negotiable runtime invariant** from the brief — durable task/step state, typed tool validation, a real server-bound approval, an idempotency key on an actual external side effect, postcondition verification against a real source of truth (Odoo), and a truthful receipt — against code that already partially exists (`IERPConnector`, `Odoo19Connector`, `PolicyEngine`, `ERP_TOOLS`), rather than requiring a brand-new connector (B) or exercising only read paths that don't need approval/idempotency/verification at all (D).

It is explicitly **not** chosen because of validated market demand — that evidence does not exist yet (§0 of this doc). This is a build-the-runtime-safely bet, not a go-to-market bet. Say so to any stakeholder reading this.

## 4. Input/output contract (v0)

**Input** (operator-provided, one task per vendor bill):
- `tenantId`/`actorId` — derived server-side from the authenticated session, never client input (fixes the gap in §5.1 of the audit).
- `rawText` — the vendor bill content as plain text (≤ 8 KB).
- `targetCustomerId` — optional Odoo `res.partner` id if already known; otherwise the extraction step must propose a match and the human must confirm it (no silent fuzzy-match auto-selection).

**Output:**
- A `Task` in a terminal state (`succeeded`, `partially_succeeded`, `failed`, `cancelled`, or `expired` — never a silent `succeeded` without verification, per PRD §7/§12).
- On `succeeded`: the Odoo draft invoice id/number, confirmed by a read-after-write query against `account.move`.
- A receipt: extracted fields, the exact approved action (hash + params), the approval decision record, the verification evidence (the re-read Odoo record), and any unresolved issues.

## 5. Risk class and approval requirement

- Extraction and validation: **READ-equivalent / no approval** (no external side effect yet).
- `createDraftInvoice`: **DRAFT_WRITE, approval required** for every invocation regardless of amount in v0 (the existing `PolicyEngine` risk-tiers by amount for the *severity label* shown to the approver, but v0 requires human approval unconditionally — simpler and safer than tuning a dollar threshold with zero production data).

## 6. Measurable baseline (to be collected, not invented)

Per PRD §15, before claiming any time/cost saving: measure a human operator's manual time to read a vendor bill, find/create the matching Odoo customer, and create the draft invoice by hand, on the same fixture set used for the benchmark (`docs/implementation` benchmark, once built). **No such baseline exists yet — it must be measured, not assumed**, before any "X% faster" claim is made.

## 7. Assumptions (explicit, falsifiable)

1. A representative test Odoo 19 instance (sandbox, not production) will be available for integration testing and for the benchmark's postcondition checks. **Not yet confirmed — no live Odoo credentials exist in this environment.** Until then, all verification-layer code must be developed against a deterministic **fake connector** implementing `IERPConnector`, with a thin, separately-run integration suite reserved for a real sandbox when available (per the brief's "test without paid APIs or live business-system writes" instruction).
2. Vendor-bill text fixtures will be hand-authored (not customer data) for initial tests, clearly labeled synthetic, and not presented as production evidence (PRD §9/§19).
3. One human approver per tenant is sufficient for v0 (no multi-approver workflows, no delegation).

## 8. Kill / revisit criteria

- If, once a sandbox Odoo instance is available, `createDraftInvoice`'s read-after-write cannot reliably distinguish "created" from "ambiguous" (e.g., Odoo returns success but the record is not found on re-read within a bounded window), idempotency/verification for this exact operation needs a redesign before any further investment — do not paper over it with a longer timeout.
- If a completed Deep Research report later shows materially higher demand/willingness-to-pay for reconciliation (B) or another workflow, re-run this scorecard with real numbers before writing more invoice-specific code.
- If human review time for extraction corrections approaches or exceeds manual entry time in the eventual benchmark, this wedge fails PRD §17's "human review burden erases time savings" kill criterion.

## 9. Explicitly deferred

- Document OCR/image intake.
- Multi-tenant Odoo connection pooling / connection health dashboards.
- Any workflow beyond draft-invoice creation (purchase orders, reconciliation, etc.) until this slice passes its own acceptance tests.
