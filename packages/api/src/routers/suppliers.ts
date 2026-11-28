import { TRPCError } from '@trpc/server';
import { can } from '@kush/core';
import { z } from 'zod';
import { supplierInput, supplierProductsInput, supplierUpdateInput } from '../schemas';
import { renamePartyLedger } from '../services/accounts/ledgers';
import { diff, logActivity } from '../services/activity';
import { nextSupplierCode } from '../services/counters';
import { numOrNull } from '../services/num';
import { anyPermissionProcedure, permissionProcedure, router } from '../trpc';

// Suppliers are needed by purchasing (POs) and the store (GRN); only purchasing edits them.
const view = anyPermissionProcedure('CREATE_PURCHASE_ORDERS', 'MANAGE_STOCK', 'VIEW_PRICES_MARGINS');
const edit = permissionProcedure('CREATE_PURCHASE_ORDERS');

export const suppliersRouter = router({
  list: view.input(z.object({ q: z.string().trim().max(100).optional(), includeInactive: z.boolean().default(false) }).optional()).query(({ ctx, input }) =>
    ctx.db.supplier.findMany({
      where: {
        ...(input?.includeInactive ? {} : { isActive: true }),
        ...(input?.q ? { OR: [{ name: { contains: input.q, mode: 'insensitive' } }, { code: { contains: input.q, mode: 'insensitive' } }, { gstin: { contains: input.q, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    })),

  get: view.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const s = await ctx.db.supplier.findUnique({
      where: { id: input.id },
      include: { products: { include: { product: { select: { id: true, code: true, name: true, unit: true } } }, orderBy: { product: { name: 'asc' } } } },
    });
    if (!s) throw new TRPCError({ code: 'NOT_FOUND', message: 'Supplier not found' });
    const showRates = can(ctx.user, 'CREATE_PURCHASE_ORDERS') || can(ctx.user, 'VIEW_PRICES_MARGINS');
    return {
      ...s,
      products: s.products.map((p) => ({ ...p, lastPurchaseRate: showRates ? numOrNull(p.lastPurchaseRate) : undefined })),
    };
  }),

  create: edit.input(supplierInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const s = await tx.supplier.create({ data: { ...input, code: await nextSupplierCode(tx) } });
      await logActivity(tx, { actorId: ctx.user.id, action: 'supplier.create', entityType: 'Supplier', entityId: s.id, summary: `Added supplier ${s.code} ${s.name}`, ip: ctx.ip });
      return s;
    })),

  update: edit.input(supplierUpdateInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const { id, ...data } = input;
      const before = await tx.supplier.findUnique({ where: { id } });
      if (!before) throw new TRPCError({ code: 'NOT_FOUND' });
      const s = await tx.supplier.update({ where: { id }, data });
      if (s.name !== before.name) await renamePartyLedger(tx, { supplierId: id });
      const d = diff(before as unknown as Record<string, unknown>, data);
      if (d.changed.length) await logActivity(tx, { actorId: ctx.user.id, action: 'supplier.update', entityType: 'Supplier', entityId: id, summary: `Updated ${s.code}: ${d.changed.join(', ')}`, before: d.before, after: d.after, ip: ctx.ip });
      return s;
    })),

  setActive: edit.input(z.object({ id: z.string(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    const s = await ctx.db.supplier.update({ where: { id: input.id }, data: { isActive: input.isActive } });
    await logActivity(ctx.db, { actorId: ctx.user.id, action: input.isActive ? 'supplier.activate' : 'supplier.deactivate', entityType: 'Supplier', entityId: s.id, summary: `${input.isActive ? 'Activated' : 'Deactivated'} ${s.name}`, ip: ctx.ip });
    return s;
  }),

  /** Replace the list of products this supplier supplies (with supplier SKU and last purchase rate). */
  setProducts: edit.input(supplierProductsInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const s = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!s) throw new TRPCError({ code: 'NOT_FOUND' });
      const keep = input.rows.map((r) => r.productId);
      await tx.supplierProduct.deleteMany({ where: { supplierId: s.id, productId: { notIn: keep } } });
      for (const r of input.rows) {
        await tx.supplierProduct.upsert({
          where: { supplierId_productId: { supplierId: s.id, productId: r.productId } },
          create: { supplierId: s.id, productId: r.productId, supplierSku: r.supplierSku, lastPurchaseRate: r.lastPurchaseRate ?? null },
          update: { supplierSku: r.supplierSku, lastPurchaseRate: r.lastPurchaseRate ?? null },
        });
      }
      await logActivity(tx, { actorId: ctx.user.id, action: 'supplier.products', entityType: 'Supplier', entityId: s.id, summary: `${s.name}: ${input.rows.length} product(s) supplied`, ip: ctx.ip });
      return { count: input.rows.length };
    })),
});
