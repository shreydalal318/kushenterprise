import { TRPCError } from '@trpc/server';
import { istDateString, resolvePrice, type DatedRate, type ResolvedPrice } from '@kush/core';
import type { Db, Prisma, Tx } from '@kush/db';
import { logActivity } from './activity';
import { dayToDate, isoDay, num, numOrNull } from './num';

export interface PriceRow {
  productId: string;
  rate: number | null; // null = remove
  validFrom: string | null;
  validTo: string | null;
  note?: string | null;
}

const dated = (r: { rate: Prisma.Decimal; validFrom: Date | null; validTo: Date | null } | null | undefined): DatedRate | null =>
  r ? { rate: num(r.rate), validFrom: isoDay(r.validFrom), validTo: isoDay(r.validTo) } : null;

/**
 * Effective price for each product for one customer on a date.
 * Used by the pricing workbench now, and by orders / invoices / the customer catalogue later.
 */
export async function resolveCustomerPrices(
  db: Db,
  customerId: string,
  productIds: string[] | null,
  onDate = istDateString(),
): Promise<Map<string, ResolvedPrice & { defaultRate: number }>> {
  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { priceListId: true, priceList: { select: { isActive: true } } } });
  if (!customer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
  const productFilter = productIds ? { id: { in: productIds } } : { deletedAt: null };
  const products = await db.product.findMany({ where: productFilter, select: { id: true, defaultRate: true } });
  const ids = products.map((p) => p.id);
  const [overrides, listItems] = await Promise.all([
    db.customerPrice.findMany({ where: { customerId, productId: { in: ids } } }),
    customer.priceListId && customer.priceList?.isActive
      ? db.priceListItem.findMany({ where: { priceListId: customer.priceListId, productId: { in: ids } } })
      : Promise.resolve([]),
  ]);
  const o = new Map(overrides.map((x) => [x.productId, x]));
  const l = new Map(listItems.map((x) => [x.productId, x]));
  const out = new Map<string, ResolvedPrice & { defaultRate: number }>();
  for (const p of products) {
    const defaultRate = num(p.defaultRate);
    out.set(p.id, { defaultRate, ...resolvePrice({ defaultRate, listRate: dated(l.get(p.id)), override: dated(o.get(p.id)) }, onDate) });
  }
  return out;
}

