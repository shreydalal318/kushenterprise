import { TRPCError } from '@trpc/server';
import {
  addDays, can, expiryBucket, istDateString, stockStatus, type StockStatus,
} from '@kush/core';
import type { Prisma } from '@kush/db';
import { z } from 'zod';
import {
  adjustInput, grnCreateInput, ledgerInput, locationInput, openingStockInput, stockOverviewInput, supplierReturnInput,
} from '../schemas';
import { logActivity } from '../services/activity';
import { nextDocNumber } from '../services/numbering';
import { dayToDate, isoDay, num } from '../services/num';
import { createReceipt } from '../services/receipts';
import { getSettings } from '../services/settings';
import { costOf, defaultLocationId, ensureBatch, fefoPick, loadVariant, postMovement, reorderLevelOf, variantStock } from '../services/stock';
import { ownerProcedure, permissionProcedure, router, staffProcedure } from '../trpc';

const manage = permissionProcedure('MANAGE_STOCK');
const seeCost = (u: Parameters<typeof can>[0]) => can(u, 'VIEW_PRICES_MARGINS');

export const inventoryRouter = router({
  // ---------------- views ----------------
  /** Stock by product: quantity, powers in stock, low/out counts, expiring soon, status. */
  overview: staffProcedure.input(stockOverviewInput).query(async ({ ctx, input }) => {
    const s = await getSettings(ctx.db);
    const today = istDateString();
    const window = Math.max(...s.expiryAlertDays);
    const products = await ctx.db.product.findMany({
      where: {
        deletedAt: null, isActive: true,
        ...(input?.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input?.q ? { OR: [{ name: { contains: input.q, mode: 'insensitive' } }, { code: { contains: input.q, mode: 'insensitive' } }] } : {}),
      },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      select: {
        id: true, code: true, name: true, unit: true, isLens: true, reorderLevel: true, category: { select: { name: true } },
        variants: { where: { isActive: true, deletedAt: null }, select: { id: true, reorderLevel: true } },
      },
    });
    const stock = await variantStock(ctx.db, products.flatMap((p) => p.variants.map((v) => v.id)));
    const everStocked = new Set((await ctx.db.stockMovement.groupBy({ by: ['variantId'], where: { variantId: { in: products.flatMap((p) => p.variants.map((v) => v.id)) } } })).map((r) => r.variantId));
    const showCost = seeCost(ctx.user);
    const rows = products.map((p) => {
      let qty = 0, value = 0, inStock = 0, low = 0, out = 0, expiring = 0;
      let nearestExpiry: string | null = null;
      for (const v of p.variants) {
        const st = stock.get(v.id);
        const vq = st?.qty ?? 0;
        qty += vq; value += st?.value ?? 0;
        if (vq > 0) inStock++;
        const status = stockStatus({ qty: vq, reorderLevel: reorderLevelOf({ reorderLevel: v.reorderLevel, product: p }, s.defaultReorderLevel), nearestExpiry: st?.nearestExpiry }, today, window);
        // Lens powers that were never stocked aren't "out of stock" alerts; they're simply not carried.
        if (status === 'OUT_OF_STOCK' && (everStocked.has(v.id) || !p.isLens)) out++;
        if (status === 'LOW_STOCK') low++;
        if (st?.nearestExpiry && st.nearestExpiry <= addDays(today, window)) { expiring++; if (!nearestExpiry || st.nearestExpiry < nearestExpiry) nearestExpiry = st.nearestExpiry; }
      }
      const status: StockStatus = qty <= 0 ? 'OUT_OF_STOCK' : low || out ? 'LOW_STOCK' : expiring ? 'EXPIRING_SOON' : 'IN_STOCK';
      return {
        productId: p.id, code: p.code, name: p.name, unit: p.unit, category: p.category.name, isLens: p.isLens,
        qty, variantCount: p.variants.length, variantsInStock: inStock, lowCount: low, outCount: out, expiringCount: expiring, nearestExpiry, status,
        value: showCost ? Math.round(value * 100) / 100 : undefined,
      };
    });
    return rows.filter((r) => (!input?.onlyInStock || r.qty > 0) && (!input?.status || r.status === input.status || (input.status === 'EXPIRING_SOON' && r.expiringCount > 0)));
  }),

  /** One product: every variant with quantity, status and its batches (FEFO order) and serials. */
  productStock: staffProcedure.input(z.object({ productId: z.string() })).query(async ({ ctx, input }) => {
    const s = await getSettings(ctx.db);
    const today = istDateString();
    const window = Math.max(...s.expiryAlertDays);
    const showCost = seeCost(ctx.user);
    const p = await ctx.db.product.findUnique({
      where: { id: input.productId },
      include: { category: true, variants: { where: { deletedAt: null }, orderBy: [{ powerSph: 'asc' }, { cylinder: 'asc' }, { addPower: 'asc' }], include: { _count: { select: { aliases: true } } } } },
    });
    if (!p) throw new TRPCError({ code: 'NOT_FOUND' });
    const balances = await ctx.db.stockBalance.findMany({
      where: { variantId: { in: p.variants.map((v) => v.id) }, qty: { gt: 0 } },
      include: { batch: { include: { serials: { where: { status: 'IN_STOCK' }, select: { serialNo: true, locationId: true } } } }, location: { select: { id: true, name: true } } },
    });
    return {
      product: { id: p.id, code: p.code, name: p.name, unit: p.unit, isLens: p.isLens, category: p.category.name, trackSerial: p.trackSerial, trackBatch: p.trackBatch, trackExpiry: p.trackExpiry },
      variants: p.variants.map((v) => {
        const bs = balances.filter((b) => b.variantId === v.id)
          .map((b) => ({
            batchId: b.batchId, batchNo: b.batch.batchNo, expiryDate: isoDay(b.batch.expiryDate), location: b.location, qty: b.qty, reserved: b.reserved,
            serials: b.batch.serials.filter((x) => !x.locationId || x.locationId === b.locationId).map((x) => x.serialNo),
            expired: !!b.batch.expiryDate && isoDay(b.batch.expiryDate)! < today,
            unitCost: showCost ? costOf(b.batch, { purchaseCost: v.purchaseCost, product: p }) : undefined,
          }))
          .sort((a, b) => (a.expiryDate ?? '9999') < (b.expiryDate ?? '9999') ? -1 : 1);
        const qty = bs.reduce((t, b) => t + b.qty, 0);
        const nearestExpiry = bs.find((b) => b.expiryDate)?.expiryDate ?? null;
        const reorderLevel = reorderLevelOf({ reorderLevel: v.reorderLevel, product: p }, s.defaultReorderLevel);
        return { id: v.id, sku: v.sku, label: v.label, barcode: v.barcode, gtin: v.gtin, aliasCount: v._count.aliases, isActive: v.isActive, qty, reorderLevel, nearestExpiry, status: stockStatus({ qty, reorderLevel, nearestExpiry }, today, window), batches: bs };
      }),
    };
  }),

  /** Stock ledger for one variant: opening balance, every movement with running balance, closing. */
  ledger: permissionProcedure('MANAGE_STOCK').input(ledgerInput).query(async ({ ctx, input }) => {
    const v = await loadVariant(ctx.db, input.variantId);
    const from = input.from ? dayToDate(input.from)! : undefined;
    const toExcl = input.to ? dayToDate(addDays(input.to, 1))! : undefined; // inclusive "to" date
    const where = { variantId: v.id, ...(input.locationId ? { locationId: input.locationId } : {}) };
    // Dates are IST calendar days; the boundary is midnight IST (UTC+5:30).
    const istMidnight = (d: Date) => new Date(d.getTime() - 330 * 60_000);
    const opening = from ? (await ctx.db.stockMovement.aggregate({ where: { ...where, createdAt: { lt: istMidnight(from) } }, _sum: { qty: true } }))._sum.qty ?? 0 : 0;
    const rows = await ctx.db.stockMovement.findMany({
      where: { ...where, createdAt: { ...(from ? { gte: istMidnight(from) } : {}), ...(toExcl ? { lt: istMidnight(toExcl) } : {}) } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 5000,
      include: { batch: { select: { batchNo: true, expiryDate: true } }, location: { select: { name: true } }, createdBy: { select: { name: true } } },
    });
    let bal = opening;
    const totals: Record<string, number> = {};
    const out = rows.map((r) => {
      bal += r.qty;
      totals[r.type] = (totals[r.type] ?? 0) + r.qty;
      return {
        id: r.id, at: r.createdAt, type: r.type, ref: r.note, batchNo: r.batch.batchNo, expiryDate: isoDay(r.batch.expiryDate), location: r.location.name,
        qtyIn: r.qty > 0 ? r.qty : 0, qtyOut: r.qty < 0 ? -r.qty : 0, balance: bal, reason: r.reason, serialNos: r.serialNos, by: r.createdBy.name,
      };
    });
    return { variant: { id: v.id, sku: v.sku, label: v.label, productName: v.product.name, productId: v.productId }, opening, rows: out, closing: bal, totals };
  }),

  /** Batches expiring within the alert window (and already expired), with value at cost if allowed. */
  expiring: permissionProcedure('MANAGE_STOCK').input(z.object({ days: z.number().int().min(1).max(730).optional() }).optional()).query(async ({ ctx, input }) => {
    const s = await getSettings(ctx.db);
    const today = istDateString();
    const days = input?.days ?? Math.max(...s.expiryAlertDays);
    const showCost = seeCost(ctx.user);
    const balances = await ctx.db.stockBalance.findMany({
      where: { qty: { gt: 0 }, batch: { expiryDate: { lte: dayToDate(addDays(today, days))! } } },
      include: { batch: true, location: { select: { name: true } }, variant: { include: { product: { select: { id: true, name: true, code: true, purchaseCost: true } } } } },
      orderBy: { batch: { expiryDate: 'asc' } },
    });
    return {
      today, alertDays: s.expiryAlertDays,
      rows: balances.map((b) => {
        const expiry = isoDay(b.batch.expiryDate)!;
        return {
          productId: b.variant.product.id, productName: b.variant.product.name, code: b.variant.product.code, variantId: b.variantId, label: b.variant.label, sku: b.variant.sku,
          batchId: b.batchId, batchNo: b.batch.batchNo, expiryDate: expiry, bucket: expiryBucket(expiry, today, [...s.expiryAlertDays, days]) ?? `${days} days`,
          qty: b.qty, location: b.location.name, value: showCost ? Math.round(b.qty * costOf(b.batch, b.variant) * 100) / 100 : undefined,
        };
      }),
    };
  }),

  /** Items at or below their reorder level. Lens powers never stocked are left out unless asked. */
  lowStock: permissionProcedure('MANAGE_STOCK').input(z.object({ includeNeverStocked: z.boolean().default(false) }).optional()).query(async ({ ctx, input }) => {
    const s = await getSettings(ctx.db);
    const variants = await ctx.db.productVariant.findMany({
      where: { isActive: true, deletedAt: null, product: { isActive: true, deletedAt: null } },
      include: { product: { select: { id: true, name: true, code: true, reorderLevel: true, isLens: true, supplierLinks: { take: 1, include: { supplier: { select: { id: true, name: true } } } } } } },
    });
    const stock = await variantStock(ctx.db, variants.map((v) => v.id));
    const everStocked = new Set((await ctx.db.stockMovement.groupBy({ by: ['variantId'] })).map((r) => r.variantId));
    return variants
      .map((v) => ({ v, qty: stock.get(v.id)?.qty ?? 0, level: reorderLevelOf(v, s.defaultReorderLevel) }))
      .filter(({ v, qty, level }) => qty <= level && (input?.includeNeverStocked || everStocked.has(v.id) || (!v.product.isLens && v.reorderLevel != null)))
      .map(({ v, qty, level }) => ({
        variantId: v.id, productId: v.product.id, productName: v.product.name, code: v.product.code, sku: v.sku, label: v.label,
        qty, reorderLevel: level, suggestedOrder: Math.max(level * 2 - qty, 1), supplier: v.product.supplierLinks[0]?.supplier ?? null,
      }))
      .sort((a, b) => a.qty - b.qty || a.productName.localeCompare(b.productName));
  }),

  /** Stock valuation at cost, by category and product (owner only). */
  valuation: ownerProcedure.query(async ({ ctx }) => {
    const balances = await ctx.db.stockBalance.findMany({
      where: { qty: { gt: 0 } },
      include: { batch: { select: { unitCost: true } }, variant: { select: { purchaseCost: true, product: { select: { id: true, code: true, name: true, purchaseCost: true, defaultRate: true, category: { select: { name: true } } } } } } },
    });
    const byProduct = new Map<string, { productId: string; code: string; name: string; category: string; qty: number; value: number; atDefaultRate: number }>();
    for (const b of balances) {
      const p = b.variant.product;
      const cur = byProduct.get(p.id) ?? { productId: p.id, code: p.code, name: p.name, category: p.category.name, qty: 0, value: 0, atDefaultRate: 0 };
      cur.qty += b.qty;
      cur.value += b.qty * costOf(b.batch, b.variant);
      cur.atDefaultRate += b.qty * num(p.defaultRate);
      byProduct.set(p.id, cur);
    }
    const products = [...byProduct.values()].map((x) => ({ ...x, value: Math.round(x.value * 100) / 100, atDefaultRate: Math.round(x.atDefaultRate * 100) / 100 })).sort((a, b) => b.value - a.value);
    const categories = new Map<string, { category: string; qty: number; value: number }>();
    for (const p of products) {
      const c = categories.get(p.category) ?? { category: p.category, qty: 0, value: 0 };
      c.qty += p.qty; c.value = Math.round((c.value + p.value) * 100) / 100;
      categories.set(p.category, c);
    }
    return { asOn: istDateString(), total: Math.round(products.reduce((t, p) => t + p.value, 0) * 100) / 100, categories: [...categories.values()], products };
  }),

  /** FEFO suggestion for picking `qty` of a variant (used by invoicing and dispatch). */
  fefo: staffProcedure.input(z.object({ variantId: z.string(), qty: z.number().int().min(1), locationId: z.string().optional() })).query(({ ctx, input }) =>
    fefoPick(ctx.db, input.variantId, input.qty, { locationId: input.locationId })),

  // ---------------- documents ----------------
  receipts: staffProcedure.input(z.object({ kind: z.enum(['GRN', 'OPENING', 'ALL']).default('ALL'), limit: z.number().int().min(1).max(200).default(50) }).optional()).query(async ({ ctx, input }) => {
    const rows = await ctx.db.grn.findMany({
      where: input?.kind === 'GRN' ? { isOpening: false } : input?.kind === 'OPENING' ? { isOpening: true } : {},
      orderBy: { createdAt: 'desc' },
      take: input?.limit ?? 50,
      include: { supplier: { select: { id: true, name: true } }, lines: { select: { qty: true } } },
    });
    const users = new Map((await ctx.db.user.findMany({ where: { id: { in: rows.map((r) => r.createdById) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return rows.map((r) => ({ id: r.id, number: r.number, date: isoDay(r.date), isOpening: r.isOpening, supplier: r.supplier, supplierInvoiceNo: r.supplierInvoiceNo, lines: r.lines.length, units: r.lines.reduce((t, l) => t + l.qty, 0), by: users.get(r.createdById) ?? '' }));
  }),

  receipt: staffProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const g = await ctx.db.grn.findUnique({
      where: { id: input.id },
      include: { supplier: true, po: { select: { id: true, number: true, status: true } }, lines: { include: { variant: { include: { product: { select: { id: true, name: true, code: true } }, _count: { select: { aliases: true } } } } } } },
    });
    if (!g) throw new TRPCError({ code: 'NOT_FOUND' });
    const showCost = seeCost(ctx.user) || can(ctx.user, 'CREATE_PURCHASE_ORDERS');
    const by = await ctx.db.user.findUnique({ where: { id: g.createdById }, select: { name: true } });
    return {
      ...g, date: isoDay(g.date), supplierInvoiceDate: isoDay(g.supplierInvoiceDate), by: by?.name ?? '',
      lines: g.lines.map((l) => ({
        id: l.id, variantId: l.variantId, batchId: l.batchId, productId: l.variant.product.id, productName: l.variant.product.name,
        // No stickers are printed: an item can only be scanned if its manufacturer barcode is linked.
        hasBarcode: !!l.variant.gtin || l.variant._count.aliases > 0, code: l.variant.product.code, label: l.variant.label, sku: l.variant.sku,
        batchNo: l.batchNo, expiryDate: isoDay(l.expiryDate), serialNos: l.serialNos, qty: l.qty, rate: showCost ? num(l.rate) : undefined,
      })),
    };
  }),

  createGrn: manage.input(grnCreateInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction((tx) => createReceipt(tx, { kind: 'GRN', ...input, actorId: ctx.user.id, canSetCost: seeCost(ctx.user) || can(ctx.user, 'CREATE_PURCHASE_ORDERS'), ip: ctx.ip }), { timeout: 60_000 })),

  createOpening: manage.input(openingStockInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction((tx) => createReceipt(tx, { kind: 'OPENING', supplierId: null, ...input, actorId: ctx.user.id, canSetCost: seeCost(ctx.user), ip: ctx.ip }), { timeout: 120_000 })),

  /** Stock adjustment with a required reason (damaged, expired, sample, correction, lost). */
  adjust: manage.input(adjustInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const v = await loadVariant(tx, input.variantId);
      const locationId = input.locationId ?? (await defaultLocationId(tx));
      let batchId = input.batchId;
      if (batchId) {
        const b = await tx.batch.findUnique({ where: { id: batchId } });
        if (!b || b.variantId !== v.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Batch does not belong to this item' });
      } else {
        batchId = (await ensureBatch(tx, v, { batchNo: input.batchNo, expiryDate: input.expiryDate }, { allowExpired: true })).id;
      }
      const r = await postMovement(tx, {
        type: 'ADJUSTMENT', variant: v, batchId, locationId, qty: input.qty, serialNos: input.serialNos, reason: input.reason, note: input.note, refType: 'Adjustment', actorId: ctx.user.id,
      });
      await logActivity(tx, {
        actorId: ctx.user.id, action: 'stock.adjust', entityType: 'ProductVariant', entityId: v.id, ip: ctx.ip,
        summary: `${v.product.name} ${v.label ?? ''}: ${input.qty > 0 ? '+' : ''}${input.qty} (${input.reason.toLowerCase()})${input.note ? ` – ${input.note}` : ''}`,
      });
      return r;
    })),

  /** Return goods to a supplier (debit note number); reduces stock and marks serials returned. */
  returnToSupplier: manage.input(supplierReturnInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const sup = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!sup) throw new TRPCError({ code: 'NOT_FOUND', message: 'Supplier not found' });
      const number = await nextDocNumber(tx, 'DEBIT_NOTE', input.date);
      const ret = await tx.supplierReturn.create({ data: { number, date: dayToDate(input.date)!, supplierId: sup.id, reason: input.reason, note: input.note, createdById: ctx.user.id } });
      const loc = await defaultLocationId(tx);
      for (const l of input.lines) {
        const v = await loadVariant(tx, l.variantId);
        const b = await tx.batch.findUnique({ where: { id: l.batchId } });
        if (!b || b.variantId !== v.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Batch does not belong to this item' });
        const locationId = l.locationId ?? loc;
        await tx.supplierReturnLine.create({ data: { returnId: ret.id, variantId: v.id, batchId: b.id, locationId, qty: l.qty, serialNos: l.serialNos.map((x) => x.toUpperCase()) } });
        await postMovement(tx, { type: 'PURCHASE_RETURN', variant: v, batchId: b.id, locationId, qty: -l.qty, serialNos: l.serialNos, refType: 'SupplierReturn', refId: ret.id, note: number, actorId: ctx.user.id });
      }
      await logActivity(tx, { actorId: ctx.user.id, action: 'stock.supplier_return', entityType: 'SupplierReturn', entityId: ret.id, summary: `${number}: returned ${input.lines.reduce((t, l) => t + l.qty, 0)} unit(s) to ${sup.name} (${input.reason})`, ip: ctx.ip });
      return { id: ret.id, number };
    })),

  supplierReturns: manage.query(async ({ ctx }) => {
    const rows = await ctx.db.supplierReturn.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { supplier: { select: { name: true } }, lines: { select: { qty: true } } } });
    return rows.map((r) => ({ id: r.id, number: r.number, date: isoDay(r.date), supplier: r.supplier.name, reason: r.reason, units: r.lines.reduce((t, l) => t + l.qty, 0) }));
  }),

  /** Recent adjustments for review. */
  adjustments: manage.query(async ({ ctx }) => {
    const rows = await ctx.db.stockMovement.findMany({
      where: { type: 'ADJUSTMENT' }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { batch: { select: { batchNo: true } }, variant: { select: { label: true, product: { select: { name: true } } } }, createdBy: { select: { name: true } } },
    });
    return rows.map((r) => ({ id: r.id, at: r.createdAt, product: r.variant.product.name, label: r.variant.label, batchNo: r.batch.batchNo, qty: r.qty, reason: r.reason, note: r.note, by: r.createdBy.name }));
  }),

  // ---------------- locations ----------------
  locations: staffProcedure.query(({ ctx }) => ctx.db.location.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] })),
  createLocation: ownerProcedure.input(locationInput).mutation(async ({ ctx, input }) => {
    const exists = await ctx.db.location.findUnique({ where: { name: input.name } });
    if (exists) throw new TRPCError({ code: 'CONFLICT', message: 'That location exists' });
    const isFirst = (await ctx.db.location.count()) === 0;
    const l = await ctx.db.location.create({ data: { name: input.name, isDefault: isFirst } });
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'stock.location', entityType: 'Location', entityId: l.id, summary: `Added location ${l.name}`, ip: ctx.ip });
    return l;
  }),
  setDefaultLocation: ownerProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      await tx.location.updateMany({ data: { isDefault: false } });
      const l = await tx.location.update({ where: { id: input.id }, data: { isDefault: true } });
      await logActivity(tx, { actorId: ctx.user.id, action: 'stock.location', entityType: 'Location', entityId: l.id, summary: `Default location → ${l.name}`, ip: ctx.ip });
      return l;
    })),
});

