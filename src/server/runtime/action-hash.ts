import { createHash } from 'crypto';

/**
 * Stable action hash binding an approval to the EXACT action: tool, its
 * normalized parameters, the policy version that evaluated it, and the
 * resource it targets. Any change to any of these invalidates the hash —
 * this is what "approval bound to exact action hash... any material change
 * invalidates the approval" (PRD §9) actually means, not a slogan.
 */
export interface ActionHashInput {
  toolName: string;
  normalizedParams: unknown;
  policyVersion: string;
  resourceRef: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = canonicalize(v);
    return out;
  }
  return value;
}

export function computeActionHash(input: ActionHashInput): string {
  const canonical = canonicalize(input);
  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}
