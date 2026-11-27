import { TRPCError } from '@trpc/server';
import { can, expandPowerRange, istDateString, variantLabel, variantSku, type Principal } from '@kush/core';
import { Prisma, type Tx } from '@kush/db';
import { z } from 'zod';
import {
  brandInput, productCreateInput, productListInput, productUpdateInput, variantAddInput, variantGenerateInput, variantUpdateInput,
} from '../schemas';
import { diff, logActivity } from '../services/activity';
import { nextBarcode } from '../services/counters';
import { num, numOrNull } from '../services/num';
import { getSettings } from '../services/settings';
import { permissionProcedure, router, staffProcedure } from '../trpc';

const canSeeCost = (u: Principal) => can(u, 'VIEW_PRICES_MARGINS');

function conflict(e: unknown, what: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const f = String((e.meta?.target as string[] | undefined)?.join(', ') ?? 'value');
    throw new TRPCError({ code: 'CONFLICT', message: `${what}: that ${f} is already used` });
  }
  throw e;
}

const variantSelect = {
  id: true, sku: true, powerSph: true, cylinder: true, addPower: true, label: true, barcode: true, gtin: true,
  purchaseCost: true, mrp: true, reorderLevel: true, isActive: true,
  aliases: { select: { code: true }, orderBy: { createdAt: 'asc' } },
} as const;

type VariantRow = Prisma.ProductVariantGetPayload<{ select: typeof variantSelect }>;
const variantView = ({ aliases: _a, ...v }: VariantRow, showCost: boolean) => ({
  ...v,
  powerSph: numOrNull(v.powerSph), cylinder: numOrNull(v.cylinder), addPower: numOrNull(v.addPower),
  mrp: numOrNull(v.mrp),
  purchaseCost: showCost ? numOrNull(v.purchaseCost) : undefined,
  linkedCodes: _a.map((a) => a.code),
});

/** Settings-driven checks that zod can't do (GST rate and unit come from Settings). */
async function checkAgainstSettings(tx: Tx, input: { gstRate: number; unit: string; categoryId: string; brandId: string | null }) {
  const s = await getSettings(tx);
  if (!s.gstRates.map(Number).includes(input.gstRate)) throw new TRPCError({ code: 'BAD_REQUEST', message: `GST ${input.gstRate}% is not in Settings → GST rates` });
  if (!s.units.includes(input.unit)) throw new TRPCError({ code: 'BAD_REQUEST', message: `Unit "${input.unit}" is not in Settings → Units` });
  if (!(await tx.category.findUnique({ where: { id: input.categoryId } }))) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Category not found' });
  if (input.brandId && !(await tx.brand.findUnique({ where: { id: input.brandId } }))) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Brand not found' });
}

async function createVariants(
  tx: Tx,
  product: { id: string; code: string },
  combos: { powerSph: number | null; cylinder: number | null; addPower: number | null; gtin?: string | null }[],
) {
  const existing = await tx.productVariant.findMany({ where: { productId: product.id }, select: { powerSph: true, cylinder: true, addPower: true } });
  const key = (v: { powerSph: unknown; cylinder: unknown; addPower: unknown }) =>
    [v.powerSph, v.cylinder, v.addPower].map((x) => (x == null ? '' : Number(x).toFixed(2))).join('|');
  const have = new Set(existing.map(key));
  let created = 0;
  for (const c of combos) {
    if (have.has(key(c))) continue;
    have.add(key(c));
    await tx.productVariant.create({
      data: {
        productId: product.id,
        sku: variantSku(product.code, c),
        powerSph: c.powerSph, cylinder: c.cylinder, addPower: c.addPower,
        label: variantLabel(c) || null,
        barcode: await nextBarcode(tx),
        gtin: c.gtin ?? null,
      },
    }).catch((e) => conflict(e, 'Variant'));
    created++;
  }
  return { created, skipped: combos.length - created };
}

