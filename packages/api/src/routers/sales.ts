import { TRPCError } from '@trpc/server';
import { can, istDateString, isOwner, ORDER_SORT_RANK, paymentStatus, round2, stateByCode, suggestDispatchMethod } from '@kush/core';

import { z } from 'zod';
import {
  cancelInput, creditNoteCreateInput, docListInput, invoiceCreateInput, orderCreateInput, orderListInput, orderStatusInput,
  paymentAllocateInput, paymentCreateInput, proformaConvertInput, proformaCreateInput,
} from '../schemas';
import { logActivity } from '../services/activity';
import { dayToDate, isoDay, num } from '../services/num';
import { resolveCustomerPrices } from '../services/pricing';
import { getSettings } from '../services/settings';
import { createCreditNote } from '../services/sales/credit-notes';
import { cancelInvoice, createInvoice } from '../services/sales/invoices';
import { customerLedger, receivables } from '../services/sales/ledger';
import { changeOrderStatus, createOrder, verifyPacked } from '../services/sales/orders';
import { allocatePayment, deletePayment, recordPayment } from '../services/sales/payments';
import { convertProforma, createProforma } from '../services/sales/proformas';
import { anyPermissionProcedure, ownerProcedure, permissionProcedure, router, staffProcedure } from '../trpc';

const actorOf = (u: { id: string; role: string; permissions: readonly string[] }) => ({ id: u.id, isOwner: isOwner(u as never) });
const tx60 = { timeout: 60_000 };
const dateRange = (from?: string, to?: string) => (from || to ? { gte: dayToDate(from ?? null) ?? undefined, lte: dayToDate(to ?? null) ?? undefined } : undefined);

// ------------------------------------------------------------------ lookups
export const salesLookupRouter = router({
  /** Customers with addresses and linked doctors, for order / invoice / payment screens. */
  customers: anyPermissionProcedure('CREATE_ORDERS', 'CREATE_TAX_INVOICE', 'CREATE_PROFORMA', 'RECORD_PAYMENTS', 'VIEW_ORDERS').query(async ({ ctx }) => {
    const rows = await ctx.db.customer.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true, code: true, name: true, type: true, stateCode: true, gstin: true, paymentTermsDays: true, creditLimit: true,
        addresses: { select: { id: true, kind: true, label: true, line1: true, city: true, stateCode: true, isDefault: true } },
        doctors: { where: { isActive: true }, select: { id: true, name: true } },
      },
    });
    return rows.map((r) => ({ ...r, creditLimit: r.creditLimit == null ? null : num(r.creditLimit) }));
  }),

  /** Each product's price for one customer (no cost). */
  prices: anyPermissionProcedure('CREATE_ORDERS', 'CREATE_TAX_INVOICE', 'CREATE_PROFORMA').input(z.object({ customerId: z.string(), productIds: z.array(z.string()).max(500) })).query(async ({ ctx, input }) => {
    const m = await resolveCustomerPrices(ctx.db, input.customerId, input.productIds);
    return Object.fromEntries([...m.entries()].map(([k, v]) => [k, { rate: v.rate, source: v.source, defaultRate: v.defaultRate }]));
  }),

  /** Can GST documents be issued yet (company state set)? */
  companyReady: anyPermissionProcedure('CREATE_TAX_INVOICE', 'CREATE_PROFORMA').query(async ({ ctx }) => {
    const s = await getSettings(ctx.db);
    return { ready: !!stateByCode(s.stateCode), stateCode: s.stateCode, defaultCopies: s.defaultInvoiceCopies };
  }),
});

