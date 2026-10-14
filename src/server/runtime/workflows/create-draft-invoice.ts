import { z } from 'zod';

/**
 * The one workflow this milestone implements end-to-end, per
 * docs/implementation/01-mvp-decision.md: vendor-bill fields -> validate ->
 * policy check -> mandatory human approval -> idempotent Odoo draft invoice
 * creation -> read-after-write verification.
 */
export const WORKFLOW_TYPE = 'create_draft_invoice' as const;

export const createDraftInvoiceInputSchema = z.object({
  customerId: z.union([z.string().trim().max(100), z.number().finite()]).refine((v) => String(v).trim().length > 0, {
    message: 'customerId must not be empty',
  }),
  lines: z
    .array(
      z.object({
        productId: z.union([z.string().trim().max(100), z.number().finite()]).optional(),
        description: z.string().trim().min(1, 'line description must not be empty').max(500),
        quantity: z.number().positive('quantity must be > 0'),
        unitPrice: z.number().nonnegative('unitPrice must be >= 0'),
      }),
    )
    .min(1, 'at least one line is required').max(100),
  memo: z.string().max(4000).optional(),
}).refine(input => Number.isFinite(input.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0)) && input.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0) <= 1e12, { message: 'Invoice total exceeds the supported limit' });

export type CreateDraftInvoiceInput = z.infer<typeof createDraftInvoiceInputSchema>;

/** Steps run in exactly this order; `advance()` resumes from the first non-terminal one. */
export const CREATE_DRAFT_INVOICE_STEPS = [
  'validate_input',
  'policy_check',
  'await_approval',
  'execute_write',
  'verify',
] as const;

export type CreateDraftInvoiceStepName = (typeof CREATE_DRAFT_INVOICE_STEPS)[number];

export function computeInvoiceAmount(input: CreateDraftInvoiceInput): number {
  return input.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
}
