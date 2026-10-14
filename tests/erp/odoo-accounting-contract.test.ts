import { describe, expect, it } from 'vitest';
import { toOdooMoveType } from '@/server/accounting/types';

describe('canonical accounting documents', () => {
  it('maps customer invoices and vendor bills to distinct Odoo move types', () => {
    expect(toOdooMoveType({ documentKind: 'customer_invoice', partnerRole: 'customer' })).toBe('out_invoice');
    expect(toOdooMoveType({ documentKind: 'vendor_bill', partnerRole: 'vendor' })).toBe('in_invoice');
  });

  it('refuses missing or conflicting partner semantics', () => {
    expect(() => toOdooMoveType({ documentKind: 'vendor_bill', partnerRole: 'customer' })).toThrow();
    expect(() => toOdooMoveType({ documentKind: 'customer_invoice', partnerRole: null })).toThrow();
  });
});
