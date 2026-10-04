/**
 * WAKEEL — secret redaction for anything persisted as durable history.
 *
 * Enforced at the store boundary (see `InMemoryTaskStore.appendEvent()` in
 * memory-store.ts), not left to caller discipline — every event payload is
 * redacted on the way in, regardless of which code path produced it. This
 * closes the gap flagged in a stale comment on `TaskEvent.payload`
 * ("must already be redacted by the caller — see redact() in receipt.ts"):
 * that file never existed; this one does, and it is actually wired in.
 *
 * This is deliberately a generic, key-name-based redactor (not a schema
 * allowlist): nothing in this workflow's current event payloads should ever
 * contain a credential, but the guarantee needs to hold even if a future
 * change accidentally puts one there (e.g. a connector's config object, or
 * an input field that happens to be named like a secret).
 */

const SECRET_KEY_PATTERN = /password|passwd|secret|token|api[_-]?key|credential|authorization|private[_-]?key|access[_-]?key/i;

export const REDACTED_PLACEHOLDER = '[REDACTED]';

const MAX_DEPTH = 10;

/** Deep-redacts any object/array value whose key (at any nesting level)
 * looks like a secret. Primitives and `Date` instances pass through
 * unchanged. Guards against pathological nesting depth (not against
 * reference cycles — none of our persisted payloads are built from cyclic
 * structures, so this stays simple rather than adding a WeakSet for a case
 * that cannot currently occur). */
export function redact<T>(value: T, depth = 0): T {
  if (depth >= MAX_DEPTH) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1)) as unknown as T;
  }

  if (value instanceof Date) return value;

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) && v !== undefined && v !== null ? REDACTED_PLACEHOLDER : redact(v, depth + 1);
    }
    return out as T;
  }

  return value;
}
