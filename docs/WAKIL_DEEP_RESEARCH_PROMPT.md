# WAKIL Deep Research — Master Prompt

**Research date anchor:** 2026-10-04  
**Repository:** https://github.com/shaker15s/wakeel  
**Product thesis:** WAKIL — Model-Agnostic AI Employee Runtime

## Mission

Produce a decision-grade, skeptical research report that determines whether WAKIL should be built, what its first narrow workflow should be, how to evolve the existing repository, and what evidence is required before investing further. Do not produce a generic “AI agents are the future” report.

## Non-negotiable research rules

1. Inspect the live repository and cite exact paths, symbols, schemas, tests, and workflows. Do not assume the repo matches prior summaries.
2. Use current primary sources wherever possible: official documentation, official pricing pages, changelogs, papers, and vendor product pages. Include URLs and access dates.
3. Separate **verified repository facts**, **external sourced facts**, **inferences**, **assumptions**, **estimates**, and **experiments required**.
4. Never invent a model name, model availability, price, benchmark result, competitor feature, or repository capability.
5. Treat targets in the PRD as hypotheses, not achieved results or industry standards.
6. Challenge the thesis. Give a clear verdict: GO, GO WITH NARROWED WEDGE, PIVOT, or STOP, with confidence and reasons.
7. Prefer small, testable decisions over speculative enterprise architecture.
8. Do not recommend rewriting the repository unless a comparative migration case demonstrates that reuse is more expensive or unsafe.
9. Do not claim code was run, benchmarked, or security-tested unless it actually was.
10. Provide a source register and state when a claim cannot be verified.

## Questions to answer

### A. Repository audit
- Map the actual application architecture, entry points, data model, auth, tenant model, model gateway, tool loop, connectors, policy, approvals, persistence, background work, tests, CI, deployment, and observability.
- Identify exact implementation paths and relevant functions.
- Classify each capability PRESENT / PARTIAL / MISSING / MISALIGNED.
- Find security-critical defaults, untested paths, monoliths, duplicate abstractions, and failure modes.
- Assess Next.js, TypeScript, Prisma, current database, queue/workers, and deployment for durable execution and likely growth.
- Estimate failure modes and migration costs at 100 tasks/day, 10,000/day, and 1,000,000/day; state assumptions and bottlenecks. Avoid pretending to know actual load without measurements.
- Identify what to keep, refactor, isolate, replace, and delete. Give evidence and confidence for every major recommendation.

### B. Market and wedge
Compare at least:
1. invoice/document intake and controlled ERP/CRM record creation;
2. spreadsheet reconciliation and exception reporting;
3. general back-office data/document operations;
4. one additional plausible wedge supported by research.

Score pain/frequency, budget owner, willingness-to-pay evidence, data access, verifiability, reversibility, integration friction, time-to-value, competition/platform risk, gross margin, and current-code leverage. State evidence and confidence per score.

Run counterfactuals:
- If WAKIL had no Odoo/ERP code, would ERP still win?
- If all current code/assets were equally cheap to rebuild, which wedge wins?
Existing code is a cost advantage, not evidence of demand. Make a market-first recommendation, not a sunk-cost recommendation.

### C. Competitive landscape
Compare relevant platform-native agents, workflow automation, RPA, agent frameworks, browser/computer-use systems, and coding agents. At minimum investigate current offerings from OpenAI, Anthropic, Google, Microsoft, Salesforce, ServiceNow, UiPath, Automation Anywhere, Zapier, Lindy, Relevance AI, MCP ecosystem, OpenHands, SWE-agent, LangGraph, and CrewAI where relevant.

For each competitor, distinguish:
- verified capability today;
- roadmap/marketing claim;
- target buyer and workflow;
- pricing/packaging where public;
- strengths and weaknesses;
- overlap with WAKIL;
- plausible differentiation and commoditization risk.

Do not imply a framework is a direct product competitor when it is infrastructure.

### D. Model/provider strategy and costs
- Verify exact current model identifiers, API availability, tool/function calling, structured output, context limits, latency/pricing where published, and relevant restrictions.
- Compare quality, cost, latency, tool reliability, privacy, regional availability, and portability.
- Include hosted API versus self-hosted/open-weight analysis only with realistic assumptions.
- Build cost models for representative tasks at low, medium, and high complexity, including retries, verification, embedding/storage, tools, and human review.
- Estimate cost per attempted task and cost per verified task.
- Model self-hosted GPU break-even including utilization, redundancy, operations, latency, quality differences, and capital/lease costs.
- Never use stale or fictional model names/prices. Mark unknowns explicitly.

