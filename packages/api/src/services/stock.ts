import { TRPCError } from '@trpc/server';
import { istDateString } from '@kush/core';
import type { Db, MovementType, Prisma, SerialStatus, Tx } from '@kush/db';
import { dayToDate, isoDay, num } from './num';

/** Batch number used for products that don't track batches. */
export const NO_BATCH = 'NA';

const IN_TYPES: MovementType[] = ['OPENING', 'GRN', 'SALES_RETURN', 'INVOICE_CANCEL', 'TRANSFER_IN'];
const OUT_STATUS: Partial<Record<MovementType, SerialStatus>> = {
  SALE: 'SOLD',
  PURCHASE_RETURN: 'RETURNED_TO_SUPPLIER',
  ADJUSTMENT: 'WRITTEN_OFF',
};

export type VariantWithProduct = Prisma.ProductVariantGetPayload<{ include: { product: true } }>;

export async function loadVariant(db: Db, variantId: string): Promise<VariantWithProduct> {
  const v = await db.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!v || v.deletedAt || v.product.deletedAt) throw new TRPCError({ code: 'NOT_FOUND', message: 'Product variant not found' });
  return v;
}

export async function defaultLocationId(db: Db): Promise<string> {
  const loc = (await db.location.findFirst({ where: { isDefault: true } })) ?? (await db.location.findFirst({ orderBy: { name: 'asc' } }));
  if (loc) return loc.id;
  return (await db.location.create({ data: { name: 'Main store', isDefault: true } })).id;
}

const variantName = (v: VariantWithProduct) => `${v.product.name}${v.label ? ` ${v.label}` : ''}`;

/**
 * Find or create the batch for a receipt. A batch number belongs to one expiry date; receiving
 * the same batch with a different expiry is almost always a typo, so it is refused.
 */
export async function ensureBatch(
  tx: Tx,
  v: VariantWithProduct,
  input: { batchNo?: string | null; expiryDate?: string | null; mfgDate?: string | null; unitCost?: number | null },
  opts: { allowExpired?: boolean; today?: string } = {},
) {
  const today = opts.today ?? istDateString();
  const batchNo = (input.batchNo ?? '').trim().toUpperCase() || (v.product.trackBatch ? '' : NO_BATCH);
  if (!batchNo) throw new TRPCError({ code: 'BAD_REQUEST', message: `${variantName(v)}: enter the batch / lot number` });
  const expiry = input.expiryDate ?? null;
  if (v.product.trackExpiry && !expiry) throw new TRPCError({ code: 'BAD_REQUEST', message: `${variantName(v)}: enter the expiry date` });
  if (expiry && expiry < today && !opts.allowExpired) throw new TRPCError({ code: 'BAD_REQUEST', message: `${variantName(v)}: batch ${batchNo} expired on ${expiry}` });

  const existing = await tx.batch.findUnique({ where: { variantId_batchNo: { variantId: v.id, batchNo } } });
  if (existing) {
    const had = isoDay(existing.expiryDate);
    if (expiry && had && had !== expiry) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `${variantName(v)}: batch ${batchNo} is already recorded with expiry ${had}` });
    }
    if (expiry && !had) await tx.batch.update({ where: { id: existing.id }, data: { expiryDate: dayToDate(expiry) } });
    if (input.unitCost != null && existing.unitCost == null) await tx.batch.update({ where: { id: existing.id }, data: { unitCost: input.unitCost } });
    return existing;
  }
  return tx.batch.create({
    data: { variantId: v.id, batchNo, expiryDate: dayToDate(expiry), mfgDate: dayToDate(input.mfgDate ?? null), unitCost: input.unitCost ?? null },
  });
}

export interface MovementInput {
  type: MovementType;
  variant: VariantWithProduct;
  batchId: string;
  locationId: string;
  qty: number; // +in / −out
  serialNos?: string[];
  unitCost?: number | null;
  reason?: Prisma.StockMovementCreateInput['reason'];
  note?: string | null;
  refType?: string;
  refId?: string;
  actorId: string;
}

