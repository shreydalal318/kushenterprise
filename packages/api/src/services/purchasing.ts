import { TRPCError } from '@trpc/server';
import { computeGst, financialYear, round2, stateByCode } from '@kush/core';
import type { Db, Supplier, Tx } from '@kush/db';
import { logActivity } from './activity';
import { dayToDate, num } from './num';
import { nextDocNumber } from './numbering';
import { getSettings } from './settings';
import { loadVariant, reorderLevelOf, variantStock } from './stock';
import { requireCompanyState, supplierSnapshot } from './sales/common';

export interface PoLineInput { variantId: string; qty: number; rate?: number | null; discPct?: number; expectedDate?: string | null }
export interface PoInput {
  supplierId: string;
  date: string;
  expectedDate?: string | null;
  terms?: string | null;
  note?: string | null;
  lines: PoLineInput[];
}

/** Vendor block as printed on the PO. */
export function vendorSnapshot(s: Supplier) {
  return {
    name: s.name,
    attn: s.contactPerson ? `Attn: ${s.contactPerson}` : null,
    addressLines: [s.addressLine1, s.addressLine2, [s.city, s.pincode].filter(Boolean).join(' - ')].filter(Boolean) as string[],
    gstin: s.gstin,
    stateName: stateByCode(s.stateCode)?.name ?? s.stateCode,
    stateCode: s.stateCode,
    drugLicence: null,
  };
}

/** Our own address as the "Deliver to" party. */
function deliverTo(c: ReturnType<typeof supplierSnapshot>) {
  return { name: c.name, attn: null, addressLines: c.addressLines, gstin: c.gstin, stateName: c.stateName, stateCode: c.stateCode, drugLicence: c.drugLicence };
}

/** Last price paid to this supplier for each product (falls back to the variant / product cost). */
export async function lastRates(db: Db | Tx, supplierId: string | null, variantIds: string[]) {
  const variants = await db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, productId: true, purchaseCost: true, product: { select: { purchaseCost: true } } } });
  const links = supplierId ? await db.supplierProduct.findMany({ where: { supplierId, productId: { in: variants.map((v) => v.productId) } } }) : [];
  const byProduct = new Map(links.map((l) => [l.productId, l]));
  return new Map(variants.map((v) => {
    const link = byProduct.get(v.productId);
    const rate = link?.lastPurchaseRate != null ? num(link.lastPurchaseRate) : num(v.purchaseCost ?? v.product.purchaseCost);
    return [v.id, { rate, source: link?.lastPurchaseRate != null ? ('LAST_PURCHASE' as const) : ('COST' as const), lastPurchasedAt: link?.lastPurchasedAt ?? null }];
  }));
}

async function buildPo(tx: Tx, input: PoInput) {
  const settings = await requireCompanyState(tx);
  const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier || !supplier.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose an active supplier' });
  if (!input.lines.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add at least one item' });
  const rates = await lastRates(tx, supplier.id, input.lines.map((l) => l.variantId));
  const built = [];
  for (const [i, l] of input.lines.entries()) {
    const v = await loadVariant(tx, l.variantId);
    if (!v.isActive || !v.product.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: `Line ${i + 1}: ${v.product.name} ${v.label ?? ''} is inactive` });
    if (!Number.isInteger(l.qty) || l.qty < 1) throw new TRPCError({ code: 'BAD_REQUEST', message: `Line ${i + 1}: quantity must be at least 1` });
    built.push({ v, qty: l.qty, rate: round2(l.rate ?? rates.get(v.id)!.rate), discPct: Math.min(100, Math.max(0, l.discPct ?? 0)), expectedDate: l.expectedDate ?? null });
  }
  const company = supplierSnapshot(settings);
  const gst = computeGst(supplier.stateCode, company.stateCode, built.map((b) => ({ qty: b.qty, rate: b.rate, discPct: b.discPct, hsn: b.v.product.hsnCode, gstRate: num(b.v.product.gstRate) })));
  return { settings, supplier, company, built, gst };
}

const totals = (g: ReturnType<typeof computeGst>) => ({
  taxType: g.taxType, taxableTotal: g.taxable, cgstTotal: g.cgst, sgstTotal: g.sgst, igstTotal: g.igst, taxTotal: g.totalTax, roundOff: g.roundOff, grandTotal: g.total,
});

