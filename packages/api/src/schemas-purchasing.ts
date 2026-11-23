/** Phase 5 input schemas: purchase orders. */
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date');
const optDate = z.union([z.null(), z.literal('').transform(() => null), isoDate]).optional().transform((v) => v ?? null);
const optText = (max = 200) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const money = z.coerce.number().min(0).max(99_99_99_999).transform((n) => Math.round(n * 100) / 100);

export const poInput = z.object({
  supplierId: z.string().min(1, 'Choose the supplier'),
  date: isoDate,
  expectedDate: optDate,
  terms: optText(2000),
  note: optText(300),
  lines: z.array(z.object({
    variantId: z.string().min(1),
    qty: z.coerce.number().int().min(1, 'At least 1').max(100000),
    rate: z.union([z.null(), money]).optional(),
    discPct: z.coerce.number().min(0).max(100).default(0),
    expectedDate: optDate,
  })).min(1, 'Add at least one item').max(500),
});

export const poListInput = z.object({
  status: z.enum(['DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED', 'OPEN']).optional(),
  supplierId: z.string().optional(),
  q: z.string().trim().max(60).optional(),
}).optional();

export const poReasonInput = z.object({ id: z.string().min(1), reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(300) });