/**
 * Post one stock movement: append to the ledger, update the cached balance atomically and keep
 * serial units in step. Stock can never go negative; the whole transaction rolls back if it would.
 */
export async function postMovement(tx: Tx, m: MovementInput): Promise<{ balance: number }> {
  if (!Number.isInteger(m.qty) || m.qty === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Quantity must be a whole number other than zero' });
  const serials = [...new Set((m.serialNos ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if ((m.serialNos ?? []).filter((s) => s.trim()).length !== serials.length) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `${variantName(m.variant)}: the same serial number is listed twice` });
  }
  if (m.variant.product.trackSerial) {
    if (serials.length !== Math.abs(m.qty)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `${variantName(m.variant)}: enter ${Math.abs(m.qty)} serial number(s), one per unit (got ${serials.length})` });
    }
  } else if (serials.length) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `${variantName(m.variant)} does not track serial numbers` });
  }

  const isIn = m.qty > 0;
  if (isIn && !IN_TYPES.includes(m.type) && m.type !== 'ADJUSTMENT') throw new TRPCError({ code: 'BAD_REQUEST', message: `${m.type} cannot add stock` });
  if (!isIn && IN_TYPES.includes(m.type)) throw new TRPCError({ code: 'BAD_REQUEST', message: `${m.type} cannot remove stock` });

  // Serial units
  if (serials.length && isIn) {
    const clash = await tx.serialUnit.findFirst({
      where: { serialNo: { in: serials }, status: { in: ['IN_STOCK', 'RESERVED'] }, batch: { variantId: m.variant.id } },
      select: { serialNo: true },
    });
    if (clash) throw new TRPCError({ code: 'CONFLICT', message: `Serial ${clash.serialNo} is already in stock` });
    for (const serialNo of serials) {
      await tx.serialUnit.upsert({
        where: { batchId_serialNo: { batchId: m.batchId, serialNo } },
        create: { batchId: m.batchId, serialNo, status: 'IN_STOCK', locationId: m.locationId },
        update: { status: 'IN_STOCK', locationId: m.locationId, invoiceLineId: null },
      });
    }
  } else if (serials.length) {
    const units = await tx.serialUnit.findMany({ where: { batchId: m.batchId, serialNo: { in: serials } } });
    for (const s of serials) {
      const u = units.find((x) => x.serialNo === s);
      if (!u || u.status !== 'IN_STOCK' || (u.locationId && u.locationId !== m.locationId)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Serial ${s} is not in stock in this batch` });
      }
    }
    await tx.serialUnit.updateMany({ where: { batchId: m.batchId, serialNo: { in: serials } }, data: { status: OUT_STATUS[m.type] ?? 'WRITTEN_OFF' } });
  }

  let unitCost = m.unitCost ?? null;
  if (unitCost == null) {
    const b = await tx.batch.findUnique({ where: { id: m.batchId }, select: { unitCost: true } });
    unitCost = b?.unitCost != null ? num(b.unitCost) : num(m.variant.purchaseCost ?? m.variant.product.purchaseCost);
  }

  await tx.stockMovement.create({
    data: {
      type: m.type, variantId: m.variant.id, batchId: m.batchId, locationId: m.locationId, qty: m.qty, serialNos: serials,
      unitCost, reason: m.reason ?? null, note: m.note ?? null, refType: m.refType, refId: m.refId, createdById: m.actorId,
    },
  });

  const rows = await tx.$queryRaw<{ qty: number }[]>`
    INSERT INTO "StockBalance" ("variantId", "batchId", "locationId", "qty", "reserved", "updatedAt")
    VALUES (${m.variant.id}, ${m.batchId}, ${m.locationId}, ${m.qty}, 0, now())
    ON CONFLICT ("variantId", "batchId", "locationId")
    DO UPDATE SET "qty" = "StockBalance"."qty" + EXCLUDED."qty", "updatedAt" = now()
    RETURNING "qty"`;
  const balance = rows[0]!.qty;
  if (balance < 0) {
    const batch = await tx.batch.findUnique({ where: { id: m.batchId }, select: { batchNo: true } });
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `${variantName(m.variant)}: only ${balance - m.qty} in stock in batch ${batch?.batchNo ?? ''}, cannot remove ${-m.qty}`,
    });
  }
  return { balance };
}

export interface FefoPick { batchId: string; batchNo: string; expiryDate: string | null; locationId: string; qty: number; available: number }

/**
 * First-expiry-first-out suggestion: unexpired batches with free stock, earliest expiry first
 * (batches without expiry last, then oldest first). Returns as many picks as needed for `qty`.
 */
export async function fefoPick(db: Db, variantId: string, qty: number, opts: { locationId?: string; today?: string } = {}): Promise<{ picks: FefoPick[]; short: number }> {
  const today = opts.today ?? istDateString();
  const balances = await db.stockBalance.findMany({
    where: { variantId, qty: { gt: 0 }, ...(opts.locationId ? { locationId: opts.locationId } : {}) },
    include: { batch: { select: { batchNo: true, expiryDate: true, createdAt: true } } },
  });
  const usable = balances
    .filter((b) => !b.batch.expiryDate || isoDay(b.batch.expiryDate)! >= today)
    .map((b) => ({ ...b, available: b.qty - b.reserved }))
    .filter((b) => b.available > 0)
    .sort((a, b) => {
      const ea = isoDay(a.batch.expiryDate) ?? '9999-12-31';
      const eb = isoDay(b.batch.expiryDate) ?? '9999-12-31';
      return ea === eb ? a.batch.createdAt.getTime() - b.batch.createdAt.getTime() : ea < eb ? -1 : 1;
    });
  const picks: FefoPick[] = [];
  let need = qty;
  for (const b of usable) {
    if (need <= 0) break;
    const take = Math.min(need, b.available);
    picks.push({ batchId: b.batchId, batchNo: b.batch.batchNo, expiryDate: isoDay(b.batch.expiryDate), locationId: b.locationId, qty: take, available: b.available });
    need -= take;
  }
  return { picks, short: Math.max(0, need) };
}

/** Effective reorder level: variant override → product → settings default. */
export const reorderLevelOf = (v: { reorderLevel: number | null; product: { reorderLevel: number | null } }, defaultLevel: number) =>
  v.reorderLevel ?? v.product.reorderLevel ?? defaultLevel;

/** Unit cost for valuation: batch landed cost → variant override → product cost. */
export const costOf = (b: { unitCost: Prisma.Decimal | null } | null, v: { purchaseCost: Prisma.Decimal | null; product: { purchaseCost: Prisma.Decimal } }) =>
  num(b?.unitCost ?? v.purchaseCost ?? v.product.purchaseCost);

/** Per-variant quantity, nearest expiry of stock on hand, and value at cost. */
export async function variantStock(db: Db, variantIds: string[]) {
  const balances = await db.stockBalance.findMany({
    where: { variantId: { in: variantIds }, qty: { gt: 0 } },
    include: { batch: { select: { expiryDate: true, unitCost: true } }, variant: { select: { purchaseCost: true, product: { select: { purchaseCost: true } } } } },
  });
  const out = new Map<string, { qty: number; nearestExpiry: string | null; value: number; expiringQty: number }>();
  for (const b of balances) {
    const cur = out.get(b.variantId) ?? { qty: 0, nearestExpiry: null, value: 0, expiringQty: 0 };
    cur.qty += b.qty;
    cur.value += b.qty * costOf(b.batch, b.variant);
    const e = isoDay(b.batch.expiryDate);
    if (e && (!cur.nearestExpiry || e < cur.nearestExpiry)) cur.nearestExpiry = e;
    out.set(b.variantId, cur);
  }
  return out;
}