async function writeLines(tx: Tx, poId: string, b: Awaited<ReturnType<typeof buildPo>>) {
  await tx.purchaseOrderLine.createMany({
    data: b.built.map((x, i) => ({
      poId, sl: i + 1, variantId: x.v.id, description: x.v.label ? `${x.v.product.name} (${x.v.label})` : x.v.product.name, hsnCode: x.v.product.hsnCode,
      qtyOrdered: x.qty, unit: x.v.product.unit, rate: x.rate, discPct: x.discPct, gstRate: num(x.v.product.gstRate), amount: b.gst.lines[i]!.amount,
      expectedDate: dayToDate(x.expectedDate),
    })),
  });
}

export async function createPo(tx: Tx, input: PoInput, actor: { id: string }, ip?: string | null) {
  const b = await buildPo(tx, input);
  const number = await nextDocNumber(tx, 'PURCHASE_ORDER', input.date);
  const po = await tx.purchaseOrder.create({
    data: {
      number, financialYear: financialYear(input.date), date: dayToDate(input.date)!, supplierId: b.supplier.id, status: 'DRAFT',
      expectedDate: dayToDate(input.expectedDate ?? null), terms: input.terms ?? b.settings.defaultPoTerms ?? null, note: input.note ?? null,
      companySnapshot: b.company, supplierSnapshot: vendorSnapshot(b.supplier), ...totals(b.gst), createdById: actor.id,
    },
  });
  await writeLines(tx, po.id, b);
  await logActivity(tx, { actorId: actor.id, action: 'po.create', entityType: 'PurchaseOrder', entityId: po.id, ip, summary: `Purchase order ${number} to ${b.supplier.name}: ₹${b.gst.total}` });
  return { id: po.id, number, total: b.gst.total };
}

/** Only a draft can be edited; once sent, the supplier has it. */
export async function updatePo(tx: Tx, id: string, input: PoInput, actor: { id: string }, ip?: string | null) {
  const po = await tx.purchaseOrder.findUnique({ where: { id } });
  if (!po) throw new TRPCError({ code: 'NOT_FOUND' });
  if (po.status !== 'DRAFT') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only a draft purchase order can be edited' });
  const b = await buildPo(tx, input);
  await tx.purchaseOrderLine.deleteMany({ where: { poId: id } });
  await tx.purchaseOrder.update({
    where: { id },
    data: {
      date: dayToDate(input.date)!, supplierId: b.supplier.id, expectedDate: dayToDate(input.expectedDate ?? null), terms: input.terms ?? null, note: input.note ?? null,
      companySnapshot: b.company, supplierSnapshot: vendorSnapshot(b.supplier), ...totals(b.gst),
    },
  });
  await writeLines(tx, id, b);
  await logActivity(tx, { actorId: actor.id, action: 'po.update', entityType: 'PurchaseOrder', entityId: id, ip, summary: `Edited purchase order ${po.number}: ₹${b.gst.total}` });
  return { id, number: po.number, total: b.gst.total };
}

export async function setPoStatus(tx: Tx, id: string, action: 'SEND' | 'CANCEL' | 'CLOSE', reason: string | null, actor: { id: string }, ip?: string | null) {
  const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
  if (!po) throw new TRPCError({ code: 'NOT_FOUND' });
  const received = po.lines.some((l) => l.qtyReceived > 0);
  if (action === 'SEND') {
    if (po.status !== 'DRAFT') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already sent' });
    await tx.purchaseOrder.update({ where: { id }, data: { status: 'SENT', sentAt: new Date() } });
  } else if (action === 'CANCEL') {
    if (!['DRAFT', 'SENT'].includes(po.status) || received) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Goods have been received against this PO; short-close it instead' });
    await tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date() } });
  } else {
    if (!['SENT', 'PARTIALLY_RECEIVED'].includes(po.status)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only an open, sent purchase order can be closed' });
    await tx.purchaseOrder.update({ where: { id }, data: { status: 'CLOSED', closeReason: reason, closedAt: new Date() } });
  }
  const verb = { SEND: 'Sent', CANCEL: 'Cancelled', CLOSE: 'Short-closed' }[action];
  await logActivity(tx, { actorId: actor.id, action: `po.${action.toLowerCase()}`, entityType: 'PurchaseOrder', entityId: id, ip, summary: `${verb} purchase order ${po.number}${reason ? `: ${reason}` : ''}` });
  return { ok: true };
}

/**
 * Apply received quantities to a PO (inside the GRN transaction). Each received variant is matched to
 * the PO's open lines in order; receiving more than is outstanding, or an item not on the PO, is refused.
 * Returns the PO line each GRN line was booked against.
 */
