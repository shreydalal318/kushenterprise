/** Phase 4 input schemas: orders, proformas, invoices, credit notes, payments. */
import { z } from 'zod';
import { DISPATCH_METHODS, INVOICE_COPIES, ORDER_STATUSES, PAYMENT_MODES } from '@kush/core';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date');
const optDate = z.union([z.null(), z.literal('').transform(() => null), isoDate]).optional().transform((v) => v ?? null);
const optText = (max = 200) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const id = z.string().min(1);
const serials = z.array(z.string().trim().max(40)).max(500).optional();
const money = z.coerce.number().min(0).max(99_99_99_999).transform((n) => Math.round(n * 100) / 100);

export const orderCreateInput = z.object({
  customerId: z.string().min(1, 'Choose the customer'),
  forDoctorId: id.nullable().optional(),
  shippingAddressId: id.nullable().optional(),
  customerNote: optText(1000),
  patientName: optText(120),
  surgeryDate: optDate,
  assignedToId: id.nullable().optional(),
  clientRequestId: z.string().max(80).optional(),
  lines: z.array(z.object({ variantId: id, qty: z.coerce.number().int().min(1).max(10000) })).min(1, 'Add at least one item').max(300),
});

export const orderListInput = z.object({
  /** TO_INVOICE = placed or confirmed: still waiting for its tax invoice. */
  status: z.enum([...ORDER_STATUSES, 'TO_INVOICE']).optional(),
  customerId: z.string().optional(),
  assignedToId: z.string().optional(),
  /** Orders nobody has been chosen to handle yet. */
  unassigned: z.boolean().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(60).optional(),
  limit: z.number().int().min(1).max(500).default(200),
}).optional();

export const orderStatusInput = z.object({
  id,
  status: z.enum(ORDER_STATUSES),
  note: optText(300),
  dispatch: z.object({
    method: z.enum(DISPATCH_METHODS).default('COURIER'), courier: optText(80), docketNo: optText(60), vehicleNo: optText(30), dispatchDate: isoDate, invoiceId: id.optional(),
    deliveryPersonId: id.nullable().optional(), deliveryPersonName: optText(80), deliveryPersonMobile: optText(20),
  }).optional().nullable(),
  delivery: z.object({ receivedBy: optText(80), note: optText(300) }).optional().nullable(),
});

const saleLine = z.object({
  variantId: id,
  qty: z.coerce.number().int().min(1).max(10000),
  discPct: z.coerce.number().min(0).max(100).default(0),
  rate: z.union([z.null(), money]).optional(),
  batchId: id.nullable().optional(),
  serialNos: serials,
});

export const invoiceCreateInput = z.object({
  customerId: z.string().min(1, 'Choose the customer'),
  forDoctorId: id.nullable().optional(),
  shippingAddressId: id.nullable().optional(),
  date: isoDate,
  orderId: id.nullable().optional(),
  paymentTerms: optText(80),
  deliveryNote: optText(60),
  referenceNo: optText(80),
  otherReferences: optText(80),
  buyersOrderNo: optText(60),
  buyersOrderDate: optDate,
  dispatchDocNo: optText(60),
  dispatchedThrough: optText(80),
  destination: optText(80),
  termsOfDelivery: optText(300),
  clientRequestId: z.string().max(80).optional(),
  lines: z.array(saleLine).min(1, 'Add at least one item').max(300),
});

export const proformaCreateInput = z.object({
  customerId: z.string().min(1, 'Choose the customer'),
  forDoctorId: id.nullable().optional(),
  shippingAddressId: id.nullable().optional(),
  date: isoDate,
  validUntil: optDate,
  orderId: id.nullable().optional(),
  terms: optText(2000),
  lines: z.array(saleLine.pick({ variantId: true, qty: true, discPct: true, rate: true })).min(1, 'Add at least one item').max(300),
});

export const proformaConvertInput = z.object({
  id,
  date: isoDate,
  lines: z.array(z.object({ variantId: id, batchId: id.nullable().optional(), serialNos: serials })).optional(),
});

export const cancelInput = z.object({ id, reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(300) });

export const creditNoteCreateInput = z.object({
  invoiceId: id,
  date: isoDate,
  reason: z.string().trim().min(3, 'Give a reason').max(200),
  restock: z.boolean().default(true),
  lines: z.array(z.object({ invoiceLineId: id, qty: z.coerce.number().int().min(0), serialNos: serials })).min(1),
});

export const paymentCreateInput = z.object({
  customerId: z.string().min(1, 'Choose the customer'),
  date: isoDate,
  amount: money.refine((n) => n > 0, 'Enter the amount received'),
  mode: z.enum(PAYMENT_MODES),
  reference: optText(80),
  note: optText(300),
  /** Cash / bank ledger it went into (accounts); default Cash for cash, else the default bank. */
  ledgerId: id.nullable().optional(),
  autoAllocate: z.boolean().default(false),
  allocations: z.array(z.object({ invoiceId: id, amount: money })).max(200).optional(),
});
export const paymentAllocateInput = z.object({ paymentId: id, allocations: z.array(z.object({ invoiceId: id, amount: money })).min(1).max(200) });

export const docListInput = z.object({
  customerId: z.string().optional(),
  status: z.string().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(60).optional(),
  limit: z.number().int().min(1).max(500).default(200),
}).optional();

export const copiesSchema = z.array(z.enum(INVOICE_COPIES)).min(1).max(3);
