# WAKIL Accounting Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Continue `shaker15s/wakeel` into a persistent, Arabic/English accounting agent that uses allowlisted company-system tools through WAKIL’s harness, covers the accounting work packages below, and reports verified outcomes with evidence.

**Architecture:** Preserve the current Next.js/Prisma/Odoo product and extend its existing agent, tool registry, executor, and approval path. The server owns identity, workflow state, exact money calculations, memory scope, policies, approvals, idempotency, persistence, and verification; the model can only propose schema-validated calls to registered tools. Implement the foundation first, then financial reads and separately typed AP/AR, ledger, and reconciliation workflows, with deterministic fakes before any optional sandbox integration.

**Tech Stack:** Existing Next.js 16 App Router, TypeScript, Prisma 6/SQLite baseline, Zod 4, Vitest 2, existing Odoo connector and fake connector. Use the committed `bun.lock` and Bun when available; do not change provider, database, or add a model SDK until verified against current official documentation and the actual target environment.

**Spec:** [WAKIL_Accounting_Agent_Spec_v1.md](WAKIL_Accounting_Agent_Spec_v1.md)

## ملخص الخطة للمراجعة

الخطة تكمل المنتج الحالي ولا تستبدله. تبدأ بتأكيد حالة البناء والأمان، ثم توحّد chat/tools مع runtime وتضيف حفظ المهام والموافقات والذاكرة بشكل مستديم ومقيّد بالمستخدم والشركة. بعدها توسّع أدوات المحاسبة تدريجيًا: استعلامات وتقارير مبررة بالأدلة، فواتير موردين منفصلة عن فواتير العملاء، ثم الأستاذ والقيود والمطابقة والمصروفات والأصول والميزانيات.

كل حزمة لها Fake ERP واختبار محدد قبل ربطها بالواجهة. تغطية النظام الحي تظل مغلقة إلى أن تتوفر بيئة اختبار ومعلومات الإصدار والخطة والصلاحيات. في نهاية التنفيذ تُختبر تجربة صاحب العمل على 30 حالة متميزة على الأقل، وتُعرض نتائج fake وsandbox وmodel الحقيقي بشكل منفصل. لا merge أو deploy أو write حقيقي.

الخطة طويلة لأنها تقسّم الأنظمة المحاسبية المستقلة إلى مهام قابلة للمراجعة؛ التنفيذ يمشي بالترتيب ولا يبدأ الأدوات اللاحقة قبل اكتمال أسس التخزين والـHarness.

## Global Constraints

- Work on a review branch based on the live `main` tip; preserve the current product and database data.
- Create the isolated feature worktree from `origin/main` via `superpowers:using-git-worktrees`; create `codex/wakil-accounting-agent` only if it does not already exist, and never reset an existing branch.
- Make one focused commit for each independently passing task; push the feature branch and open a review PR after the completed work is reviewed. Do not merge it.
- No production ERP writes, payments, invoice posting, tax filing, deployment, or secret changes.
- Never treat model output, document content, client-supplied IDs, or memory as authorization.
- Unknown tools, unknown accounting semantics, missing capabilities, uncertain writes, and unsupported tax/currency cases fail closed or require human review.
- Separate customer invoices (`out_invoice`) from vendor bills (`in_invoice`) in schemas, workflow types, tool names, UI, and tests; never reinterpret the legacy payload silently.
- Use decimal-safe money and configured currency precision; never use binary floating-point totals for financial decisions or verification.
- Keep the current Odoo API route only if it matches the target Odoo version, plan, and permissions; otherwise leave live integration gated.
- Keep demo/fake ERP paths clearly labeled and isolated from live connectors.
- Memory is tenant/operator-scoped, inspectable, editable, and deletable; business rules and permissions are never learned implicitly.
- Report test sample sizes and separate unit/fake, sandbox, and live-provider evidence.

## Review Focus

1. Prompt injection embedded in user text, invoice text, and ERP tool results: must not add tools or bypass validation (Task 2 and Task 4 tests).
2. Cross-account/operator IDs and stale/missing sessions: must deny reads, memory access, approvals, and writes (Task 3 and Task 4 tests).
3. Decimal rounding, foreign currency precision, tax gaps, and missing dates: must calculate from configured rules or route to review (Task 5 and Task 6 tests).
4. Concurrent/replayed approvals and timeouts after a side effect: must not create duplicate records or report an unverified success (Task 3 and Task 6 tests).
5. Old `create_draft_invoice` data and APIs: must retain customer-invoice meaning while a new vendor-bill workflow uses vendor semantics (Task 6 compatibility tests).