export async function receiveAgainstPo(tx: Tx, poId: string, supplierId: string, items: { variantId: string; qty: number }[]) {
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, include: { lines: { orderBy: { sl: 'asc' } } } });
  if (!po) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Purchase order not found' });
  if (po.supplierId !== supplierId) throw new TRPCError({ code: 'BAD_REQUEST', message: `${po.number} is for a different supplier` });
  if (po.status === 'DRAFT') throw new TRPCError({ code: 'BAD_REQUEST', message: `${po.number} is still a draft; mark it as sent first` });
  if (!['SENT', 'PARTIALLY_RECEIVED'].includes(po.status)) throw new TRPCError({ code: 'BAD_REQUEST', message: `${po.number} is ${po.status.toLowerCase().replace('_', ' ')}` });
  const open = new Map(po.lines.map((l) => [l.id, l.qtyOrdered - l.qtyReceived]));
  const booked: { poLineId: string; qty: number }[][] = [];
  for (const it of items) {
    let left = it.qty;
    const parts: { poLineId: string; qty: number }[] = [];
    for (const l of po.lines.filter((x) => x.variantId === it.variantId)) {
      const room = open.get(l.id)!;
      const take = Math.min(room, left);
      if (take > 0) { parts.push({ poLineId: l.id, qty: take }); open.set(l.id, room - take); left -= take; }
    }
    if (left > 0) {
      const v = await loadVariant(tx, it.variantId);
      const onPo = po.lines.some((x) => x.variantId === it.variantId);
      throw new TRPCError({ code: 'BAD_REQUEST', message: onPo ? `${v.product.name} ${v.label ?? ''}: ${left} more than still due on ${po.number}` : `${v.product.name} ${v.label ?? ''} is not on ${po.number}` });
    }
    booked.push(parts);
  }
  for (const parts of booked) for (const p of parts) await tx.purchaseOrderLine.update({ where: { id: p.poLineId }, data: { qtyReceived: { increment: p.qty } } });
  const after = await tx.purchaseOrderLine.findMany({ where: { poId } });
  const done = after.every((l) => l.qtyReceived >= l.qtyOrdered);
  await tx.purchaseOrder.update({ where: { id: poId }, data: { status: done ? 'RECEIVED' : 'PARTIALLY_RECEIVED' } });
  return { number: po.number, booked, complete: done };
}

/**
 * Reorder suggestions: active items at or below their reorder level, with the quantity to bring
 * stock back to twice the level, less what is already on open POs. Optionally for one supplier.
 */
export async function reorderSuggestions(db: Db, supplierId?: string | null) {
  const s = await getSettings(db);
  const variants = await db.productVariant.findMany({
    where: { isActive: true, deletedAt: null, product: { isActive: true, deletedAt: null, ...(supplierId ? { supplierLinks: { some: { supplierId } } } : {}) } },
    include: { product: { select: { id: true, name: true, code: true, unit: true, reorderLevel: true, isLens: true, gstRate: true, supplierLinks: { take: 1, include: { supplier: { select: { id: true, name: true } } } } } } },
  });
  const stock = await variantStock(db, variants.map((v) => v.id));
  const everStocked = new Set((await db.stockMovement.groupBy({ by: ['variantId'] })).map((r) => r.variantId));
  const onOrder = new Map<string, number>();
  for (const l of await db.purchaseOrderLine.findMany({ where: { po: { status: { in: ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED'] } } }, select: { variantId: true, qtyOrdered: true, qtyReceived: true } })) {
    onOrder.set(l.variantId, (onOrder.get(l.variantId) ?? 0) + Math.max(0, l.qtyOrdered - l.qtyReceived));
  }
  const rows = variants
    .map((v) => ({ v, qty: stock.get(v.id)?.qty ?? 0, level: reorderLevelOf(v, s.defaultReorderLevel), pending: onOrder.get(v.id) ?? 0 }))
    .filter(({ v, qty, level }) => qty <= level && (everStocked.has(v.id) || (!v.product.isLens && v.reorderLevel != null)))
    .map(({ v, qty, level, pending }) => ({
      variantId: v.id, productId: v.product.id, productName: v.product.name, code: v.product.code, sku: v.sku, label: v.label, unit: v.product.unit,
      qty, reorderLevel: level, onOrder: pending, suggestedQty: Math.max(level * 2 - qty - pending, 0), supplier: v.product.supplierLinks[0]?.supplier ?? null,
    }))
    .filter((r) => r.suggestedQty > 0)
    .sort((a, b) => a.productName.localeCompare(b.productName) || a.sku.localeCompare(b.sku));
  const rates = await lastRates(db, supplierId ?? null, rows.map((r) => r.variantId));
  return rows.map((r) => ({ ...r, rate: rates.get(r.variantId)!.rate, rateSource: rates.get(r.variantId)!.source }));
}
