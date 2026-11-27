import { TRPCError } from '@trpc/server';
import { istDateString, LENS_TYPES, NOTIFICATION_CHANNELS_FOR_CUSTOMER, ORDER_SORT_RANK, paymentStatus, round2, stateByCode } from '@kush/core';
import type { NotificationChannel } from '@kush/db';
import { z } from 'zod';
import { notify, staffForCustomer } from '../notify';
import { logActivity } from '../services/activity';
import { isoDay, num } from '../services/num';
import { resolveCustomerPrices } from '../services/pricing';
import { getSettings } from '../services/settings';
import { customerLedger } from '../services/sales/ledger';
import { createOrder } from '../services/sales/orders';
import { reorderLevelOf } from '../services/stock';
import { customerProcedure, router } from '../trpc';

/** What a customer sees about stock: never quantities, only a badge. */
export type StockBadge = 'AVAILABLE' | 'LIMITED' | 'ON_REQUEST';
const badgeOf = (qty: number, level: number): StockBadge => (qty <= 0 ? 'ON_REQUEST' : qty <= level ? 'LIMITED' : 'AVAILABLE');

async function stockByVariant(db: Parameters<typeof getSettings>[0], variantIds: string[]) {
  const today = new Date(`${istDateString()}T00:00:00Z`);
  const rows = await db.stockBalance.groupBy({ by: ['variantId'], where: { variantId: { in: variantIds }, qty: { gt: 0 }, OR: [{ batch: { expiryDate: null } }, { batch: { expiryDate: { gte: today } } }] }, _sum: { qty: true } });
  return new Map(rows.map((r) => [r.variantId, r._sum.qty ?? 0]));
}

const catalogueInput = z.object({
  q: z.string().trim().max(80).optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  lensType: z.enum(LENS_TYPES).optional(),
  power: z.coerce.number().min(-30).max(60).optional(),
}).optional();

const placeOrderInput = z.object({
  forDoctorId: z.string().nullable().optional(),
  shippingAddressId: z.string().nullable().optional(),
  customerNote: z.string().trim().max(1000).optional().nullable(),
  patientName: z.string().trim().max(120).optional().nullable(),
  surgeryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('').transform(() => null)),
  clientRequestId: z.string().min(8).max(80),
  lines: z.array(z.object({ variantId: z.string(), qty: z.coerce.number().int().min(1).max(500) })).min(1, 'Your cart is empty').max(200),
});

