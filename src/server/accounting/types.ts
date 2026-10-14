export type AccountingDocumentKind = 'customer_invoice' | 'vendor_bill';
export type AccountingPartnerRole = 'customer' | 'vendor' | null;
export type OdooMoveType = 'out_invoice' | 'in_invoice';

export function toOdooMoveType(input: { documentKind: AccountingDocumentKind; partnerRole: AccountingPartnerRole }): OdooMoveType {
  if (input.documentKind === 'customer_invoice' && input.partnerRole === 'customer') return 'out_invoice';
  if (input.documentKind === 'vendor_bill' && input.partnerRole === 'vendor') return 'in_invoice';
  throw new Error('Accounting document and partner role are missing or inconsistent; manual review is required.');
}
