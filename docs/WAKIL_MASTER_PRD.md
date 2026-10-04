# WAKIL — Model-Agnostic AI Employee Runtime
## Master Product Requirements Document (PRD)

**Status:** Working strategy / hypotheses to validate  
**Date:** 2026-10-04  
**Repository:** https://github.com/shaker15s/wakeel

> This document is a build and decision brief, not evidence that the product-market fit, reliability targets, or architecture have already been validated. Anything marked *hypothesis* must be tested. Inspect the current repository before implementation; preserve useful working code and avoid a greenfield rewrite by default.

## 1. Executive thesis

WAKIL aims to be a runtime that turns model capability into dependable, auditable work. It is not merely a chat interface, a prompt wrapper, a generic multi-agent framework, or a browser-clicking agent.

The product promise: **give WAKIL a bounded business task; it plans, uses authorized tools, persists progress, verifies the result, recovers from transient failures where safe, asks for approval when required, and produces an evidence-backed receipt.**

The model is replaceable. The runtime owns execution state, permissions, tool contracts, idempotency, verification, recovery, and auditability.

### Initial decision posture
**GO WITH A NARROWED WEDGE, subject to kill tests.** Do not attempt to automate every back-office workflow on day one. Start with a measurable, reversible workflow where data and expected outcomes are available for testing. A promising candidate is invoice/document-to-structured-record processing with human review and a controlled write to an existing business system. The exact first vertical must be selected after repo inspection, customer discovery, and comparative experiments—not because existing Odoo assets automatically dictate the market.

## 2. Problem and target customer

### Problem
Small and midsize businesses repeat structured administrative work across documents, spreadsheets, email, and ERP/CRM systems. Generic LLMs can reason and draft, but reliable execution requires integration, durable state, permission enforcement, duplicate prevention, verification, exception handling, and traceable evidence.

### Initial ideal customer profile (hypothesis)
A small operations or finance team that:
- processes a recurring, bounded volume of invoices, purchase documents, order records, or spreadsheet updates;
- has a clear current-state workflow and a human who can verify outcomes;
- can provide representative, permissioned test cases;
- can tolerate human approval for consequential writes;
- experiences measurable time, error, or backlog costs.

Avoid initially targeting workflows where an error can silently cause large financial, legal, safety, or irreversible consequences.

## 3. Product principles

1. **Runtime over model:** business-critical guarantees belong in deterministic code, not prompts.
2. **Evidence over self-report:** success is determined by observed postconditions, not the model saying “done.”
3. **Least privilege:** every tool call is scoped by tenant, actor, task, resource, and allowed operation.
4. **Approval is a server-enforced gate:** the model cannot approve its own action or bypass a pending approval.
5. **Durable execution:** task state and step outcomes survive process restarts and worker retries.
6. **Idempotent writes:** retries must not create duplicate business effects.
7. **Explicit uncertainty:** ambiguous inputs or unverifiable outcomes must become review-required, not silently guessed.
8. **Model portability:** providers implement a common adapter contract; provider-specific capabilities remain explicit.
9. **Human control:** pause, cancel, review, retry, and inspect must be first-class operations.
10. **No fake autonomy:** browser/computer use is a last-resort adapter, not the foundation of correctness.
11. **Tenant isolation:** authorization is checked server-side on every read and write.
12. **Incremental migration:** reuse existing code only after tests and threat review; do not preserve weak architecture merely because it exists.

## 4. Scope

### MVP must include
- Task creation with a typed goal, tenant, actor, input references, risk class, and deadline/budget limits.
- Durable task and step state with explicit state transitions.
- Model-provider adapter and at least one supported provider; a second adapter or deterministic fake provider for portability tests.
- Typed tool registry with schemas, validation, authorization, timeout, and normalized errors.
- Policy decision before every tool execution, not just at task creation.
- Approval requests for designated actions, with identity, scope, expiry, and immutable decision record.
- Idempotency keys and deduplication for side-effecting operations.
- Precondition and postcondition verification for writes.
- Bounded retries with backoff and classified transient/permanent failures.
- Pause/resume/cancel and safe handling of interrupted tasks.
- Append-only task event/audit trail and a task receipt linking claims to evidence.
- Human review queue for low-confidence or failed verification.
- Evaluation harness with a fixed, versioned task set and machine-checkable outcomes.
- Basic metrics: verified success, first-pass success, policy denials, approval rate, duplicate prevention, retries, latency, cost, review rate, and failure categories.
- Redacted structured logs; secrets never enter prompts or receipts.