export const portalRouter = router({
  /** Home: recent orders, what is owed, unread notifications. */
  home: customerProcedure.query(async ({ ctx }) => {
    const [customer, orders, ledger, unread] = await Promise.all([
      ctx.db.customer.findUniqueOrThrow({ where: { id: ctx.customerId }, select: { name: true, code: true, type: true } }),
      ctx.db.salesOrder.findMany({ where: { customerId: ctx.customerId }, orderBy: { createdAt: 'desc' }, take: 5, include: { lines: { select: { qty: true, qtyDispatched: true } } } }),
      customerLedger(ctx.db, ctx.customerId),
      ctx.db.notification.count({ where: { userId: ctx.user.id, channel: 'IN_APP', readAt: null } }),
    ]);
    return {
      customer,
      orders: orders.map((o) => ({ id: o.id, number: o.number, status: o.status, createdAt: o.createdAt, units: o.lines.reduce((t, l) => t + l.qty, 0) })),
      outstanding: ledger.outstanding, overdue: ledger.overdue, onAccount: ledger.onAccount, unread,
    };
  }),

  filters: customerProcedure.query(async ({ ctx }) => {
    const [categories, brands, powers] = await Promise.all([
      ctx.db.category.findMany({ where: { products: { some: { isActive: true, deletedAt: null } } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      ctx.db.brand.findMany({ where: { products: { some: { isActive: true, deletedAt: null } } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      ctx.db.productVariant.aggregate({ where: { isActive: true, powerSph: { not: null }, product: { isActive: true } }, _min: { powerSph: true }, _max: { powerSph: true } }),
    ]);
    return { categories, brands, lensTypes: LENS_TYPES, power: { min: num(powers._min.powerSph ?? 0), max: num(powers._max.powerSph ?? 0) } };
  }),

  /** Catalogue at this customer's own price (special → price list → default), with a stock badge. */
  catalogue: customerProcedure.input(catalogueInput).query(async ({ ctx, input }) => {
    const products = await ctx.db.product.findMany({
      where: {
        isActive: true, deletedAt: null,
        ...(input?.categoryId ? { categoryId: input.categoryId } : {}), ...(input?.brandId ? { brandId: input.brandId } : {}),
        ...(input?.lensType ? { lensType: input.lensType } : {}),
        ...(input?.q ? { OR: [{ name: { contains: input.q, mode: 'insensitive' } }, { code: { contains: input.q, mode: 'insensitive' } }, { brand: { name: { contains: input.q, mode: 'insensitive' } } }] } : {}),
        variants: { some: { isActive: true, deletedAt: null, ...(input?.power != null ? { powerSph: input.power } : {}) } },
      },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      select: {
        id: true, code: true, name: true, imageIds: true, mrp: true, unit: true, isLens: true, lensType: true, material: true, preloaded: true, reorderLevel: true,
        category: { select: { name: true } }, brand: { select: { name: true } },
        variants: { where: { isActive: true, deletedAt: null }, select: { id: true, powerSph: true, reorderLevel: true } },
      },
      take: 300,
    });
    const s = await getSettings(ctx.db);
    const prices = await resolveCustomerPrices(ctx.db, ctx.customerId, products.map((p) => p.id));
    const stock = await stockByVariant(ctx.db, products.flatMap((p) => p.variants.map((v) => v.id)));
    return products.map((p) => {
      const powers = p.variants.map((v) => v.powerSph).filter((x) => x != null).map((x) => num(x));
      const qty = p.variants.reduce((t, v) => t + (stock.get(v.id) ?? 0), 0);
      const anyAvailable = p.variants.some((v) => badgeOf(stock.get(v.id) ?? 0, reorderLevelOf({ reorderLevel: v.reorderLevel, product: p }, s.defaultReorderLevel)) === 'AVAILABLE');
      return {
        id: p.id, code: p.code, name: p.name, image: p.imageIds[0] ?? null, category: p.category.name, brand: p.brand?.name ?? null,
        isLens: p.isLens, lensType: p.lensType, material: p.material, preloaded: p.preloaded, unit: p.unit,
        price: prices.get(p.id)!.rate, mrp: num(p.mrp), variantCount: p.variants.length,
        // Lets the app add a single-variant item straight from the list.
        variantId: p.variants.length === 1 ? p.variants[0]!.id : null,
        powerRange: powers.length ? { min: Math.min(...powers), max: Math.max(...powers) } : null,
        stock: (qty <= 0 ? 'ON_REQUEST' : anyAvailable ? 'AVAILABLE' : 'LIMITED') as StockBadge,
      };
    });
  }),

  /** Product detail with every power and its stock badge (for the power grid). */
  product: customerProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const p = await ctx.db.product.findFirst({
      where: { id: input.id, isActive: true, deletedAt: null },
      include: { category: { select: { name: true } }, brand: { select: { name: true } }, variants: { where: { isActive: true, deletedAt: null }, orderBy: [{ cylinder: 'asc' }, { addPower: 'asc' }, { powerSph: 'asc' }] } },
    });
    if (!p) throw new TRPCError({ code: 'NOT_FOUND' });
    const s = await getSettings(ctx.db);
    const price = (await resolveCustomerPrices(ctx.db, ctx.customerId, [p.id])).get(p.id)!;
    const stock = await stockByVariant(ctx.db, p.variants.map((v) => v.id));
    return {
      id: p.id, code: p.code, name: p.name, description: p.description, images: p.imageIds, category: p.category.name, brand: p.brand?.name ?? null, unit: p.unit,
      isLens: p.isLens, lensType: p.lensType, material: p.material, preloaded: p.preloaded,
      aConstant: p.aConstant == null ? null : num(p.aConstant), opticSizeMm: p.opticSizeMm == null ? null : num(p.opticSizeMm), overallLenMm: p.overallLenMm == null ? null : num(p.overallLenMm),
      price: price.rate, priceSource: price.source === 'DEFAULT' ? null : 'YOUR_RATE', mrp: num(p.mrp), gstRate: num(p.gstRate),
      variants: p.variants.map((v) => ({
        id: v.id, label: v.label, sku: v.sku, powerSph: v.powerSph == null ? null : num(v.powerSph), cylinder: v.cylinder == null ? null : num(v.cylinder), addPower: v.addPower == null ? null : num(v.addPower),
        stock: badgeOf(stock.get(v.id) ?? 0, reorderLevelOf({ reorderLevel: v.reorderLevel, product: p }, s.defaultReorderLevel)),
      })),
    };
  }),

  /** Prices and names for the cart (the client keeps only variant ids and quantities). */
  cart: customerProcedure.input(z.object({ variantIds: z.array(z.string()).max(200) })).query(async ({ ctx, input }) => {
    const variants = await ctx.db.productVariant.findMany({ where: { id: { in: input.variantIds }, isActive: true, deletedAt: null, product: { isActive: true } }, include: { product: { select: { id: true, name: true, gstRate: true, unit: true, imageIds: true } } } });
    const prices = await resolveCustomerPrices(ctx.db, ctx.customerId, [...new Set(variants.map((v) => v.productId))]);
    return variants.map((v) => ({ variantId: v.id, productId: v.productId, name: v.product.name, label: v.label, unit: v.product.unit, image: v.product.imageIds[0] ?? null, price: prices.get(v.productId)!.rate, gstRate: num(v.product.gstRate) }));
  }),

  /** Delivery addresses and linked doctors for checkout. */
  checkout: customerProcedure.query(async ({ ctx }) => {
    const c = await ctx.db.customer.findUniqueOrThrow({ where: { id: ctx.customerId }, include: { addresses: { orderBy: [{ isDefault: 'desc' }] }, doctors: { where: { isActive: true }, select: { id: true, name: true } } } });
    return {
      type: c.type,
      addresses: c.addresses.map((a) => ({ id: a.id, kind: a.kind, label: a.label, text: [a.line1, a.line2, `${a.city} - ${a.pincode}`, stateByCode(a.stateCode)?.name].filter(Boolean).join(', '), isDefault: a.isDefault })),
      doctors: c.doctors,
    };
  }),

  /** Place an order from the portal or the app. Retrying with the same clientRequestId never duplicates it. */
  placeOrder: customerProcedure.input(placeOrderInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction((tx) => createOrder(tx, { ...input, customerId: ctx.customerId, assignedToId: null, source: ctx.client === 'mobile' ? 'MOBILE_APP' : 'PORTAL' }, { id: ctx.user.id }, ctx.ip), { timeout: 60_000 })),

  /** Re-order: the lines of an earlier order, for the cart. */
  reorderLines: customerProcedure.input(z.object({ orderId: z.string() })).query(async ({ ctx, input }) => {
    const o = await ctx.db.salesOrder.findFirst({ where: { id: input.orderId, customerId: ctx.customerId }, include: { lines: { select: { variantId: true, qty: true } } } });
    if (!o) throw new TRPCError({ code: 'NOT_FOUND' });
    return o.lines;
  }),

  orders: customerProcedure.input(z.object({ status: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const rows = await ctx.db.salesOrder.findMany({
      where: { customerId: ctx.customerId, ...(input?.status === 'OPEN' ? { status: { in: ['PLACED', 'CONFIRMED', 'PACKED', 'ON_HOLD', 'DISPATCHED'] } } : input?.status ? { status: input.status as never } : {}) },
      orderBy: { createdAt: 'desc' }, take: 200,
      include: { lines: { select: { qty: true, qtyDispatched: true, rate: true } }, forDoctor: { select: { name: true } } },
    });
    return rows
      .map((o) => ({ id: o.id, number: o.number, status: o.status, createdAt: o.createdAt, forDoctor: o.forDoctor?.name ?? null, units: o.lines.reduce((t, l) => t + l.qty, 0), value: round2(o.lines.reduce((t, l) => t + l.qty * num(l.rate), 0)), surgeryDate: isoDay(o.surgeryDate) }))
      .sort((a, b) => ORDER_SORT_RANK[a.status] - ORDER_SORT_RANK[b.status] || +b.createdAt - +a.createdAt);
  }),

  order: customerProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const o = await ctx.db.salesOrder.findFirst({
      where: { id: input.id, customerId: ctx.customerId },
      include: {
        forDoctor: { select: { name: true } },
        lines: { include: { variant: { select: { label: true, sku: true, product: { select: { name: true } } } } } },
        events: { orderBy: { createdAt: 'asc' } },
        dispatches: { orderBy: { dispatchDate: 'asc' } },
        invoices: { where: { status: 'ISSUED' }, select: { id: true, number: true, date: true, grandTotal: true } },
      },
    });
    if (!o) throw new TRPCError({ code: 'NOT_FOUND' });
    return {
      id: o.id, number: o.number, status: o.status, createdAt: o.createdAt, forDoctor: o.forDoctor?.name ?? null, patientName: o.patientName, surgeryDate: isoDay(o.surgeryDate), note: o.customerNote,
      shipTo: o.shippingSnapshot as { name: string; addressLines: string[] } | null,
      lines: o.lines.map((l) => ({ id: l.id, name: l.variant.product.name, label: l.variant.label, qty: l.qty, sent: l.qtyDispatched, backorder: Math.max(0, l.qty - l.qtyDispatched), rate: num(l.rate) })),
      // Staff notes stay internal; the customer sees each step and when it happened.
      events: o.events.map((e) => ({ status: e.status, at: e.createdAt, note: e.status === 'CANCELLED' || e.status === 'ON_HOLD' ? e.note : null })),
      dispatches: o.dispatches.map((d) => ({ method: d.method, courier: d.courier, docketNo: d.docketNo, date: isoDay(d.dispatchDate), person: d.deliveryPersonName, personMobile: d.deliveryPersonMobile, deliveredAt: d.deliveredAt, receivedBy: d.receivedBy })),
      invoices: o.invoices.map((i) => ({ id: i.id, number: i.number, date: isoDay(i.date), total: num(i.grandTotal) })),
    };
  }),

  /** Invoices, proformas and credit notes, for download. */
  documents: customerProcedure.query(async ({ ctx }) => {
    const today = istDateString();
    const [invoices, proformas, credits] = await Promise.all([
      ctx.db.invoice.findMany({ where: { customerId: ctx.customerId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 300, include: { creditNotes: { select: { grandTotal: true } } } }),
      ctx.db.proforma.findMany({ where: { customerId: ctx.customerId, status: { not: 'DRAFT' } }, orderBy: { createdAt: 'desc' }, take: 100 }),
      ctx.db.creditNote.findMany({ where: { customerId: ctx.customerId }, orderBy: { createdAt: 'desc' }, take: 100, include: { invoice: { select: { number: true } } } }),
    ]);
    return {
      invoices: invoices.map((i) => {
        const settled = round2(num(i.amountPaid) + i.creditNotes.reduce((t, c) => t + num(c.grandTotal), 0));
        return { id: i.id, number: i.number, date: isoDay(i.date), dueDate: isoDay(i.dueDate), total: num(i.grandTotal), due: i.status === 'CANCELLED' ? 0 : round2(num(i.grandTotal) - settled), status: paymentStatus({ total: num(i.grandTotal), settled, dueDate: isoDay(i.dueDate)!, cancelled: i.status === 'CANCELLED' }, today) };
      }),
      proformas: proformas.map((p) => ({ id: p.id, number: p.number, date: isoDay(p.date), validUntil: isoDay(p.validUntil), total: num(p.grandTotal), status: p.status })),
      creditNotes: credits.map((c) => ({ id: c.id, number: c.number, date: isoDay(c.date), total: num(c.grandTotal), invoice: c.invoice?.number ?? null })),
    };
  }),

  /** Account statement and ageing (only ever this customer's own). */
  ledger: customerProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const c = await ctx.db.customer.findUniqueOrThrow({ where: { id: ctx.customerId }, select: { paymentTermsDays: true, creditLimit: true } });
    return { ...(await customerLedger(ctx.db, ctx.customerId, { from: input?.from, to: input?.to })), customer: { paymentTermsDays: c.paymentTermsDays, creditLimit: c.creditLimit == null ? null : num(c.creditLimit) } };
  }),

  profile: customerProcedure.query(async ({ ctx }) => {
    const c = await ctx.db.customer.findUniqueOrThrow({
      where: { id: ctx.customerId },
      include: { addresses: { orderBy: [{ kind: 'asc' }, { isDefault: 'desc' }] }, doctors: { where: { isActive: true }, select: { id: true, name: true, mobile: true } }, parent: { select: { name: true } }, assignedEmployee: { select: { name: true, mobile: true } } },
    });
    return {
      code: c.code, name: c.name, type: c.type, gstin: c.gstin, pan: c.pan, drugLicenceNo: c.drugLicenceNo, contactPerson: c.contactPerson, mobile: c.mobile, email: c.email,
      paymentTermsDays: c.paymentTermsDays, creditLimit: c.creditLimit == null ? null : num(c.creditLimit), hospital: c.parent?.name ?? null,
      addresses: c.addresses.map((a) => ({ id: a.id, kind: a.kind, label: a.label, text: [a.line1, a.line2, `${a.city} - ${a.pincode}`, stateByCode(a.stateCode)?.name].filter(Boolean).join(', '), isDefault: a.isDefault })),
      doctors: c.doctors, contact: c.assignedEmployee, notifyChannels: c.notifyChannels,
      login: { name: ctx.user.name, mobile: ctx.user.mobile, email: ctx.user.email },
    };
  }),

  /** Addresses and registration details are kept by Kush Enterprise; customers ask for changes. */
  requestChange: customerProcedure.input(z.object({ message: z.string().trim().min(10, 'Tell us what should change (at least 10 characters)').max(1000) })).mutation(async ({ ctx, input }) => {
    const c = await ctx.db.customer.findUniqueOrThrow({ where: { id: ctx.customerId }, select: { id: true, name: true } });
    await ctx.db.$transaction(async (tx) => {
      await notify(tx, { userIds: await staffForCustomer(tx, c.id), title: `Profile change request: ${c.name}`, body: input.message, link: `/app/customers/${c.id}`, channels: ['PUSH', 'EMAIL'] });
      await logActivity(tx, { actorId: ctx.user.id, action: 'customer.change_request', entityType: 'Customer', entityId: c.id, ip: ctx.ip, summary: `Change request from ${c.name}: ${input.message.slice(0, 200)}` });
    });
    return { ok: true };
  }),

  setNotifyChannels: customerProcedure.input(z.object({ channels: z.array(z.enum(NOTIFICATION_CHANNELS_FOR_CUSTOMER)).max(5) })).mutation(async ({ ctx, input }) => {
    const channels = [...new Set<NotificationChannel>(['IN_APP', ...input.channels])];
    await ctx.db.customer.update({ where: { id: ctx.customerId }, data: { notifyChannels: channels } });
    return { channels };
  }),
});