---

## Work packages and dependency order

The implementation is split into independently reviewable packages in one program:

1. **Foundation:** working-tree baseline, schema-validated tool registry, durable task/approval/audit storage, authenticated conversation loop, manageable memory.
2. **Accountant v1:** grounded accounting reads and reports, supplier/customer bills as separate draft workflows, business-owner scenarios and approval UI.
3. **Accounting expansion:** ledger/journal workflows, bank reconciliation, expense/assets/budget features, each enabled only when the connected ERP reports the required capability and configuration.

If a target ERP/API or company accounting policy cannot be established from safe fixtures, the relevant operation stays unavailable or review-required. Do not hardcode a jurisdiction, tax rate, chart of accounts, or target Odoo plan.

## Task 1: Re-establish the live repository baseline

**Files:**
- Modify: `docs/implementation/00-repo-audit.md`
- Modify: `docs/implementation/05-final-report.md` only if needed to clearly mark its historical date/scope
- Create: `.github/workflows/ci.yml` if the live branch lacks a workflow
- Test: existing project test suite and package scripts

**Interfaces:**
- Consumes: live `main`, its `bun.lock`, prior audit/report, and current environment.
- Produces: a dated baseline audit, exact commands and outcomes, and a CI workflow that uses the repository’s actual lockfile/toolchain.

- [ ] **Step 1: Verify repo and toolchain before install.** Record branch, commit, clean/dirty status, Bun/Node versions, tracked database files, migrations, CI files, environment variable names only, and any repository instruction files.
- [ ] **Step 2: Run dependency installation without changing the lockfile.** Run `bun install --frozen-lockfile` from repo root. If Bun cannot install from the committed lock, stop and record the failure before trying a different package manager.
- [ ] **Step 3: Record the baseline checks.** Run `bun run test`, `bunx tsc --noEmit -p tsconfig.json`, `bun run lint`, `bun run eval:report`, and `bun run build`; record exit codes and environmental blockers in the audit. Do not call a blocked check a pass.
- [ ] **Step 4: Add/repair CI after confirming the baseline.** Ensure pull requests run typecheck and all deterministic tests; keep lint visible and fix existing blockers or mark the job clearly non-blocking with reasons. Use Bun and frozen lockfile when CI supports the committed Bun version.
- [ ] **Step 5: Verify CI configuration and repository state.** Run the available workflow/YAML validation and rerun any project checks touched by CI changes.
- [ ] **Step 6: Commit the baseline/CI result.** Run `git add docs/implementation/00-repo-audit.md docs/implementation/05-final-report.md .github/workflows/ci.yml` (omit paths that did not change), then `git commit -m "chore: re-establish accounting agent baseline"`.

## Task 2: Typed, deny-by-default finance tool registry

**Files:**
- Create: `src/server/agent/tool-registry.ts`
- Modify: `src/server/agent/tools.ts`
- Modify: `src/server/policy/engine.ts`
- Test: `tests/agent/tool-registry.test.ts`
- Test: `tests/policy/engine.test.ts`

**Interfaces:**
- Consumes: existing `IERPConnector`, `PolicyEngine`, current `ERP_TOOLS` definitions.
- Produces: `FinanceTool<TInput, TOutput>` with `{ name, domain, description, riskClass, inputSchema, requiredCapability, execute(ctx,input) }`; `resolveFinanceTool(name): FinanceTool | null`; `executeFinanceTool(ctx,name,unknownInput): Promise<ToolExecutionResult>`.
- `ToolExecutionResult` distinguishes `{ status: 'succeeded'; data; evidence }`, `{ status: 'approval_required'; approval }`, `{ status: 'review_required'; reason }`, and `{ status: 'denied'; reason }`.

- [ ] **Step 1: Write registry tests.** Assert every registered tool has a unique name, Zod input schema, risk class and handler; unknown names return `denied`; malformed arguments and unavailable capabilities never call the connector; READ tools cannot dispatch a write.
- [ ] **Step 2: Run `bunx vitest run tests/agent/tool-registry.test.ts tests/policy/engine.test.ts` and confirm failure.**
- [ ] **Step 3: Implement the typed registry and explicit dispatcher.** Replace the legacy implicit switch fallthrough; parse every model argument with the tool’s Zod schema and evaluate server policy immediately before execution.
- [ ] **Step 4: Run the focused tests and typecheck.** Confirm malformed and unknown calls produce no connector call.
- [ ] **Step 5: Commit the registry change.** Run `git add src/server/agent/tool-registry.ts src/server/agent/tools.ts src/server/policy/engine.ts tests/agent/tool-registry.test.ts tests/policy/engine.test.ts`, then `git commit -m "feat: add typed deny-by-default finance tools"`.

