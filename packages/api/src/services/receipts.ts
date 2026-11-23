import { TRPCError } from '@trpc/server';
import type { Tx } from '@kush/db';
import { logActivity } from './activity';
import { nextDocNumber } from './numbering';
import { dayToDate, num } from './num';
import { receiveAgainstPo } from './purchasing';
import { defaultLocationId, ensureBatch, loadVariant, postMovement } from './stock';

export interface ReceiptLine {
  variantId: string;
  batchNo: string | null;
  expiryDate: string | null;
  mfgDate: string | null;
  serialNos: string[];
  qty: number;
  rate: number | null;
}

/**
 * Record goods received (GRN) or opening stock. Each line creates/updates its batch, adds the
 * serial units and posts a stock movement. Purchase rates are only taken from users who may see
 * costs; otherwise the product's purchase cost is used.
 */
export async function createReceipt(
  tx: Tx,
  args: {
    kind: 'GRN' | 'OPENING';
    supplierId: string | null;
    /** Receive against this purchase order (quantities are booked to its open lines). */
    poId?: string | null;
    date: string;
    supplierInvoiceNo?: string | null;
    supplierInvoiceDate?: string | null;
    locationId?: string;
    note?: string | null;
    lines: ReceiptLine[];
    actorId: string;
    canSetCost: boolean;
    ip?: string | null;
  },
) {
  if (args.kind === 'GRN') {
    const s = await tx.supplier.findUnique({ where: { id: args.supplierId! } });
    if (!s || !s.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose an active supplier' });
  }
  const locationId = args.locationId ?? (await defaultLocationId(tx));
  if (!(await tx.location.findUnique({ where: { id: locationId } }))) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Location not found' });

  const po = args.kind === 'GRN' && args.poId ? await receiveAgainstPo(tx, args.poId, args.supplierId!, args.lines.map((l) => ({ variantId: l.variantId, qty: l.qty }))) : null;
  const number = await nextDocNumber(tx, 'GRN', args.date);
  const grn = await tx.grn.create({
    data: {
      number, date: dayToDate(args.date)!, supplierId: args.supplierId, poId: po ? args.poId : null, isOpening: args.kind === 'OPENING', note: args.note ?? null,
      supplierInvoiceNo: args.supplierInvoiceNo ?? null, supplierInvoiceDate: dayToDate(args.supplierInvoiceDate ?? null), createdById: args.actorId,
    },
  });

  let units = 0;
  for (const [i, l] of args.lines.entries()) {
    const v = await loadVariant(tx, l.variantId);
    if (!v.isActive || !v.product.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: `Line ${i + 1}: ${v.product.name} ${v.label ?? ''} is inactive` });
    const rate = args.canSetCost && l.rate != null ? l.rate : num(v.purchaseCost ?? v.product.purchaseCost);
    const batch = await ensureBatch(tx, v, { batchNo: l.batchNo, expiryDate: l.expiryDate, mfgDate: l.mfgDate, unitCost: rate });
    await tx.grnLine.create({
      data: { grnId: grn.id, poLineId: po?.booked[i]?.[0]?.poLineId ?? null, variantId: v.id, batchId: batch.id, batchNo: batch.batchNo, expiryDate: batch.expiryDate, serialNos: l.serialNos.map((s) => s.trim().toUpperCase()), qty: l.qty, rate, locationId },
    });
    await postMovement(tx, {
      type: args.kind, variant: v, batchId: batch.id, locationId, qty: l.qty, serialNos: l.serialNos, unitCost: rate,
      refType: 'Grn', refId: grn.id, note: number, actorId: args.actorId,
    });
    if (args.kind === 'GRN' && args.canSetCost && l.rate != null) {
      await tx.supplierProduct.upsert({
        where: { supplierId_productId: { supplierId: args.supplierId!, productId: v.productId } },
        create: { supplierId: args.supplierId!, productId: v.productId, lastPurchaseRate: l.rate, lastPurchasedAt: new Date() },
        update: { lastPurchaseRate: l.rate, lastPurchasedAt: new Date() },
      });
    }
    units += l.qty;
  }
  await logActivity(tx, {
    actorId: args.actorId, action: args.kind === 'GRN' ? 'stock.grn' : 'stock.opening', entityType: 'Grn', entityId: grn.id, ip: args.ip,
    summary: `${args.kind === 'GRN' ? 'Goods received' : 'Opening stock'} ${number}${po ? ` against ${po.number}` : ''}: ${args.lines.length} line(s), ${units} unit(s)`,
  });
  return { id: grn.id, number, units, po: po ? { number: po.number, complete: po.complete } : null };
}
