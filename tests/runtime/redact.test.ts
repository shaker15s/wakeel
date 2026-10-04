import { describe, expect, it } from 'vitest';
import { redact, REDACTED_PLACEHOLDER } from '@/server/runtime/redact';
import { InMemoryTaskStore } from '@/server/runtime/memory-store';

describe('redact() — unit', () => {
  it('redacts top-level keys that look like secrets, case-insensitively', () => {
    const out = redact({ password: 'hunter2', Password: 'x', API_KEY: 'sk-abc', token: 'jwt', safe: 'keep-me' });
    expect(out).toEqual({ password: REDACTED_PLACEHOLDER, Password: REDACTED_PLACEHOLDER, API_KEY: REDACTED_PLACEHOLDER, token: REDACTED_PLACEHOLDER, safe: 'keep-me' });
  });

  it('redacts nested keys inside objects and arrays', () => {
    const out = redact({
      connector: { config: { apiKeyOrPassword: 'super-secret', serverUrl: 'https://erp.example.com' } },
      lines: [{ description: 'fine', unitPrice: 10 }, { description: 'also fine', credential: 'nope' }],
    });
    expect(out).toEqual({
      connector: { config: { apiKeyOrPassword: REDACTED_PLACEHOLDER, serverUrl: 'https://erp.example.com' } },
      lines: [{ description: 'fine', unitPrice: 10 }, { description: 'also fine', credential: REDACTED_PLACEHOLDER }],
    });
  });

  it('matches common variants: api-key, api_key, accessKey, privateKey, authorization', () => {
    const out = redact({ 'api-key': 1, api_key: 2, accessKey: 3, privateKey: 4, authorization: 5, unrelated: 6 });
    expect(out).toEqual({
      'api-key': REDACTED_PLACEHOLDER,
      api_key: REDACTED_PLACEHOLDER,
      accessKey: REDACTED_PLACEHOLDER,
      privateKey: REDACTED_PLACEHOLDER,
      authorization: REDACTED_PLACEHOLDER,
      unrelated: 6,
    });
  });

  it('leaves primitives, null, undefined, and Date instances untouched', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    expect(redact('plain string')).toBe('plain string');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
    expect(redact(undefined)).toBe(undefined);
    expect(redact(d)).toBe(d);
  });

  it('does not redact a secret-looking key whose value is null/undefined (nothing to leak)', () => {
    expect(redact({ password: null, token: undefined })).toEqual({ password: null, token: undefined });
  });
});

describe('redact() — enforced at the actual persistence boundary', () => {
  it('InMemoryTaskStore.appendEvent() redacts the payload before it is ever readable via listEvents()', async () => {
    const store = new InMemoryTaskStore();
    const task = await store.createTask({
      id: 'task-redact-1',
      tenantId: 'tenant-a',
      actorId: 'actor-1',
      workflowType: 'create_draft_invoice',
      riskClass: 'LOW',
      input: {},
      deadline: new Date(Date.now() + 1000 * 60),
    });

    await store.appendEvent({
      taskId: task.id,
      type: 'task_status_changed',
      actorType: 'system',
      payload: {
        // Simulates a future bug/change that accidentally puts a connector
        // config (or similar) into an event payload.
        connectorConfig: { apiKeyOrPassword: 'sk-live-should-never-appear', serverUrl: 'https://erp.example.com' },
        note: 'this part is fine',
      },
    });

    const events = await store.listEvents(task.id);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('sk-live-should-never-appear');
    expect(events[0].payload).toEqual({
      connectorConfig: { apiKeyOrPassword: REDACTED_PLACEHOLDER, serverUrl: 'https://erp.example.com' },
      note: 'this part is fine',
    });
  });
});