export const brandsRouter = router({
  list: staffProcedure.query(({ ctx }) =>
    ctx.db.brand.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { products: true } } } })),
  create: permissionProcedure('MANAGE_PRODUCTS').input(brandInput).mutation(async ({ ctx, input }) => {
    const b = await ctx.db.brand.create({ data: input }).catch((e) => conflict(e, 'Brand'));
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'brand.create', entityType: 'Brand', entityId: b.id, summary: `Added brand ${b.name}`, ip: ctx.ip });
    return b;
  }),
  update: permissionProcedure('MANAGE_PRODUCTS').input(brandInput.extend({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    const b = await ctx.db.brand.update({ where: { id }, data }).catch((e) => conflict(e, 'Brand'));
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'brand.update', entityType: 'Brand', entityId: b.id, summary: `Updated brand ${b.name}`, ip: ctx.ip });
    return b;
  }),
});

export const productsRouter = router({
  /** Catalogue for staff. Purchase cost is only included for users with "View prices / margins". */
  list: staffProcedure.input(productListInput).query(async ({ ctx, input }) => {
    const showCost = canSeeCost(ctx.user);
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(input?.includeInactive ? {} : { isActive: true }),
      ...(input?.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input?.brandId ? { brandId: input.brandId } : {}),
      ...(input?.lensType ? { lensType: input.lensType } : {}),
      ...(input?.power !== undefined ? { variants: { some: { powerSph: input.power, isActive: true } } } : {}),
      ...(input?.q
        ? { OR: [
            { name: { contains: input.q, mode: 'insensitive' } },
            { code: { contains: input.q, mode: 'insensitive' } },
            { model: { contains: input.q, mode: 'insensitive' } },
            { variants: { some: { OR: [{ sku: { contains: input.q, mode: 'insensitive' } }, { barcode: input.q }, { gtin: input.q }] } } },
          ] }
        : {}),
    };
    const products = await ctx.db.product.findMany({
      where,
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      take: 500,
      select: {
        id: true, code: true, name: true, model: true, hsnCode: true, gstRate: true, unit: true, isLens: true, lensType: true,
        defaultRate: true, mrp: true, purchaseCost: true, isActive: true, trackSerial: true,
        category: { select: { id: true, name: true } }, brand: { select: { id: true, name: true } },
      },
    });
    const stats = await ctx.db.productVariant.groupBy({
      by: ['productId'],
      where: { productId: { in: products.map((p) => p.id) }, isActive: true },
      _count: { _all: true },
      _min: { powerSph: true },
      _max: { powerSph: true },
    });
    const s = new Map(stats.map((x) => [x.productId, x]));
    return products.map((p) => ({
      ...p,
      gstRate: num(p.gstRate), defaultRate: num(p.defaultRate), mrp: num(p.mrp),
      purchaseCost: showCost ? num(p.purchaseCost) : undefined,
      variantCount: s.get(p.id)?._count._all ?? 0,
      powerMin: numOrNull(s.get(p.id)?._min.powerSph), powerMax: numOrNull(s.get(p.id)?._max.powerSph),
    }));
  }),

  /**
   * Find items to add to an order, invoice or receipt: every word must match the name, code, model,
   * brand, SKU, power label or barcode; a number also matches the power ("21.5", "+21.50", "-3").
   * Many items carry no barcode, so this is the main way to add them. Stock is unexpired units on hand.
   */
  search: staffProcedure.input(z.object({ q: z.string().trim().min(1).max(100), limit: z.number().int().min(1).max(50).default(30) })).query(async ({ ctx, input }) => {
    const words = input.q.split(/\s+/).filter(Boolean).slice(0, 6);
    const where: Prisma.ProductVariantWhereInput = {
      isActive: true, deletedAt: null, product: { isActive: true, deletedAt: null },
      AND: words.map((w) => {
        const power = /^[+-]?\d{1,2}(\.\d{1,2})?$/.test(w) ? Number(w) : null;
        const text: Prisma.ProductVariantWhereInput[] = [
          { product: { name: { contains: w, mode: 'insensitive' } } }, { product: { code: { contains: w, mode: 'insensitive' } } },
          { product: { model: { contains: w, mode: 'insensitive' } } }, { product: { brand: { name: { contains: w, mode: 'insensitive' } } } },
          { sku: { contains: w, mode: 'insensitive' } }, { label: { contains: w, mode: 'insensitive' } }, { barcode: w }, { gtin: w }, { aliases: { some: { code: w } } },
        ];
        return { OR: power == null ? text : [...text, { powerSph: power }] };
      }),
    };
    const rows = await ctx.db.productVariant.findMany({
      where, take: input.limit + 1,
      orderBy: [{ product: { name: 'asc' } }, { powerSph: 'asc' }, { cylinder: 'asc' }, { addPower: 'asc' }],
      select: { id: true, sku: true, label: true, product: { select: { id: true, code: true, name: true, unit: true, trackSerial: true, trackBatch: true, trackExpiry: true } } },
    });
    const shown = rows.slice(0, input.limit);
    const today = new Date(`${istDateString()}T00:00:00Z`);
    const stock = await ctx.db.stockBalance.groupBy({
      by: ['variantId'], _sum: { qty: true },
      where: { variantId: { in: shown.map((v) => v.id) }, qty: { gt: 0 }, OR: [{ batch: { expiryDate: null } }, { batch: { expiryDate: { gte: today } } }] },
    });
    const qty = new Map(stock.map((r) => [r.variantId, r._sum.qty ?? 0]));
    return {
      more: rows.length > input.limit,
      rows: shown.map((v) => ({
        variantId: v.id, productId: v.product.id, code: v.product.code, productName: v.product.name, label: v.label, sku: v.sku, unit: v.product.unit,
        trackSerial: v.product.trackSerial, trackBatch: v.product.trackBatch, trackExpiry: v.product.trackExpiry, inStock: qty.get(v.id) ?? 0,
      })),
    };
  }),

  get: staffProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const showCost = canSeeCost(ctx.user);
    const p = await ctx.db.product.findUnique({
      where: { id: input.id },
      include: {
        category: true, brand: true,
        variants: { orderBy: [{ powerSph: 'asc' }, { cylinder: 'asc' }, { addPower: 'asc' }], select: variantSelect },
        supplierLinks: { include: { supplier: { select: { id: true, name: true, code: true } } } },
      },
    });
    if (!p || p.deletedAt) throw new TRPCError({ code: 'NOT_FOUND', message: 'Product not found' });
    return {
      ...p,
      gstRate: num(p.gstRate), defaultRate: num(p.defaultRate), mrp: num(p.mrp),
      purchaseCost: showCost ? num(p.purchaseCost) : undefined,
      aConstant: numOrNull(p.aConstant), opticSizeMm: numOrNull(p.opticSizeMm), overallLenMm: numOrNull(p.overallLenMm),
      variants: p.variants.map((v) => variantView(v, showCost)),
      // Purchase rates are cost information: shown to cost viewers and PO creators only.
      supplierLinks: p.supplierLinks.map((l) => ({
        supplier: l.supplier, supplierSku: l.supplierSku, lastPurchasedAt: l.lastPurchasedAt,
        lastPurchaseRate: showCost || can(ctx.user, 'CREATE_PURCHASE_ORDERS') ? numOrNull(l.lastPurchaseRate) : undefined,
      })),
      canSeeCost: showCost,
    };
  }),

  create: permissionProcedure('MANAGE_PRODUCTS').input(productCreateInput).mutation(async ({ ctx, input }) => {
    const showCost = canSeeCost(ctx.user);
    if (input.purchaseCost != null && !showCost) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only users who can view costs may set the purchase cost' });
    const combos = input.powerRange ? expandPowerRange(input.powerRange) : null;
    if (combos && !input.isLens) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Power ranges are only for lenses' });
    const { powerRange: _pr, purchaseCost, ...data } = input;
    return ctx.db.$transaction(async (tx) => {
      await checkAgainstSettings(tx, input);
      const p = await tx.product.create({ data: { ...data, purchaseCost: purchaseCost ?? 0 } }).catch((e) => conflict(e, 'Product'));
      // Non-lens items get one variant straight away (SKU = product code); lenses get one per power.
      const v = combos ? await createVariants(tx, p, combos) : input.isLens ? { created: 0, skipped: 0 } : await createVariants(tx, p, [{ powerSph: null, cylinder: null, addPower: null }]);
      if (!combos && !input.isLens) await tx.productVariant.updateMany({ where: { productId: p.id }, data: { sku: p.code } });
      await tx.priceChangeLog.create({ data: { productId: p.id, scope: 'DEFAULT', newRate: p.defaultRate, changedById: ctx.user.id, source: 'ui' } });
      await logActivity(tx, {
        actorId: ctx.user.id, action: 'product.create', entityType: 'Product', entityId: p.id, ip: ctx.ip,
        summary: `Added ${p.code} ${p.name}${v.created ? ` with ${v.created} variant(s)` : ''}`,
      });
      return { id: p.id, variantsCreated: v.created };
    });
  }),

  update: permissionProcedure('MANAGE_PRODUCTS').input(productUpdateInput).mutation(async ({ ctx, input }) => {
    const showCost = canSeeCost(ctx.user);
    const { id, purchaseCost, ...data } = input;
    return ctx.db.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id } });
      if (!before || before.deletedAt) throw new TRPCError({ code: 'NOT_FOUND', message: 'Product not found' });
      if (purchaseCost != null && num(before.purchaseCost) !== purchaseCost && !showCost) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only users who can view costs may change the purchase cost' });
      }
      await checkAgainstSettings(tx, input);
      if (data.code !== before.code) {
        const used = await tx.invoiceLine.count({ where: { variant: { productId: id } } });
        if (used) throw new TRPCError({ code: 'BAD_REQUEST', message: 'The code cannot change after the product has been invoiced' });
      }
      const patch = { ...data, ...(showCost && purchaseCost != null ? { purchaseCost } : {}) };
      const after = await tx.product.update({ where: { id }, data: patch }).catch((e) => conflict(e, 'Product'));

      // Price history for default rate, MRP and cost
      const changes: { scope: string; old: Prisma.Decimal; neu: Prisma.Decimal }[] = [];
      if (!before.defaultRate.equals(after.defaultRate)) changes.push({ scope: 'DEFAULT', old: before.defaultRate, neu: after.defaultRate });
      if (!before.mrp.equals(after.mrp)) changes.push({ scope: 'MRP', old: before.mrp, neu: after.mrp });
      if (!before.purchaseCost.equals(after.purchaseCost)) changes.push({ scope: 'COST', old: before.purchaseCost, neu: after.purchaseCost });
      for (const c of changes) {
        await tx.priceChangeLog.create({ data: { productId: id, scope: c.scope, oldRate: c.old, newRate: c.neu, changedById: ctx.user.id, source: 'ui' } });
      }
      const plain = (p: typeof before) => ({ ...p, defaultRate: num(p.defaultRate), mrp: num(p.mrp), gstRate: num(p.gstRate), purchaseCost: num(p.purchaseCost), aConstant: numOrNull(p.aConstant), opticSizeMm: numOrNull(p.opticSizeMm), overallLenMm: numOrNull(p.overallLenMm) });
      const d = diff(plain(before) as unknown as Record<string, unknown>, plain(after) as unknown as Record<string, unknown>);
      const changed = d.changed.filter((k) => k !== 'updatedAt');
      if (changed.length) {
        const hide = (o: Record<string, unknown>) => (showCost ? o : { ...o, purchaseCost: undefined });
        await logActivity(tx, {
          actorId: ctx.user.id, action: 'product.update', entityType: 'Product', entityId: id, ip: ctx.ip,
          summary: `Updated ${after.code}: ${changed.join(', ')}`, before: hide(d.before), after: hide(d.after),
        });
      }
      return { id };
    });
  }),

  setActive: permissionProcedure('MANAGE_PRODUCTS').input(z.object({ id: z.string(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    const p = await ctx.db.product.update({ where: { id: input.id }, data: { isActive: input.isActive } });
    await logActivity(ctx.db, { actorId: ctx.user.id, action: input.isActive ? 'product.activate' : 'product.deactivate', entityType: 'Product', entityId: p.id, summary: `${input.isActive ? 'Activated' : 'Deactivated'} ${p.code}`, ip: ctx.ip });
    return { ok: true };
  }),

  generateVariants: permissionProcedure('MANAGE_PRODUCTS').input(variantGenerateInput).mutation(async ({ ctx, input }) => {
    let combos;
    try { combos = expandPowerRange(input.range); } catch (e) { throw new TRPCError({ code: 'BAD_REQUEST', message: (e as Error).message }); }
    return ctx.db.$transaction(async (tx) => {
      const p = await tx.product.findUnique({ where: { id: input.productId } });
      if (!p) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!p.isLens) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Power ranges are only for lenses' });
      const r = await createVariants(tx, p, combos);
      await logActivity(tx, { actorId: ctx.user.id, action: 'product.variants', entityType: 'Product', entityId: p.id, summary: `${p.code}: generated ${r.created} power variant(s), ${r.skipped} already existed`, ip: ctx.ip });
      return r;
    }, { timeout: 30_000 });
  }),

  addVariant: permissionProcedure('MANAGE_PRODUCTS').input(variantAddInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const p = await tx.product.findUnique({ where: { id: input.productId } });
      if (!p) throw new TRPCError({ code: 'NOT_FOUND' });
      const r = await createVariants(tx, p, [input]);
      if (!r.created) throw new TRPCError({ code: 'CONFLICT', message: 'That power combination already exists' });
      await logActivity(tx, { actorId: ctx.user.id, action: 'product.variants', entityType: 'Product', entityId: p.id, summary: `${p.code}: added variant ${variantLabel(input) || 'standard'}`, ip: ctx.ip });
      return r;
    })),

  updateVariant: permissionProcedure('MANAGE_PRODUCTS').input(variantUpdateInput).mutation(async ({ ctx, input }) => {
    const showCost = canSeeCost(ctx.user);
    const { id, purchaseCost, ...data } = input;
    const before = await ctx.db.productVariant.findUnique({ where: { id }, include: { product: { select: { code: true } } } });
    if (!before) throw new TRPCError({ code: 'NOT_FOUND' });
    if (purchaseCost !== undefined && numOrNull(before.purchaseCost) !== purchaseCost && !showCost) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Only users who can view costs may change the purchase cost' });
    }
    const v = await ctx.db.productVariant
      .update({ where: { id }, data: { ...data, mrp: data.mrp ?? null, ...(showCost && purchaseCost !== undefined ? { purchaseCost } : {}) } })
      .catch((e) => conflict(e, 'Variant'));
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'product.variant_update', entityType: 'ProductVariant', entityId: v.id, summary: `${v.sku} updated`, ip: ctx.ip });
    return { id: v.id };
  }),

  /** Hard delete only while the variant has never been stocked or sold; otherwise deactivate. */
  removeVariant: permissionProcedure('MANAGE_PRODUCTS').input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const v = await ctx.db.productVariant.findUnique({
      where: { id: input.id },
      include: { _count: { select: { batches: true, movements: true, orderLines: true, invoiceLines: true, poLines: true, proformaLines: true } } },
    });
    if (!v) throw new TRPCError({ code: 'NOT_FOUND' });
    const used = Object.values(v._count).reduce((a, b) => a + b, 0);
    if (used) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This variant has stock or documents; deactivate it instead' });
    await ctx.db.productVariant.delete({ where: { id: v.id } });
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'product.variant_delete', entityType: 'ProductVariant', entityId: v.id, summary: `Deleted variant ${v.sku}`, ip: ctx.ip });
    return { ok: true };
  }),

});
