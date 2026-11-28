import { TRPCError } from '@trpc/server';
import { computeGst, dueDateFor, financialYear, round2 } from '@kush/core';
import type { Tx } from '@kush/db';
import { postInvoice } from '../accounts/posting';
import { logActivity } from '../activity';
import { dayToDate, num } from '../num';
import { nextDocNumber } from '../numbering';
import { resolveCustomerPrices } from '../pricing';

import { postMovement, loadVariant } from '../stock';
import { allocateLine, customerForDocument, requireCompanyState, supplierSnapshot } from './common';
import { notifyCustomer } from '../../notify';
import { shareUrl } from '../integrations/share';

export interface InvoiceLineInput {
  variantId: string;
  qty: number;
  discPct?: number;
  rate?: number | null; // honoured only for the owner, or from a trusted source (order / proforma)
  batchId?: string | null;
  serialNos?: string[];
}

export interface InvoiceInput {
  customerId: string;
  forDoctorId?: string | null;
  shippingAddressId?: string | null;
  date: string;
  orderId?: string | null;
  proformaId?: string | null;
  paymentTerms?: string | null;
  deliveryNote?: string | null;
  referenceNo?: string | null;
  otherReferences?: string | null;
  buyersOrderNo?: string | null;
  buyersOrderDate?: string | null;
  dispatchDocNo?: string | null;
  dispatchedThrough?: string | null;
  destination?: string | null;
  termsOfDelivery?: string | null;
  clientRequestId?: string | null;
  lines: InvoiceLineInput[];
}

/**
 * Issue a tax invoice: snapshot parties, price each line at the customer's price (special →
 * list → default), take stock from the scanned/chosen batch or FEFO, mark serials sold, compute
 * GST (CGST+SGST if the ship-to state is the company's state, else IGST) and number it per FY.
 */
