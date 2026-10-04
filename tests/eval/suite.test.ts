import { describe, expect, it } from 'vitest';
import { buildScenarios, SUITE_VERSION } from '@/server/eval/scenarios';

/**
 * Runs the versioned evaluation suite (src/server/eval/scenarios.ts) as real
 * vitest cases, so "the eval suite passes" is independently verifiable the
 * same way as every other test in this repo — not a narrative claim.
 *
 * For the human-readable metrics report (latency, write counts, receipt
 * completeness, aggregated pass rate), run `npm run eval:report`, which
 * drives the exact same scenario functions and writes
 * docs/implementation/04-evaluation-report.md.
 */
describe(`agent evaluation suite (version ${SUITE_VERSION})`, () => {
  const scenarios = buildScenarios();

  it('builds at least one scenario per required Phase-4 category this slice can cover', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(14);
  });

  for (const scenario of scenarios) {
    it(`[${scenario.category}] ${scenario.id}: ${scenario.description}`, async () => {
      const result = await scenario.exec();
      expect(result.passed, `${result.failureReason ?? 'unknown failure'} (final status: ${result.finalStatus})`).toBe(true);
    });
  }
});