## Task 3: Prisma-backed task, step, approval, idempotency, and event store

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<generated timestamp>_accounting_runtime/migration.sql`
- Create: `src/server/runtime/prisma-store.ts`
- Modify: `src/server/runtime/types.ts`
- Modify: `src/lib/db.ts`
- Test: `tests/runtime/prisma-store.test.ts`
- Test: `tests/runtime/store-restart.test.ts`
- Test: `tests/database-runtime-build.sh` if it is the established database integration harness

**Interfaces:**
- Consumes: existing `TaskStore` types and `PrismaClient` singleton.
- Produces: `PrismaTaskStore implements TaskStore`; all reads/updates that concern a task, step, approval, event, or idempotency record accept `tenantId` and enforce it in the database query.
- Tenant-scoped signatures: `getTask(tenantId, taskId)`, `updateTask(tenantId, taskId, patch)`, `createStep(tenantId, step)`, `getStep(tenantId, taskId, stepId)`, `listSteps(tenantId, taskId)`, `updateStep(tenantId, taskId, stepId, patch)`, `appendEvent(tenantId, event)`, `listEvents(tenantId, taskId)`, and every approval/idempotency lookup or mutation with `tenantId` as the first argument. Creation validates parent ownership.
- Add atomic `decideApproval(tenantId, approvalId, decision, decidedBy, reason?)`, with pending-status compare-and-set and a transactionally appended event.

- [x] **Step 1: Write failing persistence tests.** Cover task/step/event round-trip, tenant-filtered reads/updates (including steps/events/idempotency), duplicate idempotency uniqueness, approval compare-and-set race, and restart by opening a second Prisma store/client on the same disposable DB.
- [x] **Step 2: Generate a migration without applying it to user data.** Run `bunx prisma migrate dev --name accounting_runtime --create-only` with `DATABASE_URL` pointing at a disposable SQLite file and confirm the generated SQL; never use `prisma db push --accept-data-loss` or touch an existing user DB.
- [x] **Step 3: Implement models and store methods.** Store typed JSON payloads as serialized fields compatible with current SQLite; define unique constraints for `(tenantId, toolName, idempotencyKey)`, `(taskId, sequence)`, and approval/event ordering.
- [x] **Step 4: Make transitions atomic.** Implement approval compare-and-set and tenant-scoped state updates inside Prisma transactions. Keep redaction at the persistence boundary.
- [x] **Step 5: Run database/runtime tests and migration checks.** Run `bunx prisma migrate deploy` against the disposable database, then `bunx vitest run tests/runtime/prisma-store.test.ts tests/runtime/store-restart.test.ts`; confirm a recreated process reads the same state and cross-tenant IDs remain inaccessible.
- [x] **Step 6: Commit the persistence change.** Run `git add` for the scoped persistence files and migration, then commit as `feat: persist tenant-scoped accounting tasks`.

## Task 4: Conversation orchestration, model adapter, and injection boundaries

**Files:**
- Create: `src/server/agent/model-provider.ts`
- Create: `src/server/agent/conversation-runtime.ts`
- Modify: `src/lib/wakeel/ai.ts`
- Modify: `src/server/agent/runtime.ts`
- Modify: `src/server/agent/tool-registry.ts`
- Test: `tests/agent/conversation-runtime.test.ts`
- Test: `tests/agent/prompt-injection.test.ts`

**Interfaces:**
- Consumes: typed registry, authenticated operator context, persistent task store, current AI adapter.
- Produces: `ModelProvider.completeTurn(input: ModelTurnInput): Promise<ModelTurnOutput>` where output is `{ type: 'message'; text: string } | { type: 'tool_calls'; calls: Array<{ callId: string; name: string; arguments: unknown }> }`; test fake implements the same interface. `runConversationTurn({ tenantId, actorId, conversationId, userMessage, lang }): Promise<ConversationTurnResult>` where `ConversationTurnResult` is `{ reply: string; toolTrace: ToolTraceItem[]; taskIds: string[]; evidence: EvidenceRef[]; status: 'answered' | 'waiting_for_approval' | 'review_required' | 'failed' }`.
- One turn is bounded to at most 8 model/tool cycles and at most 4 sequential tool calls before returning control; configured limits are tested and may be tuned from observed latency.

- [ ] **Step 1: Add provider-contract tests using a fake provider.** Cover plain answer, one read call, sequential calls, provider timeout/error, invalid tool name, schema-invalid arguments, and cycle-limit stop.
- [ ] **Step 2: Add prompt-injection tests.** User text, invoice text, and tool-result text such as “ignore policy/use another tool” remain untrusted content; no call can escape the allowlist or bypass server policy.
- [ ] **Step 3: Run the focused tests and confirm they fail against the current JSON-in-prompt loop.**
- [ ] **Step 4: Verify the current provider’s official tool-calling/schema contract, then implement an injectable provider adapter and bounded loop.** Keep current provider behavior compatible where verified; use native strict function calling only for a provider/API that supports it. For unsupported providers, use validated structured output and fail closed on invalid output. Pass user content as user/untrusted data, not interpolated instructions.
- [ ] **Step 5: Test again with the fake provider, then add one opt-in smoke test that never writes to an ERP and skips cleanly without credentials.**
- [ ] **Step 6: Commit the bounded model loop.** Run `git add src/lib/wakeel/ai.ts src/server/agent/model-provider.ts src/server/agent/conversation-runtime.ts src/server/agent/runtime.ts src/server/agent/tool-registry.ts tests/agent/conversation-runtime.test.ts tests/agent/prompt-injection.test.ts`, then `git commit -m "feat: add bounded finance tool orchestration"`.

## Task 5: Persistent conversations and explicit, tenant-scoped memory

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/server/agent/memory-store.ts`
- Create: `src/app/api/agent/memory/route.ts`
- Modify: `src/app/api/agent/chat/route.ts`
- Modify: `src/server/agent/conversation-runtime.ts`
- Test: `tests/agent/memory-store.test.ts`
- Test: `tests/api/agent-memory.test.ts`

