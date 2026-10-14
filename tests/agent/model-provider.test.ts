import { describe, expect, it, vi } from 'vitest';
import { KiosApiModelProvider, financeModelTools } from '@/server/agent/model-provider';

const input = { messages: [{ role: 'user' as const, content: 'Show sales.' }], tools: financeModelTools(), allowToolCalls: true };

describe('KiosAPI OpenAI-compatible provider', () => {
  it('sends the selected free model, registered functions, and bearer key to the configured base URL', async () => {
    let requestUrl = '';
    let init: RequestInit | undefined;
    const fetcher = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
      requestUrl = String(url);
      init = options;
      return Response.json({ choices: [{ message: { role: 'assistant', content: 'Here is the summary.' } }] });
    });
    const provider = new KiosApiModelProvider({ baseUrl: 'https://kiosapi.com/v1/', apiKey: 'test-secret', model: 'deepseek-v4-flash-free' }, fetcher as typeof fetch);

    await expect(provider.completeTurn(input)).resolves.toEqual({ type: 'message', text: 'Here is the summary.' });
    expect(requestUrl).toBe('https://kiosapi.com/v1/chat/completions');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-secret');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('deepseek-v4-flash-free');
    expect(body.tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual(expect.arrayContaining(['get_sales_summary', 'search_customers']));
    expect(body.parallel_tool_calls).toBe(false);
  });

  it('parses native tool calls but leaves arguments for server schema validation', async () => {
    const fetcher = vi.fn(async () => Response.json({ choices: [{ message: {
      content: null,
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'get_sales_summary', arguments: '{"dateFrom":"invalid"}' } }],
    } }] }));
    const provider = new KiosApiModelProvider({ apiKey: 'test-secret' }, fetcher as typeof fetch);

    await expect(provider.completeTurn(input)).resolves.toEqual({
      type: 'tool_calls', calls: [{ callId: 'call-1', name: 'get_sales_summary', arguments: { dateFrom: 'invalid' } }],
    });
  });

  it('does not send tool definitions when the runtime disables tool calls', async () => {
    let body: Record<string, unknown> = {};
    const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      body = JSON.parse(String(options?.body));
      return Response.json({ choices: [{ message: { content: 'A bounded final answer.' } }] });
    });
    const provider = new KiosApiModelProvider({ apiKey: 'test-secret' }, fetcher as typeof fetch);

    await provider.completeTurn({ ...input, allowToolCalls: false });
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
  });

  it('returns redacted transport errors without echoing a provider body', async () => {
    const fetcher = vi.fn(async () => new Response('sensitive diagnostic', { status: 500 }));
    const provider = new KiosApiModelProvider({ apiKey: 'test-secret' }, fetcher as typeof fetch);

    await expect(provider.completeTurn(input)).rejects.toThrow('HTTP 500');
    await expect(provider.completeTurn(input)).rejects.not.toThrow('sensitive diagnostic');
  });
});
