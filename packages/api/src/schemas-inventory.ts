/** Phase 3 input schemas: receipts, adjustments, returns, stock queries, scanning. */
import { z } from 'zod';
import { ADJUSTMENT_REASONS } from '@kush/core';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date');
const optDate = z.union([z.null(), z.literal('').transform(() => null), isoDate]).optional().transform((v) => v ?? null);
const optText = (max = 200) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const serials = z.array(z.string().trim().max(40)).max(1000).default([]).transform((a) => a.filter(Boolean));
const optMoney = z.union([z.null(), z.literal('').transform(() => null), z.coerce.number().min(0).max(99_99_99_999)]).optional().transform((v) => v ?? null);

export const receiptLineInput = z.object({
  variantId: z.string().min(1),
  batchNo: optText(40),
  expiryDate: optDate,
  mfgDate: optDate,
  serialNos: serials,
  qty: z.coerce.number().int().min(1, 'At least 1').max(100_000),
  rate: optMoney, // purchase rate; only honoured for users who may see costs
});

export const grnCreateInput = z.object({
  supplierId: z.string().min(1, 'Choose the supplier'),
  date: isoDate,
  supplierInvoiceNo: optText(60),
  supplierInvoiceDate: optDate,
  locationId: z.string().min(1).optional(),
  note: optText(500),
  lines: z.array(receiptLineInput).min(1, 'Add at least one item').max(500),
});

export const openingStockInput = z.object({
  date: isoDate,
  locationId: z.string().min(1).optional(),
  note: optText(500),
  lines: z.array(receiptLineInput).min(1, 'Add at least one item').max(2000),
});

export const adjustInput = z.object({
  variantId: z.string().min(1),
  batchId: z.string().min(1).optional(), // existing batch (required to reduce stock)
  batchNo: optText(40), // or a new batch when adding stock
  expiryDate: optDate,
  locationId: z.string().min(1).optional(),
  qty: z.coerce.number().int().refine((n) => n !== 0, 'Enter a quantity to add (+) or remove (−)'),
  reason: z.enum(ADJUSTMENT_REASONS, { message: 'Choose a reason' }),
  note: optText(500),
  serialNos: serials,
}).refine((v) => v.qty > 0 || !!v.batchId, { message: 'Choose the batch to reduce', path: ['batchId'] });

export const supplierReturnInput = z.object({
  supplierId: z.string().min(1, 'Choose the supplier'),
  date: isoDate,
  reason: z.string().trim().min(3, 'Give a reason').max(200),
  note: optText(500),
  lines: z.array(z.object({
    variantId: z.string().min(1),
    batchId: z.string().min(1),
    locationId: z.string().min(1).optional(),
    qty: z.coerce.number().int().min(1),
    serialNos: serials,
  })).min(1).max(500),
});

export const stockOverviewInput = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.string().optional(),
  status: z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'EXPIRING_SOON']).optional(),
  onlyInStock: z.boolean().default(false),
}).optional();

export const ledgerInput = z.object({
  variantId: z.string().min(1),
  from: isoDate.optional(),
  to: isoDate.optional(),
  locationId: z.string().optional(),
});

export const scanInput = z.object({ code: z.string().trim().min(1).max(500), locationId: z.string().optional() });
export const mapAliasInput = z.object({ code: z.string().trim().min(3).max(500), variantId: z.string().min(1) });

export const locationInput = z.object({ name: z.string().trim().min(2).max(60) });