export async function createInvoice(tx: Tx, input: InvoiceInput, actor: { id: string; isOwner: boolean }, opts: { trustedRates?: boolean; ip?: string | null } = {}) {
  if (input.clientRequestId) {
    const dup = await tx.invoice.findUnique({ where: { clientRequestId: input.clientRequestId }, select: { id: true, number: true, grandTotal: true } });
    if (dup) return { id: dup.id, number: dup.number, total: num(dup.grandTotal), duplicate: true };
  }
  if (!input.lines.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add at least one item' });
  const settings = await requireCompanyState(tx);
  const doc = await customerForDocument(tx, input.customerId, input);
  const variants = await Promise.all(input.lines.map((l) => loadVariant(tx, l.variantId)));
  const prices = await resolveCustomerPrices(tx, input.customerId, [...new Set(variants.map((v) => v.productId))], input.date);

  type Built = { variant: (typeof variants)[number]; rate: number; discPct: number; alloc: Awaited<ReturnType<typeof allocateLine>>[number] };
  const built: Built[] = [];
  for (const [i, l] of input.lines.entries()) {
    const v = variants[i]!;
    if (!v.isActive || !v.product.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: `${v.product.name} ${v.label ?? ''} is inactive` });
    if (!Number.isInteger(l.qty) || l.qty < 1) throw new TRPCError({ code: 'BAD_REQUEST', message: `Line ${i + 1}: quantity must be at least 1` });
    const resolved = prices.get(v.productId)!.rate;
    const rate = l.rate != null && (actor.isOwner || opts.trustedRates) ? round2(l.rate) : resolved;
    const discPct = Math.min(100, Math.max(0, l.discPct ?? 0));
    const mrp = num(v.mrp ?? v.product.mrp);
    if (rate > mrp) throw new TRPCError({ code: 'BAD_REQUEST', message: `${v.product.name} ${v.label ?? ''}: rate ₹${rate} is above MRP ₹${mrp}` });
    for (const alloc of await allocateLine(tx, v, l, input.date)) built.push({ variant: v, rate, discPct, alloc });
  }

  const supplier = supplierSnapshot(settings);
  const gst = computeGst(supplier.stateCode, doc.placeOfSupply, built.map((b) => ({ qty: b.alloc.qty, rate: b.rate, discPct: b.discPct, hsn: b.variant.product.hsnCode, gstRate: num(b.variant.product.gstRate) })));
  const inter = gst.taxType === 'INTER_STATE';
  const number = await nextDocNumber(tx, 'TAX_INVOICE', input.date);

  const invoice = await tx.invoice.create({
    data: {
      number, financialYear: financialYear(input.date), date: dayToDate(input.date)!,
      dueDate: dayToDate(dueDateFor(input.date, doc.customer.paymentTermsDays))!,
      taxType: gst.taxType, customerId: doc.customer.id, orderId: input.orderId ?? null, proformaId: input.proformaId ?? null,
      supplierSnapshot: supplier, buyerSnapshot: doc.buyer, consigneeSnapshot: doc.consignee, placeOfSupply: doc.placeOfSupply,
      paymentTerms: input.paymentTerms ?? (doc.customer.paymentTermsDays ? `${doc.customer.paymentTermsDays} days credit` : 'Immediate'),
      deliveryNote: input.deliveryNote ?? null, referenceNo: input.referenceNo ?? null, otherReferences: input.otherReferences ?? null,
      buyersOrderNo: input.buyersOrderNo ?? null, buyersOrderDate: dayToDate(input.buyersOrderDate ?? null),
      dispatchDocNo: input.dispatchDocNo ?? null, dispatchedThrough: input.dispatchedThrough ?? null, destination: input.destination ?? null,
      termsOfDelivery: input.termsOfDelivery ?? null, terms: settings.defaultInvoiceTerms,
      taxableTotal: gst.taxable, cgstTotal: gst.cgst, sgstTotal: gst.sgst, igstTotal: gst.igst, roundOff: gst.roundOff, grandTotal: gst.total,
      clientRequestId: input.clientRequestId ?? null, createdById: actor.id,
    },
  });

  for (const [i, b] of built.entries()) {
    const amount = gst.lines[i]!.amount;
    const rate = num(b.variant.product.gstRate);
    const line = await tx.invoiceLine.create({
      data: {
        invoiceId: invoice.id, sl: i + 1, variantId: b.variant.id, batchId: b.alloc.batchId,
        description: b.variant.product.name, hsnCode: b.variant.product.hsnCode, qty: b.alloc.qty, unit: b.variant.product.unit,
        rate: b.rate, discPct: b.discPct, amount, gstRate: rate,
        cgstAmount: inter ? 0 : round2((amount * rate) / 200), sgstAmount: inter ? 0 : round2((amount * rate) / 200), igstAmount: inter ? round2((amount * rate) / 100) : 0,
        costAtSale: b.alloc.unitCost, batchNo: b.alloc.batchNo, expiryDate: dayToDate(b.alloc.expiryDate), powerLabel: b.variant.label, serialNos: b.alloc.serialNos,
      },
    });
    await postMovement(tx, {
      type: 'SALE', variant: b.variant, batchId: b.alloc.batchId, locationId: b.alloc.locationId, qty: -b.alloc.qty, serialNos: b.alloc.serialNos,
      unitCost: b.alloc.unitCost, refType: 'Invoice', refId: invoice.id, note: number, actorId: actor.id,
    });
    if (b.alloc.serialNos.length) await tx.serialUnit.updateMany({ where: { batchId: b.alloc.batchId, serialNo: { in: b.alloc.serialNos } }, data: { invoiceLineId: line.id } });
  }

  if (input.orderId) await applyToOrder(tx, input.orderId, built.map((b) => ({ variantId: b.variant.id, qty: b.alloc.qty })), +1, actor.id);
  if (input.proformaId) await tx.proforma.update({ where: { id: input.proformaId }, data: { status: 'CONVERTED' } });
  await postInvoice(tx, invoice.id);

  await logActivity(tx, {
    actorId: actor.id, action: 'invoice.create', entityType: 'Invoice', entityId: invoice.id, ip: opts.ip,
    summary: `Tax invoice ${number} for ${doc.customer.name}: ₹${gst.total} (${gst.taxType === 'INTRA_STATE' ? 'CGST+SGST' : 'IGST'})`,
  });
  await notifyCustomer(tx, doc.customer.id, { title: `Invoice ${number}`, body: `₹${gst.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}, due ${dueDateFor(input.date, doc.customer.paymentTermsDays)}. Download it from your account.`, link: `/portal/invoices`, externalLink: shareUrl('invoice', invoice.id) });
  return { id: invoice.id, number, total: gst.total, duplicate: false };
}

