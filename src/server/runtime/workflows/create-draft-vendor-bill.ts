import { z } from 'zod';
import { createMoney, MoneyMath } from '@/server/accounting/money';

const decimal = z.string().trim().regex(/^(0|[1-9]\d*)(\.\d{1,8})?$/).max(40);
const positiveQuantity = decimal.refine((value) => BigInt(value.replace('.', '')) > BigInt(0), 'Quantity must be greater than zero.');
export const WORKFLOW_TYPE = 'create_draft_vendor_bill' as const;
export const CREATE_DRAFT_VENDOR_BILL_STEPS = ['validate_input', 'policy_check', 'await_approval', 'execute_write', 'verify'] as const;

export const createDraftVendorBillInputSchema = z.object({
  vendorId: z.union([z.string().trim().min(1).max(128), z.number().int().positive()]),
  vendorBillReference: z.string().trim().min(1).max(128),
  billDate: z.string().date(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/),
  lines: z.array(z.object({ description: z.string().trim().min(1).max(300), quantity: positiveQuantity, unitPrice: decimal }).strict()).min(1).max(100),
}).strict().superRefine((input, context) => {
  const directive = /(?:ignore|override|bypass|reveal|execute|call)\s+(?:all\s+)?(?:previous|prior|system|developer)?\s*(?:instructions?|polic(?:y|ies)|tools?|approvals?)/i;
  const arabicDirective = /(?:تجاهل|تجاوز|اكشف|نفذ)\s*(?:كل|جميع)?\s*(?:التعليمات|السياسات|الموافقات)/;
  if (directive.test(input.vendorBillReference) || arabicDirective.test(input.vendorBillReference)) {
    context.addIssue({ code: 'custom', path: ['vendorBillReference'], message: 'Document reference contains an instruction-like directive.' });
  }
  input.lines.forEach((line, index) => {
    if (directive.test(line.description) || arabicDirective.test(line.description)) {
      context.addIssue({ code: 'custom', path: ['lines', index, 'description'], message: 'Line description contains an instruction-like directive.' });
    }
  });
});

export type CreateDraftVendorBillInput = z.infer<typeof createDraftVendorBillInputSchema>;

export function computeVendorBillAmount(input: CreateDraftVendorBillInput) {
  const currency = input.currency.toUpperCase();
  const scale = input.lines.length ? createMoney('0', currency).scale : 2;
  return input.lines.reduce((total, line) => MoneyMath.add(total, MoneyMath.multiply(createMoney(line.unitPrice, currency), line.quantity, scale)), createMoney('0', currency, scale));
}
