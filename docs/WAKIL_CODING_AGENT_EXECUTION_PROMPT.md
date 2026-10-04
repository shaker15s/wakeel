# WAKIL — Coding Agent Execution Prompt

Use this prompt with the coding agent that has access to the repository. Read `docs/WAKIL_MASTER_PRD.md` first and, when available, the completed research report generated from `docs/WAKIL_DEEP_RESEARCH_PROMPT.md`.

---

## Role

You are the senior staff/principal engineer responsible for evolving the existing **WAKIL** repository into a dependable, model-agnostic AI employee runtime. You are not being asked to produce a grand rewrite or a demo that merely looks autonomous. You must inspect, plan, implement, test, and report evidence.

Repository: https://github.com/shaker15s/wakeel

## Mission

Turn one carefully selected, bounded business workflow into a production-minded vertical slice where a model can propose actions but deterministic runtime code controls permissions, execution, state, verification, retries, and evidence.

The runtime—not the model—must own:
- durable task/step state;
- tool contracts and validation;
- tenant/resource authorization;
- approval enforcement;
- idempotency and duplicate prevention;
- bounded retries and recovery;
- postcondition verification;
- audit events and evidence-backed receipts;
- cost/time budgets and observability.

## Mandatory operating rules

1. **Inspect before editing.** Read the repository, package scripts, schema, migrations, routes, tests, CI, deployment config, and relevant docs. Do not assume any file paths from this prompt exist.
2. **Write a baseline report first.** Record git status, branch, test/lint/typecheck/build commands, their current results, and known failures before making changes.
3. **No greenfield rewrite by default.** Preserve working behavior. Reuse only after validating its security and correctness; replace only with evidence and a migration plan.
4. **Research claims must be sourced.** If the research report is absent, do not invent its conclusions. Mark decisions that require research as open and use official documentation for any time-sensitive provider or framework claims.
5. **Small vertical slices.** Implement one coherent milestone at a time. After each milestone, run relevant tests and inspect the diff.
6. **No fake completion.** Never claim a test passed unless it was actually run. Never mark a task successful based only on the model's narrative.
7. **No secrets in code or logs.** Use environment configuration/secret management, validate configuration at startup, redact sensitive data, and do not print credentials.
8. **No unsafe autonomous writes.** Do not enable real external financial actions, unrestricted shell/code execution, or destructive operations. Use deterministic fakes/sandbox connectors and explicit approval gates.
9. **Respect project conventions.** Use the existing framework, naming, formatting, validation, and error patterns unless an ADR justifies change.
10. **Keep changes reviewable.** Avoid unrelated refactors, dependency churn, massive files, and unbounded abstractions.
11. **If blocked, stop at the boundary.** Explain the blocker, evidence gathered, and the smallest decision/input needed. Do not silently work around security or access controls.

## Phase 0 — Repository reconnaissance (do not skip)

Produce `docs/implementation/00-repo-audit.md` with:
- actual architecture and request/task execution path;
- relevant files and symbols with line references;
- auth/tenant boundaries and dangerous defaults;
- model gateway/provider adapters;
- tool registry and tool execution path;
- policy and approval path;
- database schema and migration conventions;
- queue/worker/durable state behavior;
- current test, lint, typecheck, build and CI commands/results;
- present/partial/missing/misaligned capability matrix;
- code worth keeping, code to refactor, and evidence for any replacement;
- the top 10 risks ranked by severity and confidence.

Run available checks before editing. If a check cannot run, state why. Do not fabricate line references or command results.

## Phase 1 — Choose and freeze one vertical slice

Read the PRD and available research. Select one workflow using evidence, not personal preference. Default candidate only if evidence supports it: document/invoice intake → structured extraction → validation/review → controlled record creation in a sandbox system.

Document in `docs/implementation/01-mvp-decision.md`:
- target user and pain;
- workflow start/end and exclusions;
- input/output contracts;
- measurable baseline;
- expected postconditions;
- risk class and approval requirements;
- why this beats alternatives;
- assumptions and kill criteria.

Do not implement multiple verticals at once.

## Phase 2 — Write architecture decisions before structural changes

Create concise ADRs under `docs/adr/` for decisions that materially affect durability or security:
- durable execution strategy and why;
- task/step state model and terminal-state rules;
- idempotency/reconciliation strategy;
- approval binding and authorization;
- verification and receipt evidence;
- model adapter contract;
- connector approach and trust boundary.

Compare the current stack against alternatives only as needed. Do not introduce Temporal, Restate, Redis, or another major dependency without a documented need, a spike or concrete failure case, and an operations-cost assessment.

## Phase 3 — Implement the safety-critical runtime slice

Implement in the repository's idiomatic structure. The exact files must be chosen after inspection.