// ------------------------------------------------------------------ orders
export const ordersRouter = router({
  list: permissionProcedure('VIEW_ORDERS').input(orderListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db.salesOrder.findMany({
      where: {
        ...(input?.status ? { status: input.status } : {}),
        ...(input?.customerId ? { customerId: input.customerId } : {}),
        ...(input?.assignedToId ? { assignedToId: input.assignedToId } : {}),
        ...(input?.q ? { OR: [{ number: { contains: input.q, mode: 'insensitive' } }, { customer: { name: { contains: input.q, mode: 'insensitive' } } }] } : {}),
        createdAt: input?.from || input?.to ? { gte: input.from ? new Date(`${input.from}T00:00:00+05:30`) : undefined, lte: input.to ? new Date(`${input.to}T23:59:59+05:30`) : undefined } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: input?.limit ?? 200,
      include: { customer: { select: { id: true, name: true } }, forDoctor: { select: { name: true } }, assignedTo: { select: { name: true } }, lines: { select: { qty: true, qtyDispatched: true, rate: true } } },
    });
    return rows
      .map((o) => ({
        id: o.id, number: o.number, createdAt: o.createdAt, status: o.status, source: o.source, customer: o.customer, forDoctor: o.forDoctor?.name ?? null,
        assignedTo: o.assignedTo?.name ?? null, surgeryDate: isoDay(o.surgeryDate), lines: o.lines.length,
        units: o.lines.reduce((t, l) => t + l.qty, 0), backorder: o.lines.reduce((t, l) => t + Math.max(0, l.qty - l.qtyDispatched), 0),
        value: round2(o.lines.reduce((t, l) => t + l.qty * num(l.rate), 0)),
      }))
      .sort((a, b) => ORDER_SORT_RANK[a.status] - ORDER_SORT_RANK[b.status] || b.createdAt.getTime() - a.createdAt.getTime());
  }),

  get: permissionProcedure('VIEW_ORDERS').input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const o = await ctx.db.salesOrder.findUnique({
      where: { id: input.id },
      include: {
        customer: { select: { id: true, code: true, name: true, type: true, mobile: true } }, forDoctor: { select: { id: true, name: true } }, assignedTo: { select: { id: true, name: true } },
        lines: { include: { variant: { select: { id: true, sku: true, label: true, barcode: true, gtin: true, product: { select: { id: true, name: true, unit: true, trackSerial: true } } } } } },
        events: { orderBy: { createdAt: 'asc' }, include: { byUser: { select: { name: true } } } },
        dispatches: { include: { invoice: { select: { number: true } } } },
        invoices: { select: { id: true, number: true, status: true, grandTotal: true, date: true }, orderBy: { createdAt: 'asc' } },
        proformas: { select: { id: true, number: true, status: true, grandTotal: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!o) throw new TRPCError({ code: 'NOT_FOUND' });
    const placedBy = await ctx.db.user.findUnique({ where: { id: o.placedById }, select: { name: true, role: true } });
    const company = await getSettings(ctx.db);
    return {
      ...o, placedBy, surgeryDate: isoDay(o.surgeryDate),
      suggestedDispatch: suggestDispatchMethod(company, o.shippingSnapshot as { addressLines: string[] } | null),
      lines: o.lines.map((l) => ({ id: l.id, variant: l.variant, qty: l.qty, qtyDispatched: l.qtyDispatched, backorder: Math.max(0, l.qty - l.qtyDispatched), rate: num(l.rate), amount: round2(l.qty * num(l.rate)) })),
      events: o.events.map((e) => ({ id: e.id, status: e.status, note: e.note, at: e.createdAt, by: e.byUser.name })),
      dispatches: o.dispatches.map((d) => ({ ...d, dispatchDate: isoDay(d.dispatchDate) })),
      invoices: o.invoices.map((i) => ({ ...i, grandTotal: num(i.grandTotal), date: isoDay(i.date) })),
      proformas: o.proformas.map((p) => ({ ...p, grandTotal: num(p.grandTotal) })),
    };
  }),

  create: permissionProcedure('CREATE_ORDERS').input(orderCreateInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction((tx) => createOrder(tx, { ...input, source: 'STAFF' }, ctx.user, ctx.ip), tx60)),

  setStatus: permissionProcedure('UPDATE_ORDER_STATUS').input(orderStatusInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction((tx) => changeOrderStatus(tx, input, ctx.user, ctx.ip))),

  assign: permissionProcedure('UPDATE_ORDER_STATUS').input(z.object({ id: z.string(), assignedToId: z.string().nullable() })).mutation(async ({ ctx, input }) => {
    const o = await ctx.db.salesOrder.update({ where: { id: input.id }, data: { assignedToId: input.assignedToId }, include: { assignedTo: { select: { name: true } } } });
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'order.assign', entityType: 'SalesOrder', entityId: o.id, ip: ctx.ip, summary: `${o.number} assigned to ${o.assignedTo?.name ?? 'nobody'}` });
    return { ok: true };
  }),

  /**
   * Proof of delivery. The delivery person the order was handed to can mark it delivered (from the
   * app) even without the order-status permission; anyone with that permission can too.
   */
  markDelivered: staffProcedure.input(z.object({ id: z.string(), receivedBy: z.string().trim().min(2, 'Who received it?').max(80), note: z.string().trim().max(300).optional().nullable() })).mutation(async ({ ctx, input }) => {
    const mine = await ctx.db.dispatch.count({ where: { orderId: input.id, deliveryPersonId: ctx.user.id, deliveredAt: null } });
    if (!mine && !can(ctx.user, 'UPDATE_ORDER_STATUS')) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the person delivering this order can mark it delivered' });
    return ctx.db.$transaction((tx) => changeOrderStatus(tx, { id: input.id, status: 'DELIVERED', delivery: { receivedBy: input.receivedBy, note: input.note ?? null } }, ctx.user, ctx.ip));
  }),

  /** Scan-to-dispatch: compare what was packed (scanned) with the order. */
  verifyPacked: permissionProcedure('SCAN_DISPATCH').input(z.object({ id: z.string(), scanned: z.array(z.object({ variantId: z.string(), qty: z.number().int().min(1) })).max(500) })).mutation(({ ctx, input }) =>
    ctx.db.$transaction((tx) => verifyPacked(tx, input.id, input.scanned, ctx.user, ctx.ip))),

  staff: permissionProcedure('VIEW_ORDERS').query(({ ctx }) => ctx.db.user.findMany({ where: { role: { in: ['OWNER', 'EMPLOYEE'] }, isActive: true }, select: { id: true, name: true, mobile: true }, orderBy: { name: 'asc' } })),
});

