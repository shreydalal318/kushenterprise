import { TRPCError } from '@trpc/server';
import { addDays, computeGst, financialYear, round2 } from '@kush/core';
import type { Tx } from '@kush/db';
import { logActivity } from '../activity';
import { dayToDate, isoDay, num } from '../num';
import { nextDocNumber } from '../numbering';
import { resolveCustomerPrices } from '../pricing';
import { loadVariant } from '../stock';
import { customerForDocument, requireCompanyState, supplierSnapshot } from './common';
import { createInvoice } from './invoices';

export interface ProformaInput {
  customerId: string;
  forDoctorId?: string | null;
  shippingAddressId?: string | null;
  date: string;
  validUntil?: string | null;
  orderId?: string | null;
  terms?: string | null;
  lines: { variantId: string; qty: number; discPct?: number; rate?: number | null }[];
}

/** Proforma: priced like an invoice (customer price) but reserves no stock and has its own numbering. */
export async function createProforma(tx: Tx, input: ProformaInput, actor: { id: string; isOwner: boolean }, ip?: string | null) {
  if (!input.lines.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add at least one item' });
  const settings = await requireCompanyState(tx);
  const doc = await customerForDocument(tx, input.customerId, input);
  const variants = await Promise.all(input.lines.map((l) => loadVariant(tx, l.variantId)));
  const prices = await resolveCustomerPrices(tx, input.customerId, [...new Set(variants.map((v) => v.productId))], input.date);
  const rows = input.lines.map((l, i) => {
    const v = variants[i]!;
    const rate = l.rate != null && actor.isOwner ? round2(l.rate) : prices.get(v.productId)!.rate;
    if (rate > num(v.mrp ?? v.product.mrp)) throw new TRPCError({ code: 'BAD_REQUEST', message: `${v.product.name}: rate above MRP` });
    return { v, qty: l.qty, rate, discPct: Math.min(100, Math.max(0, l.discPct ?? 0)) };
  });
  const supplier = supplierSnapshot(settings);
  const gst = computeGst(supplier.stateCode, doc.placeOfSupply, rows.map((r) => ({ qty: r.qty, rate: r.rate, discPct: r.discPct, hsn: r.v.product.hsnCode, gstRate: num(r.v.product.gstRate) })));
  const number = await nextDocNumber(tx, 'PROFORMA', input.date);
  const p = await tx.proforma.create({
    data: {
      number, financialYear: financialYear(input.date), date: dayToDate(input.date)!,
      validUntil: dayToDate(input.validUntil ?? addDays(input.date, settings.proformaValidityDays))!,
      customerId: doc.customer.id, orderId: input.orderId ?? null, supplierSnapshot: supplier, taxType: gst.taxType,
      buyerSnapshot: doc.buyer, consigneeSnapshot: doc.consignee, placeOfSupply: doc.placeOfSupply,
      terms: input.terms ?? settings.defaultInvoiceTerms,
      taxableTotal: gst.taxable, taxTotal: gst.totalTax, roundOff: gst.roundOff, grandTotal: gst.total, createdById: actor.id,
      lines: { create: rows.map((r, i) => ({ sl: i + 1, variantId: r.v.id, description: r.v.product.name, hsnCode: r.v.product.hsnCode, qty: r.qty, unit: r.v.product.unit, rate: r.rate, discPct: r.discPct, amount: gst.lines[i]!.amount, gstRate: num(r.v.product.gstRate) })) },
    },
  });
  await logActivity(tx, { actorId: actor.id, action: 'proforma.create', entityType: 'Proforma', entityId: p.id, ip, summary: `Proforma ${number} for ${doc.customer.name}: ₹${gst.total}` });
  return { id: p.id, number, total: gst.total };
}

/**
 * Convert to a tax invoice without re-entering anything: same customer, ship-to, quantities and
 * rates (the quoted rate is honoured). Stock is taken FEFO unless batches/serials are supplied.
 */
export async function convertProforma(tx: Tx, id: string, args: { date: string; lines?: { variantId: string; batchId?: string | null; serialNos?: string[] }[] }, actor: { id: string; isOwner: boolean }, ip?: string | null) {
  const p = await tx.proforma.findUnique({ where: { id }, include: { lines: { orderBy: { sl: 'asc' } }, invoice: { select: { id: true, number: true, status: true } } } });
  if (!p) throw new TRPCError({ code: 'NOT_FOUND' });
  if (p.invoice && p.invoice.status !== 'CANCELLED') throw new TRPCError({ code: 'BAD_REQUEST', message: `Already converted to ${p.invoice.number}` });
  if (p.status === 'CANCELLED') throw new TRPCError({ code: 'BAD_REQUEST', message: 'This proforma is cancelled' });
  if (p.invoice) await tx.invoice.update({ where: { id: p.invoice.id }, data: { proformaId: null } }); // a cancelled earlier conversion
  const order = p.orderId ? await tx.salesOrder.findUnique({ where: { id: p.orderId }, select: { forDoctorId: true, shippingAddressId: true } }) : null;
  return createInvoice(tx, {
    customerId: p.customerId, date: args.date, proformaId: p.id, orderId: p.orderId,
    forDoctorId: order?.forDoctorId, shippingAddressId: order?.shippingAddressId ?? (await shipIdFromSnapshot(tx, p.customerId, p.placeOfSupply)),
    referenceNo: `${p.number} dt. ${isoDay(p.date)!.split('-').reverse().join('-')}`,
    lines: p.lines.map((l) => {
      const pick = args.lines?.find((x) => x.variantId === l.variantId);
      return { variantId: l.variantId, qty: l.qty, rate: num(l.rate), discPct: num(l.discPct), batchId: pick?.batchId, serialNos: pick?.serialNos };
    }),
  }, actor, { trustedRates: true, ip });
}

async function shipIdFromSnapshot(tx: Tx, customerId: string, stateCode: string) {
  const a = await tx.address.findFirst({ where: { customerId, kind: 'SHIPPING', isDefault: true, stateCode } });
  return a?.id ?? null;
}