### Explicitly out of scope for MVP
- Fully autonomous general-purpose employee across arbitrary websites.
- Unrestricted shell, arbitrary code execution, or unrestricted browser control.
- Autonomous external payments, payroll, bank transfers, or irreversible financial actions.
- Self-modifying policies or self-granted permissions.
- A multi-agent swarm unless experiments show it is necessary.
- Building a new ERP or replacing the customer's system of record.
- Claiming universal model agnosticism before conformance tests exist.
- Fine-tuning or self-hosting a model before a measured cost/quality case exists.

## 5. Candidate wedge selection

Compare at least these options using the same scorecard:
A. Invoice/document intake → structured fields → human review → controlled ERP/CRM record creation.
B. Spreadsheet reconciliation and exception reporting.
C. General document/data operations across common SaaS tools.
D. Another vertical discovered through customer evidence.

Score each 1–5, with written evidence and confidence for:
- frequency and pain;
- willingness to pay / budget owner;
- ease of obtaining representative data;
- deterministic verifiability;
- reversibility and risk;
- integration access and setup cost;
- time to first value;
- competitive intensity and platform bundling risk;
- gross-margin potential;
- fit with current code/assets.

Run two counterfactuals:
1. If WAKIL had no Odoo/ERP code, would the ERP wedge still win?
2. If all current assets were equally cheap to rebuild, which wedge would win?
Existing assets count as a cost advantage, not as proof of market demand.

## 6. Core user journey

1. Operator connects a system and grants a narrow set of permissions.
2. Operator selects a workflow template and provides input data.
3. WAKIL validates inputs and displays the intended scope, risk, and expected effects.
4. Runtime creates a durable task and execution plan.
5. Model proposes a typed tool call; runtime validates schema and policy.
6. Tool executes with a bounded timeout and idempotency key.
7. Runtime verifies the observed postcondition.
8. If approval is needed, execution pauses; a human approves or rejects the exact proposed action.
9. On a recoverable failure, runtime retries/reconciles within a bounded policy.
10. Task ends in a truthful terminal state and exposes a receipt with inputs, actions, approvals, evidence, and unresolved issues.

## 7. Execution state machine

Recommended conceptual states:
- `queued`
- `running`
- `waiting_for_approval`
- `waiting_for_input`
- `retry_scheduled`
- `verifying`
- `succeeded`
- `partially_succeeded`
- `failed`
- `cancelled`
- `expired`

Terminal-state transitions must be explicit and tested. A task cannot become `succeeded` unless all required postconditions are verified. A partial outcome must not be represented as full success.

Every step should record: step ID, task ID, sequence, typed action, input/output references, policy decision, approval reference, idempotency key, start/end time, attempt number, normalized result, verification result, and error classification. Avoid storing sensitive raw payloads by default; use encrypted references and retention rules.

## 8. Architecture boundaries

Keep the following responsibilities separate even if they initially live in one deployable application:

- **Product/API layer:** auth, tenant context, task submission, operator UI/API.
- **Orchestrator:** state machine, plan/step scheduling, cancellation and deadlines.
- **Model gateway:** provider adapters, capability declarations, structured outputs, routing, token/cost limits.
- **Tool runtime:** typed registry, input/output validation, sandboxing where applicable, timeouts, rate limits.
- **Policy engine:** deny-by-default authorization, risk classes, approval requirements, tenant/resource scoping.
- **Connectors:** native API first, then typed SDK/function, MCP where appropriate, CLI, browser, and computer use last.
- **Verification engine:** preconditions, postconditions, read-after-write, reconciliation, confidence/uncertainty.
- **Durable storage:** tasks, steps, events, approvals, idempotency records, connector credentials/references, evaluation results.
- **Workers/queue:** leases, retries, heartbeats, concurrency limits, dead-letter handling.
- **Observability:** metrics, traces, redacted logs, task receipts, operator audit view.
- **Evaluation:** versioned benchmark tasks, fixtures, graders, ablations, regression gates.

Do not adopt Temporal, Restate, BullMQ, or another orchestration system by preference alone. Compare the existing stack and failure requirements. If the current queue/database design cannot guarantee durable progress, lease recovery, and safe retries, run a focused spike and document the migration cost.

## 9. Security and trust boundaries

Threat model at minimum:
- prompt injection in documents, email, web pages, and tool output;
- malicious or malformed tool arguments;
- cross-tenant IDOR/data leakage;
- replay, duplicate writes, and race conditions;
- stale or overbroad approvals;
- confused-deputy behavior through privileged connectors;
- secret leakage into model context, logs, traces, and receipts;
- compromised model/provider or malicious model output;
- SSRF, unsafe URL fetching, path traversal, and arbitrary code execution;
- policy/configuration changes during a running task;
- untrusted MCP servers and supply-chain risk;
- worker crashes after side effect but before recording success.

