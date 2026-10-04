# ADR 0001: In-process, state-persisted task executor instead of a queue/orchestration dependency

- Status: Accepted (for Milestone 1 scope)
- Date: 2026-10-04
- Related: `docs/WAKIL_MASTER_PRD.md` §3/§7/§8/§9, `docs/implementation/01-mvp-decision.md`, `docs/implementation/03-milestone-1-report.md`

## Context

The PRD requires the runtime — not the model — to own execution state,
permissions, idempotency, verification, and auditability for every workflow
(`docs/WAKIL_MASTER_PRD.md` §3). Concretely, that means a task like
"create a draft invoice" must be representable as a durable object that:

- survives a process crash/restart without re-running completed steps or
  double-calling external side effects (crash-after-side-effect is an
  explicit, mandated test category),
- can pause indefinitely waiting for a human approval decision and resume
  exactly where it left off,
- records every state transition as an append-only, auditable event log,
- enforces tenant isolation at the data-access layer, not just at the HTTP
  layer.

There are two broad ways to build this:

1. **Adopt an external durable-execution/queue system** (e.g. Temporal,
   Restate, BullMQ + a worker process, Inngest, a Postgres-backed job queue
   like `pg-boss`/`graphile-worker`).
2. **Build a small in-process executor**: a `TaskStore` persistence contract
   plus a pure, resumable `advance(tenantId, taskId)` function that re-reads
   persisted state on every call and is safe to call repeatedly — no
   in-memory-only execution state, no background worker process required to
   make progress.

## Decision

For this milestone, WAKIL implements option 2: a storage-agnostic
`TaskStore` interface (`src/server/runtime/types.ts`) with a fully-tested
in-memory implementation (`src/server/runtime/memory-store.ts`), and a
resumable orchestrator (`src/server/runtime/executor.ts`) that performs the
entire `create_draft_invoice` workflow as a deterministic step machine driven
by repeated calls to `advance()`.

We are **not** adopting Temporal, Restate, BullMQ, or any other
queue/orchestration dependency in this milestone.

## Why

- **Verifiability in this sandbox.** This session's environment cannot run a
  real Temporal/Restate server, and this repo's Prisma client cannot be
  generated here either (see `docs/implementation/00-repo-audit.md` §4.5 and
  §6.1 — the query-engine binary download is blocked). Any code written
  against those systems could not be executed or tested in this session, which
  would violate the standing rule to never claim a check passed that wasn't
  actually run. An in-memory `TaskStore` can be fully exercised right now,
  including hostile scenarios (crash-after-write, approval tampering, replay,
  cross-tenant access) that are hard to simulate against a real external
  service anyway.
- **The durability properties the PRD actually needs don't require a queue.**
  The workflow is a short, mostly-synchronous chain of steps with exactly one
  long, indefinite pause point (human approval). That can be modeled as "read
  persisted state, do the next deterministic thing, write persisted state" —
  which is what `advance()` does — without needing a scheduler, worker pool,
  or message broker. The `TaskStore` interface is the actual durability
  boundary; what's behind it (in-memory now, Postgres/Prisma later, Temporal
  later still) is an implementation detail the executor does not need to know
  about.
- **Smaller blast radius, smaller review surface.** Introducing a new
  infrastructure dependency (a queue broker, a workflow engine's worker
  process, new environment variables and ops burden) is a much bigger,
  harder-to-review change than ~600 lines of application code behind a clean
  interface. Per the non-negotiable "small, reviewable commits" and "narrow
  scope" rules, this milestone should prove the *execution-state model* is
  correct before paying the cost of operating a new piece of infrastructure.
- **Reversible.** Because `TaskStore` is an interface and `advance()` only
  depends on it (plus `IERPConnector`), swapping the in-memory store for a
  Prisma-backed one — or wrapping `advance()` as a Temporal activity/BullMQ
  job later if concurrency/scale demands it — is an additive change, not a
  rewrite. Nothing in the workflow or test logic is coupled to "runs in a
  single Node process."

## Consequences

- **Known limitation (accepted for now):** the in-memory store does not
  survive a real process restart, and there is no distributed-lock story for
  two server instances calling `advance()` on the same task concurrently.
  This is fine for the current single-instance, human-driven-approval
  workflow (approvals are the only thing that make it "durable" across real
  wall-clock time, and approvals already live independent of the Node
  process's memory in a real deployment, because the approval decision is
  what actually triggers the next `advance()` call). It becomes a real risk
  once this runs with concurrent workers or needs to survive deploys — at
  that point a Prisma-backed (or otherwise persistent) `TaskStore`
  implementation is **required before production use**, not optional. This
  is the top item for the next milestone, not a silently accepted permanent
  gap.
- **No automatic background progress.** Nothing currently calls `advance()`
  on a timer; something (an API route handler, a cron job, a webhook
  receiver for approval decisions) must call it. This milestone deliberately
  does not wire that up yet (see "Out of scope" in
  `docs/implementation/03-milestone-1-report.md`) because doing so requires
  the Next.js API/Prisma integration this sandbox cannot verify live.
- **Revisit trigger:** if a future milestone needs multiple workers executing
  tasks concurrently, cross-process crash recovery, scheduled/delayed steps,
  or workflow fan-out/fan-in, re-open this ADR and evaluate Temporal/Restate/
  a Postgres job queue against the `TaskStore` contract at that time — the
  contract was designed so that decision doesn't require redesigning the
  workflow logic itself.

## Alternatives considered

| Option | Why not (yet) |
|---|---|
| Temporal | Correct long-term choice for complex multi-step/multi-day workflows with retries and signals, but requires a running Temporal server this sandbox cannot provide or verify against; adds significant operational surface for a single-workflow MVP. |
| BullMQ (Redis-backed) | Needs a Redis instance not available/verified here; also solves job *queueing*, not the approval-pause + idempotency + verification semantics this milestone actually needs — would still need the same `TaskStore`-shaped logic on top. |
| Restate / Inngest | Same unverifiable-in-sandbox problem; also meaningfully increases vendor surface for a single narrow workflow that PRD instructs us to keep narrow. |
| Hand-rolled Postgres job table (`pg-boss`/`graphile-worker`-style) | Reasonable next step, but still blocked on Prisma client generation in this sandbox (see repo audit); deferred to the milestone where a real DB-backed `TaskStore` is implemented and tested against a live database. |
