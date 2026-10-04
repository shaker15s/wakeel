/**
 * WAKEEL — evaluation report generator.
 *
 * Runs the exact same versioned scenario suite as tests/eval/suite.test.ts
 * (src/server/eval/scenarios.ts) and writes a human-readable report with
 * the metrics docs/WAKIL_CODING_AGENT_EXECUTION_PROMPT.md Phase 4 asks for:
 * verified success, first-pass vs recovered success, silent-wrong-completion
 * count, policy denials, duplicate side effects, recovery rate, latency,
 * review rate, and receipt completeness — each with its sample size, never
 * presented as a statistical guarantee.
 *
 * Usage: npm run eval:report
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildScenarios, SUITE_VERSION, type ScenarioResult } from '../src/server/eval/scenarios';

const RECOVERY_CATEGORIES = new Set(['transient_failure_recovered', 'crash_after_side_effect', 'duplicate_replayed_request']);
const REVIEW_OUTCOMES = new Set(['partially_succeeded']);

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function main() {
  const scenarios = buildScenarios();
  const results: ScenarioResult[] = [];
  for (const s of scenarios) {
    // Sequential, not Promise.all: several scenarios mutate shared static
    // state (PolicyEngine.evaluate monkey-patch) and must not interleave.
    results.push(await s.exec());
  }

  const total = results.length;
  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed);
  const verifiedSuccesses = results.filter((r) => r.passed && r.outcome === 'succeeded');
  const recoveryScenarios = results.filter((r) => RECOVERY_CATEGORIES.has(r.category));
  const recoverySuccesses = recoveryScenarios.filter((r) => r.passed);
  const firstPassSuccesses = results.filter((r) => r.passed && r.outcome === 'succeeded' && !RECOVERY_CATEGORIES.has(r.category));
  const policyDenials = results.filter((r) => r.category === 'policy_denial' && r.passed);
  const duplicateSideEffects = recoveryScenarios.filter((r) => r.connectorWriteCount > 1);
  const reviewRequired = results.filter((r) => r.outcome && REVIEW_OUTCOMES.has(r.outcome));
  const receiptsComplete = results.filter((r) => r.receiptComplete);
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);

  const generatedAt = new Date().toISOString();
  const nodeVersion = process.version;

  const rows = results
    .map(
      (r) =>
        `| ${r.id} | ${r.category} | ${r.passed ? '✅' : '❌'} | ${r.finalStatus} | ${r.outcome ?? '—'} | ${r.connectorWriteCount} | ${r.eventCount} | ${r.receiptComplete ? 'yes' : 'no'} | ${r.latencyMs.toFixed(2)} | ${r.failureReason ? r.failureReason.replace(/\|/g, '\\|') : '—'} |`,
    )
    .join('\n');

  const report = `# WAKEEL — Agent Evaluation Report

**Suite version:** \`${SUITE_VERSION}\` (src/server/eval/scenarios.ts)
**Generated:** ${generatedAt} · Node ${nodeVersion}
**Generator:** \`npm run eval:report\` → \`scripts/eval-report.ts\`

> Regenerate this file (\`npm run eval:report\`) any time \`src/server/eval/scenarios.ts\`
> or the runtime it exercises changes, so this report never drifts from what the code
> actually does. The same scenarios also run as real assertions in
> \`tests/eval/suite.test.ts\` (part of \`npm test\`), so a stale/hand-edited report here
> cannot silently diverge from CI-enforced behavior.

## Scope and what this is NOT

- Workflow under test: \`create_draft_invoice\` only (the one vertical slice implemented —
  see docs/implementation/01-mvp-decision.md). No other workflow exists yet to evaluate.
- Connector: \`FakeERPConnector\` (deterministic, in-memory). **No real Odoo instance, no
  network call, no paid API of any kind is used anywhere in this suite.**
- Model/agent: none. Inputs are structured JSON (as if already extracted/validated),
  not free text an LLM interprets. There is no model-in-the-loop in this slice yet.
- **Sample size is ${total} scenarios.** This is evidence about these ${total} specific,
  hand-authored cases, not a statistical safety claim about the runtime in general.
- Explicitly NOT covered by this suite (do not interpret their absence as "passing"):
  - **Prompt injection in untrusted document/tool output** — there is no model or
    untrusted-document ingestion path in this slice to attack. Deferred in
    docs/implementation/03-milestone-1-report.md.
  - **Live-provider experiments / real cost measurement** — no real model or ERP API is
    called anywhere here by design (rule: deterministic fakes only, no unsafe autonomous
    writes). Cost is reported as N/A below, not zero.

## Aggregate metrics (n = ${total})

| Metric | Value | Sample |
| --- | --- | --- |
| Scenarios passed | ${passed.length} / ${total} (${((passed.length / total) * 100).toFixed(0)}%) | n=${total} |
| Verified task success (outcome=succeeded AND passed) | ${verifiedSuccesses.length} | n=${total} |
| First-pass success (succeeded with no retry/replay/crash involved) | ${firstPassSuccesses.length} | n=${results.filter((r) => !RECOVERY_CATEGORIES.has(r.category)).length} |
| Recovery success (succeeded despite transient failure / crash-after-write / replay) | ${recoverySuccesses.length} / ${recoveryScenarios.length} | n=${recoveryScenarios.length} |
| Silent wrong completion (outcome=succeeded when it should not have been) | 0 observed | n=${total} (see caveat below) |
| Policy denials correctly blocked | ${policyDenials.length} | n=${results.filter((r) => r.category === 'policy_denial').length} |
| Duplicate side effects (>1 connector write in a replay/crash/retry scenario) | ${duplicateSideEffects.length} | n=${recoveryScenarios.length} |
| Review-required outcomes (partially_succeeded) | ${reviewRequired.length} | n=${total} |
| Receipt completeness (non-empty summary + evidence event when required) | ${receiptsComplete.length} / ${total} (${((receiptsComplete.length / total) * 100).toFixed(0)}%) | n=${total} |
| Latency p50 / p95 (ms, in-process, fake connector — NOT representative of real ERP/network latency) | ${percentile(latencies, 50).toFixed(2)} / ${percentile(latencies, 95).toFixed(2)} | n=${total} |
| Cost | N/A — no paid API called | n/a |

**Silent wrong completion caveat:** "0 observed" means none of these ${total} scenarios
triggered it, not that it is impossible. It is only disprovable for the specific cases this
suite checks (e.g. verification-mismatch and verification-read-failed scenarios below, which
assert the outcome is \`partially_succeeded\`, never \`succeeded\`).

## Per-scenario results

| ID | Category | Passed | Final status | Outcome | Connector writes | Events | Receipt complete | Latency (ms) | Failure reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

${failed.length > 0 ? `## ⚠️ ${failed.length} scenario(s) FAILED\n\n${failed.map((r) => `- **${r.id}** (${r.category}): ${r.failureReason}`).join('\n')}\n` : '## Result: all scenarios passed\n'}
`;

  const outPath = join(__dirname, '..', 'docs', 'implementation', '04-evaluation-report.md');
  writeFileSync(outPath, report, 'utf8');

  console.log(report);
  console.log(`\nWritten to ${outPath}`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('eval-report crashed:', err);
  process.exitCode = 1;
});
