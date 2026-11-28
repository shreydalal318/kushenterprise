import { TRPCError } from '@trpc/server';
import { computeGst } from '@kush/core';
import type { Db, Tx } from '@kush/db';
import { logActivity } from './activity';
import { postDebitNote } from './accounts/posting';
import { dayToDate } from './num';
import { nextDocNumber } from './numbering';
import { getSettings } from './settings';
import { costOf, defaultLocationId, loadVariant, postMovement } from './stock';

export interface SupplierReturnInput {
  supplierId: string;
  date: string;
  reason: string;
  note?: string | null;
  lines: { variantId: string; batchId: string; locationId?: string; qty: number; serialNos: string[] }[];
}

/**
 * Debit note value of a supplier return: each unit at its batch's landed cost (else the item cost),
 * GST at the product's rate, CGST+SGST when the supplier is in our state, else IGST.
 */
export async function valueSupplierReturn(db: Db, returnId: string) {
  const r = await db.supplierReturn.findUniqueOrThrow({
    where: { id: returnId },
    include: { supplier: { select: { stateCode: true } }, lines: { include: { batch: { select: { unitCost: true } }, variant: { include: { product: true } } } } },
  });
  const s = await getSettings(db);
  const g = computeGst(r.supplier.stateCode, s.stateCode, r.lines.map((l) => ({ qty: l.qty, rate: costOf(l.batch, l.variant), hsn: l.variant.product.hsnCode, gstRate: Number(l.variant.product.gstRate) })));
  await db.supplierReturn.update({
    where: { id: r.id },
    data: { taxType: g.taxType, taxableTotal: g.taxable, cgstTotal: g.cgst, sgstTotal: g.sgst, igstTotal: g.igst, taxTotal: g.totalTax, roundOff: g.roundOff, grandTotal: g.total },
  });
  return g;
}

/** Return goods to a supplier (debit note number): reduces stock, marks serials returned, values and posts the debit note. */
export async function createSupplierReturn(tx: Tx, input: SupplierReturnInput, actor: { id: string }, ip?: string | null) {
  const sup = await tx.supplier.findUnique({ where: { id: input.supplierId } });
  if (!sup) throw new TRPCError({ code: 'NOT_FOUND', message: 'Supplier not found' });
  const number = await nextDocNumber(tx, 'DEBIT_NOTE', input.date);
  const ret = await tx.supplierReturn.create({ data: { number, date: dayToDate(input.date)!, supplierId: sup.id, reason: input.reason, note: input.note ?? null, createdById: actor.id } });
  const loc = await defaultLocationId(tx);
  for (const l of input.lines) {
    const v = await loadVariant(tx, l.variantId);
    const b = await tx.batch.findUnique({ where: { id: l.batchId } });
    if (!b || b.variantId !== v.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Batch does not belong to this item' });
    const locationId = l.locationId ?? loc;
    await tx.supplierReturnLine.create({ data: { returnId: ret.id, variantId: v.id, batchId: b.id, locationId, qty: l.qty, serialNos: l.serialNos.map((x) => x.toUpperCase()) } });
    await postMovement(tx, { type: 'PURCHASE_RETURN', variant: v, batchId: b.id, locationId, qty: -l.qty, serialNos: l.serialNos, refType: 'SupplierReturn', refId: ret.id, note: number, actorId: actor.id });
  }
  const g = await valueSupplierReturn(tx, ret.id);
  await postDebitNote(tx, ret.id);
  await logActivity(tx, { actorId: actor.id, action: 'stock.supplier_return', entityType: 'SupplierReturn', entityId: ret.id, summary: `${number}: returned ${input.lines.reduce((t, l) => t + l.qty, 0)} unit(s) to ${sup.name} (${input.reason}), debit note ₹${g.total}`, ip });
  return { id: ret.id, number, total: g.total };
}