// ------------------------------------------------------------------ proformas
const proformaView = permissionProcedure('CREATE_PROFORMA');
export const proformasRouter = router({
  list: anyPermissionProcedure('CREATE_PROFORMA', 'VIEW_ORDERS').input(docListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db.proforma.findMany({
      where: { ...(input?.customerId ? { customerId: input.customerId } : {}), ...(input?.status ? { status: input.status as never } : {}), date: dateRange(input?.from, input?.to), ...(input?.q ? { OR: [{ number: { contains: input.q, mode: 'insensitive' } }, { customer: { name: { contains: input.q, mode: 'insensitive' } } }] } : {}) },
      orderBy: { createdAt: 'desc' }, take: input?.limit ?? 200,
      include: { customer: { select: { id: true, name: true } }, invoice: { select: { id: true, number: true, status: true } } },
    });
    const today = istDateString();
    return rows.map((p) => ({ id: p.id, number: p.number, date: isoDay(p.date), validUntil: isoDay(p.validUntil), customer: p.customer, total: num(p.grandTotal), status: p.status === 'SENT' || p.status === 'DRAFT' ? (isoDay(p.validUntil)! < today ? 'EXPIRED' : p.status) : p.status, invoice: p.invoice }));
  }),
  get: anyPermissionProcedure('CREATE_PROFORMA', 'VIEW_ORDERS').input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const p = await ctx.db.proforma.findUnique({ where: { id: input.id }, include: { customer: { select: { id: true, name: true, code: true } }, lines: { orderBy: { sl: 'asc' }, include: { variant: { select: { label: true, productId: true, product: { select: { trackSerial: true } } } } } }, invoice: { select: { id: true, number: true, status: true } }, order: { select: { id: true, number: true } } } });
    if (!p) throw new TRPCError({ code: 'NOT_FOUND' });
    return { ...p, date: isoDay(p.date), validUntil: isoDay(p.validUntil), taxableTotal: num(p.taxableTotal), taxTotal: num(p.taxTotal), roundOff: num(p.roundOff), grandTotal: num(p.grandTotal), lines: p.lines.map((l) => ({ id: l.id, sl: l.sl, variantId: l.variantId, productId: l.variant.productId, description: l.description, label: l.variant.label, trackSerial: l.variant.product.trackSerial, hsnCode: l.hsnCode, qty: l.qty, unit: l.unit, rate: num(l.rate), discPct: num(l.discPct), amount: num(l.amount), gstRate: num(l.gstRate) })) };
  }),
  create: proformaView.input(proformaCreateInput).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => createProforma(tx, input, actorOf(ctx.user), ctx.ip), tx60)),
  markSent: proformaView.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.proforma.updateMany({ where: { id: input.id, status: 'DRAFT' }, data: { status: 'SENT' } });
    return { ok: true };
  }),
  cancel: proformaView.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const p = await ctx.db.proforma.findUnique({ where: { id: input.id }, include: { invoice: true } });
    if (!p) throw new TRPCError({ code: 'NOT_FOUND' });
    if (p.invoice && p.invoice.status === 'ISSUED') throw new TRPCError({ code: 'BAD_REQUEST', message: `Already converted to ${p.invoice.number}` });
    await ctx.db.proforma.update({ where: { id: p.id }, data: { status: 'CANCELLED' } });
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'proforma.cancel', entityType: 'Proforma', entityId: p.id, ip: ctx.ip, summary: `Cancelled proforma ${p.number}` });
    return { ok: true };
  }),
  /** One click: proforma → tax invoice (needs invoice permission too). */
  convert: permissionProcedure('CREATE_TAX_INVOICE').input(proformaConvertInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction((tx) => convertProforma(tx, input.id, input, actorOf(ctx.user), ctx.ip), tx60)),
});