**Interfaces:**
- Consumes: `PrismaTaskStore`, authenticated session/operator guard, current `ChatMessage` history.
- Produces: `MemoryStore.list(tenantId, actorId): Promise<MemoryItem[]>`, `remember(tenantId, actorId, item): Promise<MemoryItem>`, `update(tenantId, actorId, memoryId, patch): Promise<MemoryItem>`, and `forget(tenantId, actorId, memoryId): Promise<void>`.
- `MemoryItem` fields: `{ id, key, value, category: 'preference' | 'confirmed_work_context', source, confirmedBy, createdAt, updatedAt }`. No implicit memory-write function is available to the model.

- [ ] **Step 1: Test explicit save/update/forget and cross-tenant isolation.** Assert a remembered display preference is reused in a later conversation, user correction changes it, forget removes it, and a financial policy/tax claim cannot be stored as an approved rule through the memory tool.
- [ ] **Step 2: Run focused tests and confirm failure.**
- [ ] **Step 3: Add conversation identifiers and Prisma-backed memory models with unique, scoped lookups.** Preserve existing history where safe; do not delete or rewrite old messages as part of migration.
- [ ] **Step 4: Add authenticated list/update/delete APIs and explicit “remember this” UX/action.** The server derives account/operator identity; the model can suggest a memory but cannot persist it without explicit user intent.
- [ ] **Step 5: Run API/database tests including cross-account access and ensure redaction/retention rules apply.**
- [ ] **Step 6: Commit conversation and memory support.** Run `git add prisma/schema.prisma src/server/agent/memory-store.ts src/app/api/agent/memory/route.ts src/app/api/agent/chat/route.ts src/server/agent/conversation-runtime.ts tests/agent/memory-store.test.ts tests/api/agent-memory.test.ts`, then `git commit -m "feat: persist scoped accountant memory"`.

## Task 6: Decimal-safe accounting contracts and Odoo mapping

**Files:**
- Create: `src/server/accounting/money.ts`
- Create: `src/server/accounting/types.ts`
- Modify: `src/server/erp/contract.ts`
- Modify: `src/server/erp/fake-connector.ts`
- Modify: `src/server/erp/odoo-connector.ts`
- Modify: `src/server/runtime/workflows/create-draft-invoice.ts`
- Test: `tests/accounting/money.test.ts`
- Test: `tests/erp/odoo-accounting-contract.test.ts`

