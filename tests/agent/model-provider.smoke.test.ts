import { describe, expect, it } from 'vitest';
import { KiosApiModelProvider } from '@/server/agent/model-provider';

const live = process.env.WAKEEL_LIVE_EVAL === '1';

describe('KiosAPI live synthetic smoke', () => {
  it.skipIf(!live)('supports a bounded tool-call selection with synthetic data only', async () => {
    const provider = new KiosApiModelProvider();
    const output = await provider.completeTurn({
      messages: [
        { role: 'system', content: 'Use the available function for this request. Do not invent or discuss ERP data.' },
        { role: 'user', content: 'Call get_sales_summary for 2026-01-01 through 2026-01-31. This is a synthetic tool-call protocol check.' },
      ],
      tools: [{
        name: 'get_sales_summary',
        description: 'Read a synthetic sales summary.',
        parameters: {
          type: 'object',
          properties: { dateFrom: { type: 'string', format: 'date' }, dateTo: { type: 'string', format: 'date' } },
          required: ['dateFrom', 'dateTo'], additionalProperties: false,
        },
      }],
      allowToolCalls: true,
    });

    expect(output.type).toBe('tool_calls');
    if (output.type === 'tool_calls') expect(output.calls[0]).toMatchObject({ name: 'get_sales_summary' });
  }, 45_000);
});