// ------------------------------------------------------------------ invoices
const invoiceView = anyPermissionProcedure('CREATE_TAX_INVOICE', 'VIEW_ORDERS', 'RECORD_PAYMENTS');
export const invoicesRouter = router({
  list: invoiceView.input(docListInput).query(async ({ ctx, input }) => {
    const today = istDateString();
    const rows = await ctx.db.invoice.findMany({
      where: { ...(input?.customerId ? { customerId: input.customerId } : {}), date: dateRange(input?.from, input?.to), ...(input?.q ? { OR: [{ number: { contains: input.q, mode: 'insensitive' } }, { customer: { name: { contains: input.q, mode: 'insensitive' } } }] } : {}) },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: input?.limit ?? 200,
      include: { customer: { select: { id: true, name: true } }, creditNotes: { select: { grandTotal: true } }, _count: { select: { lines: true } } },
    });
    const out = rows.map((i) => {
      const settled = round2(num(i.amountPaid) + i.creditNotes.reduce((t, c) => t + num(c.grandTotal), 0));
      const status = paymentStatus({ total: num(i.grandTotal), settled, dueDate: isoDay(i.dueDate)!, cancelled: i.status === 'CANCELLED' }, today);
      return { id: i.id, number: i.number, date: isoDay(i.date), dueDate: isoDay(i.dueDate), customer: i.customer, total: num(i.grandTotal), settled, due: i.status === 'CANCELLED' ? 0 : round2(num(i.grandTotal) - settled), status, taxType: i.taxType, lines: i._count.lines };
    });
    return input?.status ? out.filter((r) => r.status === input.status) : out;
  }),

  get: invoiceView.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const i = await ctx.db.invoice.findUnique({
      where: { id: input.id },
      include: {
        customer: { select: { id: true, code: true, name: true } }, order: { select: { id: true, number: true } }, proforma: { select: { id: true, number: true } },
        lines: { orderBy: { sl: 'asc' } }, allocations: { include: { payment: { select: { id: true, number: true, date: true, mode: true } } } },
        creditNotes: { select: { id: true, number: true, date: true, grandTotal: true, reason: true } }, dispatch: true, createdBy: { select: { name: true } }, cancelledBy: { select: { name: true } },
      },
    });
    if (!i) throw new TRPCError({ code: 'NOT_FOUND' });
    const credited = i.creditNotes.reduce((t, c) => t + num(c.grandTotal), 0);
    const settled = round2(num(i.amountPaid) + credited);
    const creditedQty = await ctx.db.creditNoteLine.groupBy({ by: ['invoiceLineId'], where: { creditNote: { invoiceId: i.id } }, _sum: { qty: true } });
    return {
      id: i.id, number: i.number, date: isoDay(i.date), dueDate: isoDay(i.dueDate), status: i.status, taxType: i.taxType, customer: i.customer, order: i.order, proforma: i.proforma,
      buyer: i.buyerSnapshot as { name: string; addressLines: string[]; gstin: string | null; stateName: string }, consignee: i.consigneeSnapshot as { name: string; attn: string | null; addressLines: string[]; stateName: string },
      placeOfSupply: i.placeOfSupply, paymentTerms: i.paymentTerms, dispatchedThrough: i.dispatchedThrough, dispatchDocNo: i.dispatchDocNo,
      taxableTotal: num(i.taxableTotal), cgstTotal: num(i.cgstTotal), sgstTotal: num(i.sgstTotal), igstTotal: num(i.igstTotal), roundOff: num(i.roundOff), grandTotal: num(i.grandTotal),
      amountPaid: num(i.amountPaid), credited: round2(credited), due: i.status === 'CANCELLED' ? 0 : round2(num(i.grandTotal) - settled),
      paymentStatus: paymentStatus({ total: num(i.grandTotal), settled, dueDate: isoDay(i.dueDate)!, cancelled: i.status === 'CANCELLED' }, istDateString()),
      cancelReason: i.cancelReason, cancelledAt: i.cancelledAt, cancelledBy: i.cancelledBy?.name ?? null, createdBy: i.createdBy.name, createdAt: i.createdAt,
      lines: i.lines.map((l) => ({ id: l.id, sl: l.sl, variantId: l.variantId, description: l.description, powerLabel: l.powerLabel, hsnCode: l.hsnCode, batchNo: l.batchNo, expiryDate: isoDay(l.expiryDate), serialNos: l.serialNos, qty: l.qty, unit: l.unit, rate: num(l.rate), discPct: num(l.discPct), amount: num(l.amount), gstRate: num(l.gstRate), creditedQty: creditedQty.find((c) => c.invoiceLineId === l.id)?._sum.qty ?? 0 })),
      payments: i.allocations.map((a) => ({ id: a.payment.id, number: a.payment.number, date: isoDay(a.payment.date), mode: a.payment.mode, amount: num(a.amount) })),
      creditNotes: i.creditNotes.map((c) => ({ ...c, date: isoDay(c.date), grandTotal: num(c.grandTotal) })),
      dispatch: i.dispatch ? { ...i.dispatch, dispatchDate: isoDay(i.dispatch.dispatchDate) } : null,
      irn: i.irn, ackNo: i.ackNo, ackDate: isoDay(i.ackDate), ewayBillNo: i.ewayBillNo, ewayBillDate: isoDay(i.ewayBillDate),
    };
  }),

  create: permissionProcedure('CREATE_TAX_INVOICE').input(invoiceCreateInput).mutation(async ({ ctx, input }) => {
    // Lines copied from an order keep the order's locked rates.
    let lines = input.lines;
    if (input.orderId) {
      const o = await ctx.db.salesOrder.findUnique({ where: { id: input.orderId }, include: { lines: true } });
      if (!o || o.customerId !== input.customerId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Order does not belong to this customer' });
      lines = lines.map((l) => ({ ...l, rate: l.rate ?? (o.lines.find((x) => x.variantId === l.variantId) ? num(o.lines.find((x) => x.variantId === l.variantId)!.rate) : null) }));
    }
    const trusted = !!input.orderId;
    return ctx.db.$transaction((tx) => createInvoice(tx, { ...input, lines }, actorOf(ctx.user), { trustedRates: trusted, ip: ctx.ip }), tx60);
  }),

  cancel: ownerProcedure.input(cancelInput).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => cancelInvoice(tx, input.id, input.reason, ctx.user, ctx.ip), tx60)),
});

