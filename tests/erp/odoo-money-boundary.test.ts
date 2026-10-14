import { afterEach, describe, expect, it, vi } from 'vitest';
import { Odoo19Connector } from '@/server/erp/odoo-connector';

function mockRpc(records: unknown[]) {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ result: 7 }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ result: records }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Odoo financial amount boundary', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds decimal strings exactly and returns amounts as strings', async () => {
    mockRpc([
      { id: 1, amount_total: 0.1, currency_id: [1, 'EGP'] },
      { id: 2, amount_total: 0.2, currency_id: [1, 'EGP'] },
    ]);
    const result = await new Odoo19Connector({ url: 'https://example.test', db: 'test', username: 'bot', apiKeyOrPassword: 'secret', operatorId: 'test' }).getSalesSummary({});
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ totalRevenue: '0.30', currency: 'EGP' });
    expect(typeof result.data?.orders[0].amount_total).toBe('string');
  });

  it('refuses to collapse multiple currencies into one total', async () => {
    mockRpc([
      { id: 1, amount_total: 10, currency_id: [1, 'EGP'] },
      { id: 2, amount_total: 20, currency_id: [2, 'USD'] },
    ]);
    const result = await new Odoo19Connector({ url: 'https://example.test', db: 'test', username: 'bot', apiKeyOrPassword: 'secret', operatorId: 'test' }).getSalesSummary({});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SALES_FETCH_ERROR');
  });
});
