import { TRPCError } from '@trpc/server';
import { can, istDateString, stateByCode } from '@kush/core';
import { z } from 'zod';
import { poInput, poListInput, poReasonInput } from '../schemas';
import { isoDay, num } from '../services/num';
import { createPo, createPosForOrder, lastRates, reorderSuggestions, setPoStatus, updatePo } from '../services/purchasing';
import { getSettings } from '../services/settings';
import { anyPermissionProcedure, permissionProcedure, router } from '../trpc';

const buyer = permissionProcedure('CREATE_PURCHASE_ORDERS');
/** Store staff receiving goods can see open POs (quantities only, rates hidden unless allowed). */
const viewer = anyPermissionProcedure('CREATE_PURCHASE_ORDERS', 'MANAGE_STOCK');
const seesRates = (u: Parameters<typeof can>[0]) => can(u, 'CREATE_PURCHASE_ORDERS') || can(u, 'VIEW_PRICES_MARGINS');
const tx60 = { timeout: 60_000 };

export const purchaseOrdersRouter = router({
  list: viewer.input(poListInput).query(async ({ ctx, input }) => {
    const status = input?.status === 'OPEN' ? { in: ['SENT', 'PARTIALLY_RECEIVED'] as const } : input?.status;
    const rows = await ctx.db.purchaseOrder.findMany({
      where: {
        ...(status ? { status: status as never } : {}), ...(input?.supplierId ? { supplierId: input.supplierId } : {}),
        ...(input?.q ? { OR: [{ number: { contains: input.q, mode: 'insensitive' } }, { supplier: { name: { contains: input.q, mode: 'insensitive' } } }] } : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 300,
      include: { supplier: { select: { id: true, name: true } }, lines: { select: { qtyOrdered: true, qtyReceived: true } } },
    });
    const show = seesRates(ctx.user);
    const today = istDateString();
    return rows.map((p) => {
      const ordered = p.lines.reduce((t, l) => t + l.qtyOrdered, 0);
      const received = p.lines.reduce((t, l) => t + Math.min(l.qtyReceived, l.qtyOrdered), 0);
      const expected = isoDay(p.expectedDate);
      return {
        id: p.id, number: p.number, date: isoDay(p.date), expectedDate: expected, supplier: p.supplier, status: p.status,
        total: show ? num(p.grandTotal) : null, ordered, received,
        late: !!expected && expected < today && ['SENT', 'PARTIALLY_RECEIVED'].includes(p.status),
      };
    });
  }),

  get: viewer.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const p = await ctx.db.purchaseOrder.findUnique({
      where: { id: input.id },
      include: {
        supplier: { select: { id: true, name: true, code: true, stateCode: true, paymentTermsDays: true } },
        lines: { orderBy: { sl: 'asc' }, include: { salesOrder: { select: { id: true, number: true, customer: { select: { name: true } } } }, variant: { select: { id: true, sku: true, label: true, productId: true, product: { select: { name: true, trackSerial: true, trackBatch: true, trackExpiry: true } } } } } },
        grns: { orderBy: { createdAt: 'asc' }, select: { id: true, number: true, date: true, supplierInvoiceNo: true, lines: { select: { qty: true } } } },
      },
    });
    if (!p) throw new TRPCError({ code: 'NOT_FOUND' });
    const createdBy = (await ctx.db.user.findUnique({ where: { id: p.createdById }, select: { name: true } }))?.name ?? '';
    const show = seesRates(ctx.user);
    const money = (d: unknown) => (show ? num(d as never) : null);
    return {
      id: p.id, number: p.number, date: isoDay(p.date)!, expectedDate: isoDay(p.expectedDate), status: p.status, terms: p.terms, note: p.note,
      supplier: p.supplier, taxType: p.taxType, createdBy, createdAt: p.createdAt, sentAt: p.sentAt,
      cancelReason: p.cancelReason, cancelledAt: p.cancelledAt, closeReason: p.closeReason, closedAt: p.closedAt,
      taxableTotal: money(p.taxableTotal), cgstTotal: money(p.cgstTotal), sgstTotal: money(p.sgstTotal), igstTotal: money(p.igstTotal), roundOff: money(p.roundOff), grandTotal: money(p.grandTotal),
      lines: p.lines.map((l) => ({
        id: l.id, sl: l.sl, variantId: l.variantId, productId: l.variant.productId, sku: l.variant.sku, label: l.variant.label, name: l.variant.product.name, description: l.description,
        track: { serial: l.variant.product.trackSerial, batch: l.variant.product.trackBatch, expiry: l.variant.product.trackExpiry },
        hsnCode: l.hsnCode, unit: l.unit, qtyOrdered: l.qtyOrdered, qtyReceived: l.qtyReceived, pending: Math.max(0, l.qtyOrdered - l.qtyReceived),
        rate: money(l.rate), discPct: num(l.discPct), gstRate: num(l.gstRate), amount: money(l.amount), expectedDate: isoDay(l.expectedDate),
        salesOrder: l.salesOrder ? { id: l.salesOrder.id, number: l.salesOrder.number, customer: l.salesOrder.customer.name } : null,
      })),
      grns: p.grns.map((g) => ({ id: g.id, number: g.number, date: isoDay(g.date), supplierInvoiceNo: g.supplierInvoiceNo, units: g.lines.reduce((t, l) => t + l.qty, 0) })),
      canSeeRates: show,
    };
  }),

  create: buyer.input(poInput).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => createPo(tx, input, ctx.user, ctx.ip), tx60)),
  update: buyer.input(poInput.extend({ id: z.string() })).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => updatePo(tx, input.id, input, ctx.user, ctx.ip), tx60)),
  /** Order items a customer asked for that are not in stock: one PO per supplier, linked to the customer order. */
  createForOrder: buyer.input(z.object({
    orderId: z.string(),
    items: z.array(z.object({ variantId: z.string(), qty: z.number().int().min(1, 'Enter a quantity').max(100000), supplierId: z.string().min(1, 'Choose a supplier'), rate: z.number().min(0).nullable().optional() })).min(1, 'Nothing to order').max(200),
    expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    send: z.boolean().optional(), tellCustomer: z.boolean().optional(),
  })).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => createPosForOrder(tx, input, ctx.user, ctx.ip), tx60)),
  markSent: buyer.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => setPoStatus(tx, input.id, 'SEND', null, ctx.user, ctx.ip))),
  cancel: buyer.input(poReasonInput).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => setPoStatus(tx, input.id, 'CANCEL', input.reason, ctx.user, ctx.ip))),
  /** Short-close: nothing more is expected from the supplier on this PO. */
  close: buyer.input(poReasonInput).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => setPoStatus(tx, input.id, 'CLOSE', input.reason, ctx.user, ctx.ip))),

  /** Items at/below reorder level, less what is already on order, with the last purchase rate. */
  suggestions: buyer.input(z.object({ supplierId: z.string().nullable().optional() }).optional()).query(({ ctx, input }) => reorderSuggestions(ctx.db, input?.supplierId)),

  /** Last purchase rate per variant for the PO editor. */
  rates: buyer.input(z.object({ supplierId: z.string().nullable(), variantIds: z.array(z.string()).max(500) })).query(async ({ ctx, input }) =>
    Object.fromEntries(await lastRates(ctx.db, input.supplierId, input.variantIds))),

  /** Open (sent / partly received) POs for a supplier, for the receive-goods screen. */
  open: viewer.input(z.object({ supplierId: z.string() })).query(async ({ ctx, input }) => {
    const rows = await ctx.db.purchaseOrder.findMany({
      where: { supplierId: input.supplierId, status: { in: ['SENT', 'PARTIALLY_RECEIVED'] } }, orderBy: { date: 'asc' },
      include: { lines: { orderBy: { sl: 'asc' }, include: { variant: { select: { id: true, sku: true, label: true, productId: true, product: { select: { name: true, unit: true, trackBatch: true, trackExpiry: true, trackSerial: true } } } } } } },
    });
    const show = seesRates(ctx.user);
    return rows.map((p) => ({
      id: p.id, number: p.number, date: isoDay(p.date), expectedDate: isoDay(p.expectedDate),
      lines: p.lines.filter((l) => l.qtyReceived < l.qtyOrdered).map((l) => ({
        id: l.id, variantId: l.variantId, productId: l.variant.productId, productName: l.variant.product.name, label: l.variant.label, sku: l.variant.sku,
        unit: l.variant.product.unit, trackBatch: l.variant.product.trackBatch, trackExpiry: l.variant.product.trackExpiry, trackSerial: l.variant.product.trackSerial,
        pending: l.qtyOrdered - l.qtyReceived, rate: show ? num(l.rate) : null,
      })),
    }));
  }),

  defaults: buyer.query(async ({ ctx }) => { const s = await getSettings(ctx.db); return { terms: s.defaultPoTerms ?? '', stateCode: s.stateCode, ready: !!stateByCode(s.stateCode) }; }),
});
