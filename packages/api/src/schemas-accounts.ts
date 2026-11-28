/** Accounts input schemas: ledgers, manual vouchers, purchase bills, supplier payments, reports. */
import { z } from 'zod';
import { ACCOUNT_GROUP_KEYS, isValidIfsc, MANUAL_VOUCHER_TYPES, PAYMENT_MODES, VOUCHER_TYPES } from '@kush/core';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date');
const optDate = z.union([z.null(), z.literal('').transform(() => null), isoDate]).optional().transform((v) => v ?? null);
const optText = (max = 200) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const id = z.string().min(1);
const LIMIT = 99_99_99_99_999;
const round = (n: number) => Math.round(n * 100) / 100;
const money = z.coerce.number().min(0).max(LIMIT).transform(round);
/** + Debit, − Credit. */
const signed = z.coerce.number().min(-LIMIT).max(LIMIT).transform(round);

export const ledgerCreateInput = z.object({
  name: z.string().trim().min(2, 'Enter a ledger name').max(100),
  group: z.enum(ACCOUNT_GROUP_KEYS as [string, ...string[]], { message: 'Choose a group' }),
  /** As on the books start date: + Dr, − Cr. */
  openingBalance: signed.default(0),
  bankAccountNo: optText(40),
  bankIfsc: optText(20).transform((v) => (v ? v.toUpperCase() : null)).refine((v) => !v || isValidIfsc(v), 'IFSC must look like HDFC0001234'),
  note: optText(300),
});
export const ledgerUpdateInput = ledgerCreateInput.extend({ id, isActive: z.boolean().default(true) });
export const ledgerListInput = z.object({
  group: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  /** Cash and bank only, for "paid from" / "received into" pickers. */
  cashBank: z.boolean().optional(),
  includeInactive: z.boolean().default(false),
}).optional();

export const manualVoucherInput = z.object({
  type: z.enum(MANUAL_VOUCHER_TYPES),
  date: isoDate,
  narration: optText(500),
  entries: z.array(z.object({ ledgerId: id, amount: signed })).min(2, 'Add a debit and a credit line').max(100),
});
export const voucherListInput = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  type: z.enum(VOUCHER_TYPES).optional(),
  ledgerId: z.string().optional(),
  limit: z.number().int().min(1).max(2000).default(500),
}).optional();
export const voucherCancelInput = z.object({ id, reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(300) });

export const purchaseBillInput = z.object({
  supplierId: z.string().min(1, 'Choose the supplier'),
  billNo: z.string().trim().min(1, "Enter the supplier's bill number").max(60),
  billDate: isoDate,
  dueDate: optDate,
  grnId: id.nullable().optional(),
  note: optText(500),
  billTotal: z.union([z.null(), money]).optional(),
  lines: z.array(z.object({
    variantId: id.nullable().optional(),
    ledgerId: id.nullable().optional(),
    description: optText(200),
    hsnCode: optText(10),
    qty: z.union([z.null(), z.coerce.number().positive().max(10_000_000)]).optional(),
    unit: optText(20),
    rate: money,
    discPct: z.coerce.number().min(0).max(100).default(0),
    gstRate: z.union([z.null(), z.coerce.number().min(0).max(40)]).optional(),
  }).refine((l) => !!l.variantId !== !!l.ledgerId, { message: 'Choose an item or a ledger' })).min(1, 'Add at least one line').max(500),
});
export const purchaseBillListInput = z.object({
  supplierId: z.string().optional(),
  status: z.enum(['ISSUED', 'CANCELLED', 'UNPAID']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(60).optional(),
  limit: z.number().int().min(1).max(500).default(200),
}).optional();

export const supplierPaymentInput = z.object({
  supplierId: z.string().min(1, 'Choose the supplier'),
  date: isoDate,
  amount: money.refine((n) => n > 0, 'Enter the amount paid'),
  mode: z.enum(PAYMENT_MODES),
  ledgerId: id.nullable().optional(),
  reference: optText(80),
  note: optText(300),
  autoAllocate: z.boolean().default(false),
  allocations: z.array(z.object({ billId: id, amount: money })).max(200).optional(),
});
export const supplierPaymentListInput = z.object({
  supplierId: z.string().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.number().int().min(1).max(500).default(200),
}).optional();

export const ledgerReportInput = z.object({ ledgerId: id, from: isoDate.optional(), to: isoDate.optional() });
export const trialBalanceInput = z.object({ asOf: isoDate.optional() }).optional();