**Interfaces:**
- Consumes: existing ERP connector and runtime workflow types.
- Produces: `Money = { amount: string; currency: string; scale: number }`; `MoneyMath.add(a: Money, b: Money): Money`, `subtract(a: Money, b: Money): Money`, `multiply(a: Money, quantity: string, resultScale: number): Money`, `compare(a: Money, b: Money): -1 | 0 | 1`; and canonical accounting entities with explicit `documentKind: 'customer_invoice' | 'vendor_bill'`.
- Connector outputs return decimal strings (not JS `number`) for financial amounts. Odoo payload mapping is explicit and covered by fake HTTP requests.

- [ ] **Step 1: Write decimal tests.** Assert `0.1 + 0.2 = 0.3`, line quantity multiplication, exact debit/credit equality, rounding at configured currency scale, and refusal for invalid/unknown currency scale.
- [ ] **Step 2: Write semantic mapping tests.** Assert customer invoice maps to `out_invoice`, vendor bill maps to `in_invoice`, and a missing partner role or move type is review-required.
- [ ] **Step 3: Run tests to establish failure on existing floating-point/customer-only paths.**
- [ ] **Step 4: Implement decimal string arithmetic and domain types.** Use integer coefficients with `BigInt` and explicit scale; do not add a dependency unless the tests demonstrate the implementation would be unsafe or unmaintainable.
- [ ] **Step 5: Update fake and Odoo connector boundaries and run relevant runtime/ERP tests.** Preserve the legacy customer invoice contract until an explicit compatibility adapter/test proves callers are migrated.
- [ ] **Step 6: Commit money and document contracts.** Run `git add src/server/accounting/money.ts src/server/accounting/types.ts src/server/erp/contract.ts src/server/erp/fake-connector.ts src/server/erp/odoo-connector.ts src/server/runtime/workflows/create-draft-invoice.ts tests/accounting/money.test.ts tests/erp/odoo-accounting-contract.test.ts`, then `git commit -m "feat: model accounting values and document kinds exactly"`.

## Task 7: Grounded read-only accounting tools and report evidence

**Files:**
- Modify: `src/server/erp/contract.ts`
- Modify: `src/server/erp/fake-connector.ts`
- Modify: `src/server/erp/odoo-connector.ts`
- Create: `src/server/accounting/read-tools.ts`
- Modify: `src/server/agent/tool-registry.ts`
- Test: `tests/accounting/read-tools.test.ts`
- Test: `tests/erp/odoo-read-tools.test.ts`

**Interfaces:**
- Consumes: decimal money contracts, connector capability report, typed registry.
- Produces: read operations `get_chart_of_accounts`, `get_trial_balance({ dateFrom, dateTo, companyId? })`, `get_account_activity({ accountId, dateFrom, dateTo })`, `get_aged_balances({ kind: 'payable' | 'receivable', asOf })`, and `get_financial_statement({ kind: 'profit_and_loss' | 'balance_sheet' | 'cash_flow', dateFrom, dateTo, currency? })`.
- Each output includes `{ sourceSystem, sourceRef?, readAt, period, currency, calculationVersion, warnings[] }` and the rows/totals needed to reproduce the displayed aggregate.

- [ ] **Step 1: Create deterministic fixture tests.** Assert known trial balance totals, debit/credit balance, P&L/BS rollups, aging buckets, dates, currency grouping, and errors for missing report configuration.
- [ ] **Step 2: Run tests against the fake connector and confirm failure.**
- [ ] **Step 3: Implement canonical read methods in the fake connector and register each read tool with required capabilities.** No generic model/domain query is exposed to the model.
- [ ] **Step 4: Add an Odoo adapter for only fields/models verified in current official docs and connector schemas.** Use mocked HTTP/JSON-RPC responses first; do not call a real tenant. Keep operation unavailable when API/permissions are unknown.
- [ ] **Step 5: Verify all reports with deterministic expected outputs and expose evidence metadata to the answer renderer.**
- [ ] **Step 6: Commit the grounded read tools.** Run `git add src/server/erp/contract.ts src/server/erp/fake-connector.ts src/server/erp/odoo-connector.ts src/server/accounting/read-tools.ts src/server/agent/tool-registry.ts tests/accounting/read-tools.test.ts tests/erp/odoo-read-tools.test.ts`, then `git commit -m "feat: add evidence-backed accounting queries"`.

## Task 8: Separate vendor-bill and customer-invoice draft workflows

