import { TRPCError } from '@trpc/server';
import { istDateString, percentOff } from '@kush/core';
import { Prisma } from '@kush/db';
import { z } from 'zod';
import {
  bulkAdjustInput, customerSheetInput, priceHistoryInput, priceListInput, setCustomerPricesInput, setPriceListItemsInput,
} from '../schemas';
import { logActivity } from '../services/activity';
import { isoDay, num, numOrNull } from '../services/num';
import { applyCustomerPrices, applyPriceListItems, customerPriceSheet, type PriceRow } from '../services/pricing';
import { ownerProcedure, permissionProcedure, router } from '../trpc';

// Viewing prices needs "View prices / margins"; changing them is the owner's call.
const view = permissionProcedure('VIEW_PRICES_MARGINS');

const productFilter = (i: { q?: string; categoryId?: string; brandId?: string }): Prisma.ProductWhereInput => ({
  ...(i.categoryId ? { categoryId: i.categoryId } : {}),
  ...(i.brandId ? { brandId: i.brandId } : {}),
  ...(i.q ? { OR: [{ name: { contains: i.q, mode: 'insensitive' } }, { code: { contains: i.q, mode: 'insensitive' } }] } : {}),
});

export const pricingRouter = router({
  /** Pick a customer and see every product: default, list, special and effective rate, with difference. */
  customerSheet: view.input(customerSheetInput).query(async ({ ctx, input }) => {
    const sheet = await customerPriceSheet(ctx.db, input.customerId, { where: productFilter(input), onDate: input.onDate, includeCost: true });
    return input.onlySpecial ? { ...sheet, rows: sheet.rows.filter((r) => r.effective.source !== 'DEFAULT') } : sheet;
  }),

  setCustomerPrices: ownerProcedure.input(setCustomerPricesInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction((tx) => applyCustomerPrices(tx, { customerId: input.customerId, rows: input.rows, actorId: ctx.user.id, source: input.source, ip: ctx.ip }), { timeout: 60_000 })),

  /** Bulk edit: set % off default, a fixed rate, or clear special prices for many products at once. */
  bulkAdjust: ownerProcedure.input(bulkAdjustInput).mutation(async ({ ctx, input }) => {
    const products = await ctx.db.product.findMany({ where: { id: { in: input.productIds } }, select: { id: true, defaultRate: true } });
    const rows: PriceRow[] = products.map((p) => ({
      productId: p.id,
      rate: input.mode === 'CLEAR' ? null : input.mode === 'FIXED' ? input.value! : percentOff(num(p.defaultRate), input.value!),
      validFrom: input.validFrom, validTo: input.validTo,
    }));
    return ctx.db.$transaction((tx) => applyCustomerPrices(tx, { customerId: input.customerId, rows, actorId: ctx.user.id, source: 'bulk', ip: ctx.ip }), { timeout: 60_000 });
  }),

  history: view.input(priceHistoryInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db.priceChangeLog.findMany({
      where: {
        ...(input.productId ? { productId: input.productId } : {}),
        ...(input.customerId ? { scope: 'CUSTOMER', scopeRefId: input.customerId } : {}),
        ...(input.priceListId ? { scope: 'PRICE_LIST', scopeRefId: input.priceListId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
      include: { product: { select: { code: true, name: true } }, changedBy: { select: { name: true } } },
    });
    return rows.map((r) => ({ ...r, oldRate: numOrNull(r.oldRate), newRate: numOrNull(r.newRate), validFrom: isoDay(r.validFrom), validTo: isoDay(r.validTo) }));
  }),

  today: view.query(() => istDateString()),

  /** Customer picker for the workbench (pricing viewers may not have MANAGE_CUSTOMERS). */
  customers: view.query(({ ctx }) =>
    ctx.db.customer.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, type: true, priceList: { select: { name: true } } },
    })),
});

export const priceListsRouter = router({
  list: view.query(async ({ ctx }) =>
    ctx.db.priceList.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }], include: { _count: { select: { items: true, customers: true } } } })),

  get: view.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const l = await ctx.db.priceList.findUnique({
      where: { id: input.id },
      include: {
        customers: { select: { id: true, code: true, name: true, type: true }, orderBy: { name: 'asc' } },
        items: { include: { product: { select: { id: true, code: true, name: true, defaultRate: true, mrp: true, purchaseCost: true, category: { select: { name: true } } } } }, orderBy: { product: { name: 'asc' } } },
      },
    });
    if (!l) throw new TRPCError({ code: 'NOT_FOUND', message: 'Price list not found' });
    return {
      ...l,
      items: l.items.map((i) => ({
        productId: i.productId, code: i.product.code, name: i.product.name, category: i.product.category.name,
        rate: num(i.rate), validFrom: isoDay(i.validFrom), validTo: isoDay(i.validTo),
        defaultRate: num(i.product.defaultRate), mrp: num(i.product.mrp), purchaseCost: num(i.product.purchaseCost),
      })),
    };
  }),

  create: ownerProcedure.input(priceListInput).mutation(async ({ ctx, input }) => {
    try {
      const l = await ctx.db.priceList.create({ data: input });
      await logActivity(ctx.db, { actorId: ctx.user.id, action: 'price.list_create', entityType: 'PriceList', entityId: l.id, summary: `Created price list "${l.name}"`, ip: ctx.ip });
      return l;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new TRPCError({ code: 'CONFLICT', message: 'A price list with that name exists' });
      throw e;
    }
  }),

  update: ownerProcedure.input(priceListInput.extend({ id: z.string(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    const l = await ctx.db.priceList.update({ where: { id }, data });
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'price.list_update', entityType: 'PriceList', entityId: l.id, summary: `Updated price list "${l.name}"${l.isActive ? '' : ' (inactive)'}`, ip: ctx.ip });
    return l;
  }),

  setItems: ownerProcedure.input(setPriceListItemsInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction((tx) => applyPriceListItems(tx, { priceListId: input.priceListId, rows: input.rows, actorId: ctx.user.id, source: input.source, ip: ctx.ip }), { timeout: 60_000 })),

  assignCustomers: ownerProcedure.input(z.object({ priceListId: z.string(), customerIds: z.array(z.string()).max(2000) })).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const l = await tx.priceList.findUnique({ where: { id: input.priceListId } });
      if (!l) throw new TRPCError({ code: 'NOT_FOUND' });
      const r = await tx.customer.updateMany({ where: { id: { in: input.customerIds } }, data: { priceListId: l.id } });
      await logActivity(tx, { actorId: ctx.user.id, action: 'price.assign_list', entityType: 'PriceList', entityId: l.id, summary: `Assigned "${l.name}" to ${r.count} customer(s)`, ip: ctx.ip });
      return { count: r.count };
    })),
});