### E. Runtime and architecture
Compare the current design against durable execution approaches and relevant systems such as Temporal, Restate, BullMQ/Redis, database-backed queues, and provider-native tool use. Use primary sources and explain trade-offs; do not select technology by hype.

Design a staged architecture for:
- durable task and step state;
- typed tool registry and schema validation;
- policy/authorization before every tool call;
- approvals bound to exact action/resource/parameters/version/expiry;
- idempotency and reconciliation after ambiguous failures;
- postcondition verification;
- retry classification and bounded recovery;
- cancellation, deadlines, budgets, leases, heartbeats, and dead-letter handling;
- model adapters and routing;
- append-only events and evidence-backed receipts;
- tenant isolation and secrets management;
- observability and evaluation.

Define connector preference order and trade-offs: native API > typed SDK/function > trusted MCP > CLI > browser automation > computer use, but document exceptions. Never claim that MCP itself guarantees trust or correctness.

Provide TypeScript interface sketches and schema/migration sketches only where useful. Keep interfaces minimal and aligned with the actual repo.

### F. Security and failure analysis
Threat-model prompt injection, malicious documents/tool output, SSRF, unsafe code execution, cross-tenant access, IDOR, secret leakage, approval replay/bypass, duplicate commits, stale permissions, compromised connectors, and crash-after-side-effect-before-recording.
For every threat include attacker, preconditions, impact, preventive controls, detection, recovery, and a test case.
Distinguish tamper-evident logs from truly immutable storage; explain the trust assumptions of any hash chain.

### G. Benchmark and experiments
Design a versioned benchmark of about 200 tasks for the chosen wedge, including happy paths, ambiguity, missing fields, transient failures, retries, duplicate/replay, authorization boundaries, prompt injection, and partial failures. If 200 realistic cases are not available, explain how to stage collection and do not inflate synthetic results.

Run or specify ablations:
1. raw model;
2. model + tools;
3. tools + policy;
4. tools + verification;
5. verification + recovery/idempotency;
6. full runtime;
7. alternative model under identical conditions.

Use deterministic graders and postconditions rather than model self-report. Define confidence intervals and minimum sample sizes. Separate offline sandbox results from production pilot results.

### H. Acceptance criteria
Separate:
- **Tier 0 safety red lines**: unauthorized consequential mutation, duplicate business commit in tested retry cases, approval bypass, cross-tenant leakage, destructive action without policy, unverified success, or secret leakage must block release.
- **Tier 1 provisional MVP targets**: treat PRD numbers such as verified success >=90%, first-pass success >=85%, recovery >=80%, routine model cost <=$0.03, simple-workflow p95 <=5s, runtime overhead p95 <=400ms as hypotheses to validate or revise—not achieved metrics.
- **Tier 2 competitive thresholds**: derive from current competitor evidence, customer requirements, and WAKIL experiments.

Report risk-adjusted reliability by task class. Zero failures in a small sample is not proof of zero risk.

### I. Final deliverables
1. Executive decision memo with verdict and confidence.
2. Repository architecture map and gap matrix with exact paths.
3. Wedge comparison, weighted scorecard, and both counterfactuals.
4. Competitive matrix with citations.
5. Current model/provider table with official sources and dates.
6. Cost scenarios and self-hosting break-even assumptions.
7. Recommended architecture and ADRs.
8. Threat model and security test plan.
9. Benchmark specification and ablation plan.
10. Product PRD and narrow MVP scope.
11. Phased implementation plan with dependencies, risks, and rollback.
12. Build-ready coding-agent prompt that instructs an agent to inspect before editing, implement small milestones, run tests, and report evidence.
13. Source register, open questions, assumptions, and kill criteria.

## Required final format

Start with the verdict and the strongest reasons not to build. Then present the recommended wedge and the minimum evidence needed to proceed. Keep evidence and recommendations distinguishable. Use tables when they improve comparison, but do not hide uncertainty behind numerical scores.

Conclude with:
- the next 10 actions in priority order;
- the top 5 assumptions most likely to kill the project;
- explicit go/no-go gates for the first 30 days;
- what not to build yet.