**Files:**
- Create: `src/server/runtime/workflows/create-draft-vendor-bill.ts`
- Create: `src/app/api/agent/tasks/route.ts`
- Create: `src/app/api/agent/tasks/[taskId]/route.ts`
- Create: `src/app/api/agent/tasks/[taskId]/approval/route.ts`
- Create: `src/app/api/agent/tasks/[taskId]/cancel/route.ts`
- Modify: `src/server/runtime/workflows/create-draft-invoice.ts` for explicit customer semantics/compatibility
- Modify: `src/server/runtime/types.ts`
- Modify: `src/server/runtime/executor.ts`
- Modify: `src/server/erp/contract.ts`
- Modify: `src/server/erp/fake-connector.ts`
- Modify: `src/server/erp/odoo-connector.ts`
- Modify: `src/app/api/agent/chat/route.ts` to hand off approved task creation to the persistent runtime
- Test: `tests/runtime/create-draft-vendor-bill.test.ts`
- Test: `tests/runtime/create-draft-customer-invoice.test.ts`

**Interfaces:**
- Consumes: decimal-safe types, persisted `TaskStore`, capability-aware registry, `PolicyEngine`.
- Produces: independent `create_draft_vendor_bill` and `create_draft_customer_invoice` workflows; both require exact normalized approval, tenant/actor binding, idempotency key, and read-after-write verification.
- A `DraftDocumentReceipt` identifies document type, ERP record ID, partner role, currency, verified totals, approved action hash, verification source and unresolved issues.

- [ ] **Step 1: Test vendor/customer payloads.** Assert valid draft bill uses a vendor partner and incoming-bill move type; customer invoice retains customer partner and outgoing-invoice type; neither workflow can cross-call.
- [ ] **Step 2: Test money/document validation.** Missing tax setup, unknown currency, supplier mismatch, duplicate document reference, malformed amounts, and embedded prompt instructions must create no ERP record and return `review_required`/validation error.
- [ ] **Step 3: Test approval binding, replay, race, retry and crash-after-write on each workflow.** Assert one side effect maximum and no “succeeded” before all required fields verify.
- [ ] **Step 4: Implement two workflow definitions using shared primitives only where semantics match.** Keep posting, payment and delete tools unregistered.
- [ ] **Step 5: Add authenticated Task API routes.** `POST /api/agent/tasks` creates/advances a task; `GET /api/agent/tasks/[taskId]` reads a tenant-scoped task and receipt; `POST /approval` decides the exact pending action; `POST /cancel` uses safe cancellation semantics. Resolve tenant/operator only through the session guard.
- [ ] **Step 6: Test chat-to-task-to-approval-to-receipt with FakeERPConnector.** Include tenant spoofing, expired/tampered approval, rejected approval, duplicate replay, and restart recovery.
- [ ] **Step 7: Run runtime/evaluation tests; document which real Odoo checks remain unverified.**
- [ ] **Step 8: Commit the distinct AP/AR workflows.** Run `git add src/server/runtime/workflows/create-draft-vendor-bill.ts src/server/runtime/workflows/create-draft-invoice.ts src/server/runtime/types.ts src/server/runtime/executor.ts src/server/erp/contract.ts src/server/erp/fake-connector.ts src/server/erp/odoo-connector.ts src/app/api/agent/tasks src/app/api/agent/chat/route.ts tests/runtime/create-draft-vendor-bill.test.ts tests/runtime/create-draft-customer-invoice.test.ts`, then `git commit -m "feat: separate draft vendor bills from customer invoices"`.

## Task 9: General ledger, journal drafts, and reconciliation proposals

**Files:**
- Create: `src/server/accounting/journal-entry.ts`
- Create: `src/server/accounting/reconciliation.ts`
- Create: `src/server/runtime/workflows/create-draft-journal-entry.ts`
- Modify: `src/server/erp/contract.ts`
- Modify: `src/server/erp/fake-connector.ts`
- Modify: `src/server/erp/odoo-connector.ts`
- Modify: `src/server/agent/tool-registry.ts`
- Test: `tests/accounting/journal-entry.test.ts`
- Test: `tests/accounting/reconciliation.test.ts`

**Interfaces:**
- Consumes: exact money, configured chart of accounts, capability-driven tools, persistent task/approval store.
- Produces: `BankStatementLine = { id: string; date: string; amount: Money; description: string; reference: string | null }`, `MatchProposal = { statementLineId: string; candidateRecordId: string; scoreFactors: string[]; amountDifference: Money; status: 'proposed' | 'review_required' }`, `proposeBankMatches(statementLines: BankStatementLine[], ledgerItems: AccountingMatchCandidate[], policy: ReconciliationPolicy): MatchProposal[]` (read-only), and `create_draft_journal_entry` with debits/credits represented as `Money` and exact balance checks.
- Matching produces evidence and confidence factors, never mutates or reconciles a bank line by itself.

