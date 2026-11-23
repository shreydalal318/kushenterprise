import { TRPCError } from '@trpc/server';
import { computeGst, financialYear, round2 } from '@kush/core';
import type { Tx } from '@kush/db';
import { logActivity } from '../activity';
import { dayToDate, isoDay, num } from '../num';
import { nextDocNumber } from '../numbering';
import { loadVariant, postMovement } from '../stock';
import { invoiceDue } from './payments';

export interface CreditNoteInput {
  invoiceId: string;
  date: string;
  reason: string;
  restock: boolean;
  lines: { invoiceLineId: string; qty: number; serialNos?: string[] }[];
}

/**
 * Credit note for goods returned against an invoice: same rates, discount and GST treatment as
 * the invoice; quantities can't exceed what is left to credit; restocking puts units (and serials)
 * back into the same batch.
 */
export async function createCreditNote(tx: Tx, input: CreditNoteInput, actor: { id: string }, ip?: string | null) {
  const inv = await tx.invoice.findUnique({ where: { id: input.invoiceId }, include: { lines: true, customer: true } });
  if (!inv) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
  if (inv.status === 'CANCELLED') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cancelled invoices cannot be credited' });
  const credited = await tx.creditNoteLine.groupBy({ by: ['invoiceLineId'], where: { creditNote: { invoiceId: inv.id } }, _sum: { qty: true } });
  const done = new Map(credited.map((c) => [c.invoiceLineId!, c._sum.qty ?? 0]));
  const rows = input.lines.filter((l) => l.qty > 0).map((l) => {
    const il = inv.lines.find((x) => x.id === l.invoiceLineId);
    if (!il) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Line is not on this invoice' });
    const left = il.qty - (done.get(il.id) ?? 0);
    if (l.qty > left) throw new TRPCError({ code: 'BAD_REQUEST', message: `${il.description}: only ${left} left to credit` });
    const serials = (l.serialNos ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (il.serialNos.length) {
      if (serials.length !== l.qty) throw new TRPCError({ code: 'BAD_REQUEST', message: `${il.description}: choose ${l.qty} serial number(s) being returned` });
      const bad = serials.filter((s) => !il.serialNos.includes(s));
      if (bad.length) throw new TRPCError({ code: 'BAD_REQUEST', message: `Serial ${bad.join(', ')} was not sold on this invoice` });
    }
    return { il, qty: l.qty, serials };
  });
  if (!rows.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Enter at least one quantity to credit' });
  const supplier = inv.supplierSnapshot as { stateCode: string };
  const gst = computeGst(supplier.stateCode, inv.placeOfSupply, rows.map((r) => ({ qty: r.qty, rate: num(r.il.rate), discPct: num(r.il.discPct), hsn: r.il.hsnCode, gstRate: num(r.il.gstRate) })));
  const { due } = await invoiceDue(tx, inv.id);
  if (gst.total > num(inv.grandTotal) + 0.01) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Credit is more than the invoice value' });
  const inter = gst.taxType === 'INTER_STATE';
  const number = await nextDocNumber(tx, 'CREDIT_NOTE', input.date);
  const cn = await tx.creditNote.create({
    data: {
      number, financialYear: financialYear(input.date), date: dayToDate(input.date)!, customerId: inv.customerId, invoiceId: inv.id,
      reason: input.reason, restock: input.restock, taxType: gst.taxType, placeOfSupply: inv.placeOfSupply,
      supplierSnapshot: inv.supplierSnapshot as object, buyerSnapshot: inv.buyerSnapshot as object,
      taxableTotal: gst.taxable, cgstTotal: gst.cgst, sgstTotal: gst.sgst, igstTotal: gst.igst, taxTotal: gst.totalTax, roundOff: gst.roundOff, grandTotal: gst.total,
      createdById: actor.id,
      lines: { create: rows.map((r, i) => {
        const amount = gst.lines[i]!.amount; const rate = num(r.il.gstRate);
        return {
          sl: i + 1, invoiceLineId: r.il.id, variantId: r.il.variantId, description: r.il.description, hsnCode: r.il.hsnCode, unit: r.il.unit,
          batchId: r.il.batchId, batchNo: r.il.batchNo, expiryDate: r.il.expiryDate, powerLabel: r.il.powerLabel, serialNos: r.serials,
          qty: r.qty, rate: r.il.rate, discPct: r.il.discPct, amount, gstRate: rate,
          cgstAmount: inter ? 0 : round2((amount * rate) / 200), sgstAmount: inter ? 0 : round2((amount * rate) / 200), igstAmount: inter ? round2((amount * rate) / 100) : 0,
        };
      }) },
    },
  });
  if (input.restock) {
    for (const r of rows) {
      if (!r.il.batchId) continue;
      const sale = await tx.stockMovement.findFirst({ where: { refType: 'Invoice', refId: inv.id, type: 'SALE', batchId: r.il.batchId } });
      const v = await loadVariant(tx, r.il.variantId);
      await postMovement(tx, { type: 'SALES_RETURN', variant: v, batchId: r.il.batchId, locationId: sale?.locationId ?? (await tx.location.findFirstOrThrow({ where: { isDefault: true } })).id, qty: r.qty, serialNos: r.serials, unitCost: r.il.costAtSale == null ? null : num(r.il.costAtSale), refType: 'CreditNote', refId: cn.id, note: number, actorId: actor.id });
    }
  }
  await logActivity(tx, { actorId: actor.id, action: 'credit_note.create', entityType: 'CreditNote', entityId: cn.id, ip, summary: `Credit note ${number} against ${inv.number}: ₹${gst.total} (${input.reason})${gst.total > due ? ' — exceeds amount due; balance on account' : ''}` });
  return { id: cn.id, number, total: gst.total, invoiceDate: isoDay(inv.date) };
}
