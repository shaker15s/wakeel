# ADR 0002 — Persist the bounded local runtime in Node SQLite

Date: 2026-10-14  
Status: accepted for the **single-process synthetic demo only**. Not a production orchestration decision.

## Context

ADR 0001 made execution state explicit, but the only store was in-memory. Browser reload persistence and process restart recovery are different requirements: a global singleton survives hot reload, not process exit. The new workspace needs a genuine task inbox, resumable approval, and receipts that remain inspectable.

A live ERP, model credentials, and a distributed worker environment are not available. Installing Temporal and presenting a Hello World worker as if it were a fully integrated financial runtime would not close this gap. Likewise, silently falling back to memory on storage failure would violate the persistence promise.

## Decision

- Implement `TaskStore` over the built-in `node:sqlite` in Node >=22.13.
- Use a document table keyed by `(kind,id)`, tenant/task scopes, indexed ordering, and a unique event sequence per task.
- WAL, synchronous FULL, busy timeout. SQL parameters for user-controlled values.
- Synchronous SQL mutation bodies prevent asynchronous interleaving inside a method. Approval decisions and event sequencing use `BEGIN IMMEDIATE` transactions.
- Retain Date values in a tagged serialization envelope; no heuristic conversion of ordinary memo strings.
- Persist synthetic ERP records too, **before** an injected crash-after-write. Otherwise a restored idempotency record could point to nonexistent simulation data.
- `advance` and `cancelTask` serialize by store/task within the Node process. Demo HTTP mutations also serialize the fake connector's fault-injection queue.
- Idempotent HTTP intake derives a server-side task ID from the tenant and the supplied request key. Replays compare canonical request hashes, not object key insertion order.
- Keep the complete approval record in `TaskView` after completion for receipt export.
- Do not suppress storage failures or downgrade to memory.

## Guarantees and non-guarantees

This preserves committed state across **process restart on the same persistent disk**. A pending approval can be resumed later. Completed steps are not deliberately re-run. Unknown write outcomes stop rather than being treated as proof that no write occurred.

It does not provide:

- autonomous scheduled recovery, worker queues, heartbeats, or distributed leases;
- multi-node concurrency or guarantees about replicas with distinct singleton instances;
- atomic initialization of all task/step/event records: interrupted initialization fails closed as incomplete state;
- atomic commit across the ERP side effect and the runtime database;
- protection against an administrator rewriting SQLite;
- production authentication: anonymous tenant headers are only a synthetic playground identity;
- business-level deduplication across distinct task/request IDs;
- proof that an external eventually-consistent ERP can safely retry after a negative lookup.

Do not use this store to persist credentials. No real account data should enter `/api/demo/*`. An exposed long-running demo needs operational quotas and retention before public launch.

## Deployment

`WAKEEL_RUNTIME_DB` may specify an absolute persistent-volume path. `npm start` defaults to `$PWD/data/runtime.sqlite` before the standalone server changes its working directory. Never put the live DB under `.next`, never commit it, and never assume ephemeral serverless storage is durable.

The existing Prisma schema and legacy console remain separate. A generated Prisma client used for type checking without its native engine does not make legacy DB operations available. The new local runtime uses a real SQLite database independently of Prisma.

## Evidence

- Unit tests reopen the DB, restore dates/steps/approvals, decide once across two connections, redact stored events, and recover synthetic side effects.
- Concurrent resume tests call the runtime eight times but issue one write.
- The running application was stopped and restarted: the pending approval returned with the identical action hash; approval succeeded; replay returned 409; a different tenant returned 404.
- Browser tests cover the full visible workflow and the idempotent intake HTTP contract.

## Next architecture decision

Before live financial writes, choose Temporal/Inngest/another durable worker engine based on the hosting and operating team, not brand preference. Require a representative Odoo sandbox and benchmark first. Keep deterministic validation, approvals, idempotency, and verification in activities/runtime boundaries regardless of which model or scheduler is selected.