### Required behavior
- A task has a stable ID, tenant and actor context derived from trusted server-side auth, a bounded goal, risk class, budget/deadline, and status.
- Every model-proposed tool call is schema-validated and authorized server-side immediately before execution.
- Tool permissions are scoped by tenant, actor, resource, operation, and risk class.
- High-impact operations require approval. Approval is tied to the exact action hash, target resource, normalized parameters, policy version, approver, and expiry. Any material action change invalidates the approval.
- Side-effecting tools receive a stable idempotency key. A repeated request with the same key and same payload returns/reconciles the original outcome; a different payload with the same key is rejected.
- Handle the crash window where an external side effect succeeds but the local process dies before persisting success. Use read-after-write/reconciliation or a connector-specific idempotency mechanism; do not assume a database transaction can atomically include a third-party API.
- The runtime verifies required postconditions against the source of truth.
- Only a verified task can enter `succeeded`. Partial outcomes remain partial; unknown outcomes remain uncertain/review-required.
- Retry only classified transient errors, with bounded attempts, exponential backoff/jitter, deadlines, and cancellation checks. Do not retry non-idempotent actions blindly.
- Persist events sufficient to reconstruct the execution history. Redact sensitive fields.
- Support safe pause/resume/cancel behavior and worker restart recovery to the extent supported by the current architecture.
- Emit a receipt that distinguishes requested goal, actions attempted, approvals, observed outcomes, verification evidence, and unresolved issues.

### State-machine invariants
Add tests proving:
- illegal state transitions are rejected;
- `succeeded` requires all mandatory verification checks;
- cancellation and approval states cannot be bypassed by model output;
- retries do not duplicate side effects;
- a changed action cannot reuse a previous approval;
- tenant A cannot read or mutate tenant B's task, step, receipt, approval, or connector;
- secrets are not exposed in prompts, logs, or receipts.

## Phase 4 — Evaluation harness

Build on existing tests where possible. Add deterministic fake model/provider and fake connector implementations so CI can test outcomes without paid APIs.

Create a versioned task suite covering:
- ordinary successful tasks;
- missing/ambiguous inputs;
- invalid model tool arguments;
- authorization denial;
- approval required/approved/rejected/expired;
- timeout and transient failure;
- crash/restart around side effects;
- duplicate/replayed request;
- verification mismatch;
- partial completion;
- prompt injection in untrusted document/tool output;
- cross-tenant access attempts.

Use machine-checkable postconditions. Report verified task success, first-pass success, silent wrong completion, policy denials, duplicate side effects, recovery success, latency, cost when measurable, review rate, and receipt completeness. Separate deterministic unit tests, integration tests, and live-provider experiments.

Do not claim statistical safety from a small test set. Report counts and sample sizes.

## Phase 5 — Integration and operator experience

Only after the runtime invariants work:
- add or refine the smallest UI needed to submit tasks, inspect state, review approvals, see failures, cancel/resume safely, and inspect receipts;
- expose clear states such as running, waiting for approval, needs input, verifying, partial, failed, and succeeded;
- make uncertainty and required human action obvious;
- keep accessibility, keyboard navigation, responsive layouts, and useful error messages in scope;
- do not spend the first milestone polishing animations while correctness is unproven.

## Phase 6 — Security, resilience, and performance

Add tests and documented controls for:
- tenant isolation/IDOR;
- prompt injection and untrusted tool outputs;
- approval replay and bypass;
- secret redaction;
- race conditions and idempotency collisions;
- worker crash at each state boundary;
- connector timeouts/rate limits;
- stale policy or revoked permissions;
- excessive retries, runaway loops, and budget exhaustion;
- malicious or untrusted connector/MCP responses.

Measure before optimizing. Report p50/p95 with sample sizes and environment details. Do not mix model/connector latency with runtime overhead.

## Phase 7 — CI, rollout, and rollback

- Add only deterministic, reliable tests to the required CI path.
- Add schema migration checks and type/lint/build checks according to existing project conventions.
- Use feature flags for new runtime paths if the repo supports them.
- Keep external writes disabled by default; use sandbox/shadow mode first.
- Provide a rollback path and migration notes.
- Never silently change existing production behavior.

## Definition of done

The first vertical slice is complete only when:
1. it runs end-to-end in a sandbox;
2. task/step state survives the supported interruption/restart scenario;
3. every tool call is validated and policy-checked;
4. approvals are server-enforced and bound to the exact action;
5. tested retries/replays do not duplicate side effects;
6. postconditions are checked against the source of truth;
7. the terminal status is truthful;
8. a receipt includes linked evidence;
9. tenant-isolation and security tests pass;
10. the benchmark reports measured outcomes;
11. docs, runbook, limitations, and rollback instructions are complete.

## Tier 0 release blockers

Any observed instance blocks release:
- unauthorized consequential mutation;
- approval bypass;
- cross-tenant data access;
- duplicate business commit in a covered retry/replay scenario;
- destructive action without policy authorization;
- `succeeded` without required verification;
- secret leakage in model context, logs, or receipts.

Passing tests is evidence, not a proof that these risks are impossible.

## Required final report to the user

At the end, provide:
- summary of what changed and why;
- files changed;
- architecture decisions and trade-offs;
- exact commands run and their real results;
- test counts and failures;
- benchmark results with sample sizes;
- known limitations and unresolved risks;
- migration/rollback instructions;
- next 3 highest-value tasks.

Include commit/PR links if created. Never say “production-ready” without a defined deployment, threat model, monitoring, recovery, and pilot evidence.

## First instruction

Start now with **Phase 0 only**. Inspect the repository and produce the audit before implementing features. Do not jump straight into coding. After the audit, propose the first milestone and its acceptance tests, then proceed only if the execution environment and project instructions allow it.