// ------------------------------------------------------------------ credit notes
export const creditNotesRouter = router({
  list: anyPermissionProcedure('CREATE_TAX_INVOICE', 'RECORD_PAYMENTS').input(docListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db.creditNote.findMany({ where: { ...(input?.customerId ? { customerId: input.customerId } : {}), date: dateRange(input?.from, input?.to) }, orderBy: { createdAt: 'desc' }, take: input?.limit ?? 200, include: { customer: { select: { id: true, name: true } }, invoice: { select: { id: true, number: true } } } });
    return rows.map((c) => ({ id: c.id, number: c.number, date: isoDay(c.date), customer: c.customer, invoice: c.invoice, total: num(c.grandTotal), reason: c.reason, restock: c.restock }));
  }),
  create: permissionProcedure('CREATE_TAX_INVOICE').input(creditNoteCreateInput).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => createCreditNote(tx, input, ctx.user, ctx.ip), tx60)),
});

// ------------------------------------------------------------------ payments & ledger
export const paymentsRouter = router({
  list: anyPermissionProcedure('RECORD_PAYMENTS', 'MANAGE_CUSTOMERS').input(docListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db.payment.findMany({ where: { ...(input?.customerId ? { customerId: input.customerId } : {}), date: dateRange(input?.from, input?.to) }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: input?.limit ?? 200, include: { customer: { select: { id: true, name: true } }, allocations: { include: { invoice: { select: { id: true, number: true } } } } } });
    return rows.map((p) => {
      const allocated = round2(p.allocations.reduce((t, a) => t + num(a.amount), 0));
      return { id: p.id, number: p.number, date: isoDay(p.date), customer: p.customer, amount: num(p.amount), mode: p.mode, reference: p.reference, allocated, onAccount: round2(num(p.amount) - allocated), invoices: p.allocations.map((a) => ({ ...a.invoice, amount: num(a.amount) })) };
    });
  }),
  record: permissionProcedure('RECORD_PAYMENTS').input(paymentCreateInput).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => recordPayment(tx, input, ctx.user, ctx.ip), tx60)),
  allocate: permissionProcedure('RECORD_PAYMENTS').input(paymentAllocateInput).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => allocatePayment(tx, input.paymentId, input.allocations, ctx.user, ctx.ip))),
  remove: ownerProcedure.input(cancelInput).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => deletePayment(tx, input.id, input.reason, ctx.user, ctx.ip))),
});

export const ledgerRouter = router({
  customer: anyPermissionProcedure('RECORD_PAYMENTS', 'MANAGE_CUSTOMERS').input(z.object({ customerId: z.string(), from: z.string().optional(), to: z.string().optional() })).query(async ({ ctx, input }) => {
    const c = await ctx.db.customer.findUnique({ where: { id: input.customerId }, select: { id: true, code: true, name: true, type: true, creditLimit: true, paymentTermsDays: true } });
    if (!c) throw new TRPCError({ code: 'NOT_FOUND' });
    return { customer: { ...c, creditLimit: c.creditLimit == null ? null : num(c.creditLimit) }, ...(await customerLedger(ctx.db, c.id, input)) };
  }),
  receivables: anyPermissionProcedure('RECORD_PAYMENTS', 'MANAGE_CUSTOMERS').query(({ ctx }) => receivables(ctx.db)),
});

