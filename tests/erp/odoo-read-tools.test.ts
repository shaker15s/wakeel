import { describe, expect, it, vi } from 'vitest';
import { Odoo19Connector } from '@/server/erp/odoo-connector';

describe('Odoo accounting report capability gate', () => {
  it('keeps unverified account models unavailable without making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const connector = new Odoo19Connector({ url: 'https://example.test', db: 'test', username: 'bot', apiKeyOrPassword: 'secret', operatorId: 'test' });
    await expect(connector.getChartOfAccounts()).resolves.toMatchObject({ success: false, error: { code: 'ACCOUNTING_SCHEMA_UNVERIFIED' } });
    await expect(connector.getTrialBalance({ dateTo: '2026-02-01', currency: 'EGP' })).resolves.toMatchObject({ success: false, error: { code: 'ACCOUNTING_SCHEMA_UNVERIFIED' } });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