- [ ] **Step 1: Test double-entry invariants.** Every journal must have at least two valid lines, configured account references, matching currency rules, and exact debits equal credits; no post/commit call is possible.
- [ ] **Step 2: Test matching edge cases.** Exact and near matches, duplicate statement lines, timezone/date differences, foreign currency, and missing references yield ranked proposals or review-required, not a mutation.
- [ ] **Step 3: Run the new tests and confirm they fail.**
- [ ] **Step 4: Implement draft journal and read-only match proposal tools with strict risk policy.** Any future reconciliation write is a distinct, approval-gated workflow.
- [ ] **Step 5: Verify the fake connector and mocked Odoo adapter, then update the capability matrix.**
- [ ] **Step 6: Commit ledger and reconciliation proposals.** Run `git add src/server/accounting/journal-entry.ts src/server/accounting/reconciliation.ts src/server/runtime/workflows/create-draft-journal-entry.ts src/server/erp/contract.ts src/server/erp/fake-connector.ts src/server/erp/odoo-connector.ts src/server/agent/tool-registry.ts tests/accounting/journal-entry.test.ts tests/accounting/reconciliation.test.ts`, then `git commit -m "feat: add governed ledger and bank proposals"`.

## Task 10: Expenses, fixed assets, budgets, and close assistance

**Files:**
- Create: `src/server/accounting/expenses.ts`
- Create: `src/server/accounting/fixed-assets.ts`
- Create: `src/server/accounting/budgets.ts`
- Modify: `src/server/erp/contract.ts`
- Modify: `src/server/erp/fake-connector.ts`
- Modify: `src/server/erp/odoo-connector.ts`
- Modify: `src/server/agent/tool-registry.ts`
- Test: `tests/accounting/expenses.test.ts`
- Test: `tests/accounting/fixed-assets.test.ts`
- Test: `tests/accounting/budgets.test.ts`

**Interfaces:**
- Consumes: configured company accounting policy, exact money, runtime approvals, ERP capabilities.
- Produces: `assessExpense(input: ExpenseInput, policy: ExpensePolicy): ExpenseAssessment`, `calculateAssetSchedule(input: AssetInput, policy: AssetPolicy): AssetSchedule | ReviewRequired`, and `calculateBudgetVariance(actual: Money, budget: Money, context: BudgetContext): BudgetVariance`; read/proposal operations for expense classification, asset schedules, budget variance and period-close checklists; draft operations only where the connector exposes an explicit method and required policy is configured.

- [ ] **Step 1: Write fixtures and tests for missing receipt, invalid period, unsupported depreciation/tax rule, budget variance, and currency mismatch.** Each unknown rule must be review-required.
- [ ] **Step 2: Add feature-specific fake connector methods and typed tools.** Do not infer accounting policy from model output or chat memory.
- [ ] **Step 3: Add optional approval-gated draft entry operations only when the corresponding schema/capability is confirmed.**
- [ ] **Step 4: Verify deterministic schedules/variance outputs and the unavailable-capability path.**
- [ ] **Step 5: Commit the accounting extensions.** Run `git add src/server/accounting/expenses.ts src/server/accounting/fixed-assets.ts src/server/accounting/budgets.ts src/server/erp/contract.ts src/server/erp/fake-connector.ts src/server/erp/odoo-connector.ts src/server/agent/tool-registry.ts tests/accounting/expenses.test.ts tests/accounting/fixed-assets.test.ts tests/accounting/budgets.test.ts`, then `git commit -m "feat: add governed expense and asset support"`.

## Task 11: Accountant workspace UI and approval receipt

**Files:**
- Modify: `src/components/app/console/views/assistant-view.tsx`
- Modify: `src/components/app/console/agent-dock.tsx`
- Modify: `src/components/app/console/views/activity.tsx`
- Create: `src/components/app/console/views/accounting-workspace.tsx` only if current layout cannot cleanly host it
- Modify: `src/lib/i18n.ts`
- Modify: `src/app/globals.css` only for existing design-system tokens and RTL/LTR behavior
- Test: component/API tests matching current test conventions; visual verification via local browser