/** Add (+1) or remove (−1) invoiced quantities on the order lines (back-order tracking). */
async function applyToOrder(tx: Tx, orderId: string, items: { variantId: string; qty: number }[], sign: 1 | -1, actorId?: string) {
  const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { lines: true } });
  if (!order) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Order not found' });
  if (order.status === 'CANCELLED' && sign > 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'That order is cancelled' });
  for (const it of items) {
    let left = it.qty;
    for (const l of order.lines.filter((x) => x.variantId === it.variantId)) {
      if (left <= 0) break;
      const room = sign > 0 ? Math.max(0, l.qty - l.qtyDispatched) : l.qtyDispatched;
      const take = Math.min(room, left);
      if (take > 0) {
        await tx.salesOrderLine.update({ where: { id: l.id }, data: { qtyDispatched: { increment: sign * take } } });
        l.qtyDispatched += sign * take;
        left -= take;
      }
    }
  }
  // Raising the invoice is also confirming and packing the order (the goods are picked for it),
  // so the counter goes straight from invoice to dispatch without separate status steps.
  if (sign > 0 && actorId && (order.status === 'PLACED' || order.status === 'CONFIRMED')) {
    const steps = order.status === 'PLACED' ? (['CONFIRMED', 'PACKED'] as const) : (['PACKED'] as const);
    await tx.salesOrder.update({
      where: { id: orderId },
      data: { status: 'PACKED', events: { create: steps.map((status) => ({ status, byUserId: actorId, note: 'With the tax invoice' })) } },
    });
  }
}

/** Invoices are never deleted: cancel with a reason, reverse the stock and the order quantities. */
export async function cancelInvoice(tx: Tx, id: string, reason: string, actor: { id: string }, ip?: string | null) {
  const inv = await tx.invoice.findUnique({ where: { id }, include: { lines: true, allocations: true, creditNotes: true } });
  if (!inv) throw new TRPCError({ code: 'NOT_FOUND' });
  if (inv.status === 'CANCELLED') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already cancelled' });
  if (inv.allocations.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Payments are applied to this invoice; remove them first' });
  if (inv.creditNotes.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'A credit note exists for this invoice; it cannot be cancelled' });
  await tx.invoice.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date(), cancelledById: actor.id } });
  // The Sales voucher stays on record, marked cancelled (out of every balance), as Tally does.
  await postInvoice(tx, id);
  // The order's only invoice cancelled: it is no longer packed for dispatch.
  if (inv.orderId && !(await tx.invoice.count({ where: { orderId: inv.orderId, status: 'ISSUED' } }))) {
    const ord = await tx.salesOrder.findUnique({ where: { id: inv.orderId }, select: { status: true } });
    if (ord?.status === 'PACKED') await tx.salesOrder.update({ where: { id: inv.orderId }, data: { status: 'CONFIRMED', events: { create: { status: 'CONFIRMED', byUserId: actor.id, note: `Invoice ${inv.number} cancelled` } } } });
  }
  const movements = await tx.stockMovement.findMany({ where: { refType: 'Invoice', refId: id, type: 'SALE' } });
  for (const m of movements) {
    const v = await loadVariant(tx, m.variantId);
    await postMovement(tx, { type: 'INVOICE_CANCEL', variant: v, batchId: m.batchId, locationId: m.locationId, qty: -m.qty, serialNos: m.serialNos, unitCost: m.unitCost == null ? null : num(m.unitCost), refType: 'Invoice', refId: id, note: `${inv.number} cancelled`, actorId: actor.id });
  }
  if (inv.orderId) await applyToOrder(tx, inv.orderId, inv.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })), -1);
  if (inv.proformaId) await tx.proforma.update({ where: { id: inv.proformaId }, data: { status: 'SENT' } });
  await logActivity(tx, { actorId: actor.id, action: 'invoice.cancel', entityType: 'Invoice', entityId: id, ip, summary: `Cancelled ${inv.number}: ${reason}` });
  return { ok: true };
}