async function checkAgainstMrp(tx: Tx, rows: PriceRow[]) {
  const products = await tx.product.findMany({
    where: { id: { in: rows.map((r) => r.productId) } },
    select: { id: true, code: true, mrp: true, defaultRate: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const missing = rows.filter((r) => !byId.has(r.productId));
  if (missing.length) throw new TRPCError({ code: 'BAD_REQUEST', message: `${missing.length} product(s) not found` });
  const aboveMrp = rows.filter((r) => r.rate !== null && r.rate > num(byId.get(r.productId)!.mrp));
  if (aboveMrp.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Rate above MRP for ${aboveMrp.map((r) => byId.get(r.productId)!.code).slice(0, 5).join(', ')}${aboveMrp.length > 5 ? '…' : ''}`,
    });
  }
  return byId;
}

const sameDated = (a: { rate: Prisma.Decimal; validFrom: Date | null; validTo: Date | null; note?: string | null } | undefined, r: PriceRow) =>
  !!a && num(a.rate) === r.rate && isoDay(a.validFrom) === r.validFrom && isoDay(a.validTo) === r.validTo && (a.note ?? null) === (r.note ?? null);

/** Upsert / remove customer-specific prices, writing price history and one activity entry. */
export async function applyCustomerPrices(tx: Tx, args: { customerId: string; rows: PriceRow[]; actorId: string; source: string; ip?: string | null }) {
  const customer = await tx.customer.findUnique({ where: { id: args.customerId }, select: { id: true, name: true } });
  if (!customer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
  const rows = dedupe(args.rows);
  await checkAgainstMrp(tx, rows);
  const existing = new Map((await tx.customerPrice.findMany({ where: { customerId: customer.id, productId: { in: rows.map((r) => r.productId) } } })).map((e) => [e.productId, e]));

  let set = 0;
  let removed = 0;
  for (const r of rows) {
    const old = existing.get(r.productId);
    if (r.rate === null) {
      if (!old) continue;
      await tx.customerPrice.delete({ where: { id: old.id } });
      removed++;
    } else {
      if (sameDated(old, r)) continue;
      await tx.customerPrice.upsert({
        where: { customerId_productId: { customerId: customer.id, productId: r.productId } },
        create: { customerId: customer.id, productId: r.productId, rate: r.rate, validFrom: dayToDate(r.validFrom), validTo: dayToDate(r.validTo), note: r.note ?? null },
        update: { rate: r.rate, validFrom: dayToDate(r.validFrom), validTo: dayToDate(r.validTo), note: r.note ?? null },
      });
      set++;
    }
    await tx.priceChangeLog.create({
      data: {
        productId: r.productId, scope: 'CUSTOMER', scopeRefId: customer.id,
        oldRate: old?.rate ?? null, newRate: r.rate, validFrom: dayToDate(r.validFrom), validTo: dayToDate(r.validTo),
        changedById: args.actorId, source: args.source,
      },
    });
  }
  if (set || removed) {
    await logActivity(tx, {
      actorId: args.actorId, action: 'price.customer', entityType: 'Customer', entityId: customer.id, ip: args.ip,
      summary: `Special prices for ${customer.name}: ${set} set, ${removed} removed (${args.source})`,
    });
  }
  return { set, removed, unchanged: rows.length - set - removed };
}

/** Upsert / remove price-list rates with history. */
export async function applyPriceListItems(tx: Tx, args: { priceListId: string; rows: PriceRow[]; actorId: string; source: string; ip?: string | null }) {
  const list = await tx.priceList.findUnique({ where: { id: args.priceListId }, select: { id: true, name: true } });
  if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'Price list not found' });
  const rows = dedupe(args.rows);
  await checkAgainstMrp(tx, rows);
  const existing = new Map((await tx.priceListItem.findMany({ where: { priceListId: list.id, productId: { in: rows.map((r) => r.productId) } } })).map((e) => [e.productId, e]));
  let set = 0;
  let removed = 0;
  for (const r of rows) {
    const old = existing.get(r.productId);
    if (r.rate === null) {
      if (!old) continue;
      await tx.priceListItem.delete({ where: { id: old.id } });
      removed++;
    } else {
      if (sameDated(old ? { ...old, note: r.note ?? null } : undefined, r)) continue;
      await tx.priceListItem.upsert({
        where: { priceListId_productId: { priceListId: list.id, productId: r.productId } },
        create: { priceListId: list.id, productId: r.productId, rate: r.rate, validFrom: dayToDate(r.validFrom), validTo: dayToDate(r.validTo) },
        update: { rate: r.rate, validFrom: dayToDate(r.validFrom), validTo: dayToDate(r.validTo) },
      });
      set++;
    }
    await tx.priceChangeLog.create({
      data: {
        productId: r.productId, scope: 'PRICE_LIST', scopeRefId: list.id,
        oldRate: old?.rate ?? null, newRate: r.rate, validFrom: dayToDate(r.validFrom), validTo: dayToDate(r.validTo),
        changedById: args.actorId, source: args.source,
      },
    });
  }
  if (set || removed) {
    await logActivity(tx, {
      actorId: args.actorId, action: 'price.list', entityType: 'PriceList', entityId: list.id, ip: args.ip,
      summary: `Price list "${list.name}": ${set} set, ${removed} removed (${args.source})`,
    });
  }
  return { set, removed, unchanged: rows.length - set - removed };
}

/** Last row wins if a product appears twice (e.g. in an imported sheet). */
function dedupe(rows: PriceRow[]): PriceRow[] {
  return [...new Map(rows.map((r) => [r.productId, r])).values()];
}

/** Full sheet for the pricing workbench: default / list / special / effective for every product. */
export async function customerPriceSheet(
  db: Db,
  customerId: string,
  opts: { where?: Prisma.ProductWhereInput; onDate?: string; includeCost: boolean },
) {
  const onDate = opts.onDate ?? istDateString();
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, code: true, name: true, type: true, priceListId: true, priceList: { select: { id: true, name: true, isActive: true } } },
  });
  if (!customer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
  const products = await db.product.findMany({
    where: { deletedAt: null, ...(opts.where ?? {}) },
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    select: {
      id: true, code: true, name: true, unit: true, mrp: true, defaultRate: true, purchaseCost: true, isActive: true,
      category: { select: { name: true } }, brand: { select: { name: true } },
    },
  });
  const ids = products.map((p) => p.id);
  const listActive = !!customer.priceList?.isActive;
  const [overrides, listItems] = await Promise.all([
    db.customerPrice.findMany({ where: { customerId, productId: { in: ids } } }),
    customer.priceListId && listActive ? db.priceListItem.findMany({ where: { priceListId: customer.priceListId, productId: { in: ids } } }) : Promise.resolve([]),
  ]);
  const o = new Map(overrides.map((x) => [x.productId, x]));
  const l = new Map(listItems.map((x) => [x.productId, x]));

  const rows = products.map((p) => {
    const defaultRate = num(p.defaultRate);
    const ov = o.get(p.id);
    const override = dated(ov);
    const listRate = dated(l.get(p.id));
    const effective = resolvePrice({ defaultRate, listRate, override }, onDate);
    const cost = num(p.purchaseCost);
    return {
      productId: p.id, code: p.code, name: p.name, unit: p.unit, isActive: p.isActive,
      category: p.category.name, brand: p.brand?.name ?? null,
      mrp: num(p.mrp), defaultRate, listRate, override: override ? { ...override, note: ov?.note ?? null } : null, effective,
      ...(opts.includeCost ? { purchaseCost: cost, marginPct: effective.rate ? Math.round(((effective.rate - cost) / effective.rate) * 1000) / 10 : null } : {}),
    };
  });
  return { customer: { ...customer, priceList: customer.priceList }, onDate, rows };
}

export { numOrNull };