**Interfaces:**
- Consumes: conversation/task APIs, evidence receipts, approval decisions, memory APIs.
- Produces: Arabic RTL/English LTR accounting chat, current task state and tool timeline, evidence-linked financial answer, exact approval card, inspect/manage memory, and distinct success/review/unknown/failure states.

- [ ] **Step 1: Map the current UI and design tokens, then define component-level tests for answer evidence, approval payload, review-required, and memory states.**
- [ ] **Step 2: Run those tests and confirm failure.**
- [ ] **Step 3: Implement UI against existing components and i18n.** Use the Superdesign CLI preflight/design workflow only after implementation is authorized; keep motion restrained and accessible.
- [ ] **Step 4: Verify keyboard navigation, focus, reduced motion, RTL/LTR, responsive layouts, currency/ID isolation, and every workflow state in a browser.**
- [ ] **Step 5: Commit the accountant workspace.** Run `git add src/components/app/console/views/assistant-view.tsx src/components/app/console/views/activity.tsx src/components/app/console/views/accounting-workspace.tsx src/components/app/console/agent-dock.tsx src/lib/i18n.ts src/app/globals.css`, omitting `accounting-workspace.tsx` if the existing layout was extended instead, then `git commit -m "feat: add accounting workspace and approval receipts"`.

## Task 12: Multi-turn business-owner evaluation and release evidence

**Files:**
- Modify: `src/server/eval/scenarios.ts`
- Modify: `scripts/eval-report.ts`
- Modify: `tests/eval/suite.test.ts`
- Create: `tests/agent/business-owner-scenarios.test.ts`
- Modify: `docs/implementation/04-evaluation-report.md`
- Create: `docs/implementation/06-accounting-agent-report.md`
- Modify: `docs/10-security-threat-model.md`

**Interfaces:**
- Consumes: fake model provider, synthetic business fixture, fake ERP, accounting tool registry, persistent-store integration harness.
- Produces: versioned report with scenario-level pass/fail, ground-truth evidence, tool calls, write count, memory reads/writes, receipt completeness, latency and cost (N/A for fakes).

- [ ] **Step 1: Build a diverse scenario set before implementation.** At minimum cover owner onboarding/preferences, follow-up questions, trial balance/report, AP and AR difference, duplicate vendor bill, arithmetic/tax/currency exceptions, explicit remember/change/forget, injected instruction, denied approval, tampered approval, cross-tenant request, replay/timeout, journal balance, reconciliation suggestion, expense/asset/budget unknown policy.
- [ ] **Step 2: Require meaningful, independently asserted expected outcomes.** Use synthetic records; do not clone cases to inflate sample size. Make math/source-state assertions deterministic and model text assertions rubric-bounded.
- [ ] **Step 3: Run the suite and report failures honestly.** Target at least 30 distinct cases before claiming the initial benchmark is broad; no claim of zero universal error from this sample.
- [ ] **Step 4: Run a separate synthetic-data provider evaluation only if explicitly approved.** Use a read-only test command gated behind `WAKEEL_LIVE_EVAL=1`; report provider/model/version, sample count, latency and actual available cost data. If credentials are absent, terms are unclear, or an API charge is not approved, skip and report that limitation; never pass real company documents.
- [ ] **Step 5: Run full tests, typecheck, lint, build, migration/restart integration, and browser workflow checks.** Compare with Task 1 baseline and note all remaining limitations.
- [ ] **Step 6: Run code/security review on the final branch and fix critical/high findings before opening the PR.**
- [ ] **Step 7: Commit evaluation and final evidence.** Run `git add src/server/eval/scenarios.ts scripts/eval-report.ts tests/eval/suite.test.ts tests/agent/business-owner-scenarios.test.ts docs/implementation/04-evaluation-report.md docs/implementation/06-accounting-agent-report.md docs/10-security-threat-model.md`, then `git commit -m "test: evaluate accountant tasks and security invariants"`.

## Completion gates

- Foundation work is complete only when persistence survives restart, every method is tenant-scoped, explicit memory can be recalled/updated/forgotten, and the live chat uses the same bounded typed runtime being tested.
- Accountant v1 is complete only when accounting reads are grounded to ERP fixtures, AP/AR semantics are separate, exact money and approval invariants pass, and the multi-turn owner evaluation is versioned.
- Each expansion package is complete only when its own fake tests and evidence pass; unavailable target-ERP capabilities remain disabled until sandbox verification.
- This plan does not authorize production writes, migration against a live database, real credentials, deployment, merge, or payment/posting actions.