Required controls:
- deny-by-default authorization and server-derived tenant/actor context;
- validate authorization on every resource access and tool call;
- approval bound to exact action hash, resource, parameters, actor, expiry, and policy version;
- idempotency plus reconciliation for ambiguous outcomes;
- secret manager / encrypted credentials and redaction;
- strict tool allowlists and typed schemas;
- resource limits, timeouts, egress restrictions, and sandboxing for risky tools;
- append-only audit events with tamper-evidence appropriate to the threat model;
- retention/deletion policies and data minimization;
- adversarial prompt-injection and cross-tenant tests.

A hash chain alone does not make audit storage tamper-proof if an attacker can rewrite the entire database and chain. State the actual threat model and consider externally anchored checkpoints if stronger tamper evidence is required.

## 10. Data model (conceptual, adapt to existing Prisma schema)

- `Task`: tenantId, createdBy, workflow/version, status, riskClass, inputRefs, deadline, budget, createdAt, updatedAt.
- `TaskStep`: taskId, sequence, status, actionType, inputRef, outputRef, attempt, idempotencyKey, startedAt, finishedAt, errorCode.
- `TaskEvent`: taskId, sequence, eventType, actorType, actorId, payloadRedacted, previousHash/hash if implemented, createdAt.
- `ApprovalRequest`: taskId, stepId, actionHash, requestedScope, policyVersion, status, expiresAt, decidedBy, decidedAt, reason.
- `IdempotencyRecord`: tenantId, connectorId, key, requestHash, status, resultRef, createdAt.
- `ToolDefinition`: name/version, input schema, output schema, risk class, permission requirements.
- `ConnectorConnection`: tenantId, provider, encrypted credential reference, granted scopes, status.
- `VerificationResult`: taskId, stepId, checkType, expected, observedRef, outcome, graderVersion.
- `EvaluationRun` and `EvaluationCase`: dataset/version, model/runtime config, outcome, latency, cost, grader evidence.

These are logical concepts, not an instruction to duplicate existing tables. Inspect the schema and migration history first.

## 11. API shape (illustrative; align with existing conventions)

- `POST /api/tasks` — create task.
- `GET /api/tasks/:id` — status and safe summary.
- `POST /api/tasks/:id/cancel` — request cancellation.
- `POST /api/tasks/:id/resume` — resume only if policy permits.
- `GET /api/tasks/:id/events` — paginated, redacted event stream.
- `GET /api/tasks/:id/receipt` — evidence-backed completion receipt.
- `POST /api/approvals/:id/decision` — approve/reject exact pending action.
- `POST /api/evaluations` — run an authorized evaluation suite.

Do not add these routes blindly; map existing routes and use the repository's current API conventions.

## 12. Verification and task outcome

Use task-specific postconditions. Examples:
- Record creation: query the system of record and verify exactly one matching record exists with expected normalized fields.
- Spreadsheet update: read back the target cells/range and compare against expected values.
- Reconciliation: verify the arithmetic and produce a list of matched/unmatched items with source references.
- Document extraction: compare extracted fields against labeled ground truth; abstain or route to review when confidence is insufficient.

Separate:
- **execution success**: tool returned successfully;
- **verification success**: expected postcondition observed;
- **business-task success**: all required task-level acceptance checks passed.

Only the last qualifies as verified task success.

## 13. Evaluation plan

Create a versioned initial benchmark of 200 tasks if representative data can be obtained:
- 50 deterministic happy paths;
- 40 ambiguous/missing-data cases;
- 30 transient failures/timeouts;
- 25 duplicate/replay/race cases;
- 25 permission/approval boundary cases;
- 15 prompt-injection/adversarial cases;
- 15 partial-failure/recovery cases.

Adjust categories to the chosen wedge, document class balance, and avoid synthetic-only claims. Include redacted realistic fixtures and a deterministic fake connector for CI; test against a sandbox integration separately.

Ablations:
1. raw model without tools;
2. model + tools;
3. tools + policy;
4. tools + verification;
5. tools + verification + recovery/idempotency;
6. full runtime;
7. alternative model/provider under identical task and tool conditions.

Measure verified success, first-pass success, silent wrong completion, unauthorized actions, duplicate side effects, approval bypass, recovery success, review rate, latency p50/p95, cost per verified success, and evidence completeness. Report sample sizes and confidence intervals. Zero failures in a small sample is not proof of zero risk.

## 14. Acceptance criteria

### Tier 0 — safety red lines
Any violation blocks release:
- unauthorized consequential mutation: 0 observed;
- duplicate financial/business commit in the tested idempotency scenarios: 0 observed;
- approval bypass: 0 observed;
- cross-tenant leakage: 0 observed;
- destructive action without policy authorization: 0 observed;
- successful terminal state without required verification evidence: 0 observed;
- secrets exposed in prompts/logs/receipts: 0 observed.

These are release gates, not statistical proof of impossibility.

### Tier 1 — provisional MVP hypotheses
Validate or revise using baseline measurements:
- verified success on in-scope benchmark: target >=90%;
- first-pass verified success: target >=85%;
- recoverable transient-failure recovery: target >=80%;
- routine task model cost: target <=$0.03 only if current provider pricing and task mix make it realistic;
- simple workflow p95 latency: target <=5 seconds only for workflows whose integration latency permits it;
- runtime overhead p95: target <=400 ms excluding model and external connector time;
- every completed task has a receipt with linked verification evidence.

Do not treat these targets as achieved results or external industry standards.

### Tier 2 — competitive thresholds
Derive only after comparing current alternatives and running representative tests. Label each threshold as externally sourced, customer-derived, or internally measured.

Use risk-adjusted reliability by task class; do not average high-risk and low-risk tasks into one reassuring number.

## 15. Commercial and unit economics

For each workflow, measure:
- human baseline minutes and loaded labor cost;
- automation completion time and review minutes;
- verified success and exception rate;
- model/tool/infra cost per attempted task;
- cost per verified task;
- integration/onboarding and ongoing support cost;
- gross margin at realistic volume.

Compare API-hosted models against self-hosting only after measuring workload volume, latency, context, output tokens, concurrency, GPU utilization, engineering/ops cost, and quality. GPU break-even must include idle capacity, redundancy, maintenance, and the cost of weaker or stronger model performance—not just token prices.

## 16. Roadmap

### Phase 0 — prove the wedge (1–2 weeks)
- inspect repo and current tests;
- interview prospective users / collect representative workflow examples;
- select one workflow using the scorecard;
- define ground truth and a baseline;
- document kill criteria.

### Phase 1 — trustworthy vertical slice (2–4 weeks)
- one workflow, one system-of-record connector, one model adapter;
- durable task/step state;
- typed tools, policy gate, approval gate, idempotency, postcondition verification;
- receipt and operator review surface;
- deterministic test harness and CI gates.

### Phase 2 — resilience and evidence (2–4 weeks)
- retry/recovery and crash-injection tests;
- tenant isolation and adversarial tests;
- benchmark and ablations;
- cost/latency dashboards;
- sandbox integration tests.

### Phase 3 — controlled pilot (4–8 weeks)
- limited design partners;
- shadow mode before writes;
- approval-first mode;
- weekly failure review and rollback;
- pricing and ROI validation.

### Phase 4 — expand only with evidence
Add connectors, workflow templates, model routing, and broader verticals only when the first wedge reaches its risk-adjusted reliability and economics gates.

## 17. Kill / pivot criteria

Pause or pivot if:
- customers do not provide data/access needed for verification;
- integration setup costs overwhelm the value of automation;
- verified success does not beat a simpler rules/RPA/workflow solution;
- human review burden erases time savings;
- platform-native agents make the wedge commoditized and WAKIL has no measurable reliability advantage;
- safe idempotency/reconciliation cannot be implemented for the chosen write operations;
- cost per verified task exceeds customer value at realistic volume;
- benchmark gains disappear on held-out real-world cases.

## 18. Required deliverables before broad implementation

1. Repository inventory and code-path map with exact file paths.
2. Gap matrix: present / partial / missing / misaligned.
3. Wedge scorecard and counterfactual analysis.
4. Architecture decision records for durable execution, queue, database, model adapters, and connector hierarchy.
5. Threat model and abuse cases.
6. Versioned benchmark and grader design.
7. MVP implementation plan with small reviewable milestones.
8. Baseline test report before code changes.
9. Rollback and migration plan.
10. Clear separation of verified facts, assumptions, external claims, and experiments still needed.

## 19. Source and decision hygiene

For any market, model, price, competitor, or infrastructure claim, record:
- claim;
- source URL and publication/access date;
- whether it is primary or secondary;
- what the source actually supports;
- confidence and limitations.

Never invent model names, availability, prices, benchmarks, customer demand, or test results. Provider pricing and product capabilities change; verify them immediately before decisions.

## 20. Definition of MVP done

MVP is done only when one bounded workflow:
- runs end-to-end in a sandbox;
- survives worker/process interruption without losing state;
- blocks unauthorized and unapproved actions;
- avoids duplicate side effects under tested retries/replays;
- verifies postconditions against the system of record;
- produces a truthful receipt;
- passes the versioned evaluation suite and Tier 0 security gates;
- demonstrates measurable customer value against a human/simple-automation baseline;
- has documented limitations, runbook, rollback, and pilot plan.
