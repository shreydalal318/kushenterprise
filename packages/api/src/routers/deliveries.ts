import { round2 } from '@kush/core';
import { isoDay, num } from '../services/num';
import { permissionProcedure, router, staffProcedure } from '../trpc';

type Ship = { name?: string; attn?: string | null; addressLines?: string[]; stateName?: string } | null;

/** Local deliveries by our own staff: each delivery person's list, and the dispatcher's board. */
export const deliveriesRouter = router({
  /** What I have to deliver (delivery boys see this in the app, with the address and phone to call). */
  mine: staffProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.dispatch.findMany({
      where: { deliveryPersonId: ctx.user.id, deliveredAt: null, method: 'OWN_DELIVERY', order: { status: 'DISPATCHED' } },
      orderBy: { createdAt: 'asc' },
      include: {
        invoice: { select: { number: true, grandTotal: true, amountPaid: true, paymentTerms: true } },
        order: { select: { id: true, number: true, surgeryDate: true, patientName: true, customerNote: true, shippingSnapshot: true, customer: { select: { name: true, mobile: true, contactPerson: true } }, lines: { select: { qty: true } } } },
      },
    });
    return rows.map((d) => {
      const ship = d.order.shippingSnapshot as Ship;
      return {
        dispatchId: d.id, orderId: d.order.id, orderNumber: d.order.number, customer: d.order.customer.name, contact: d.order.customer.contactPerson, phone: d.order.customer.mobile,
        address: [ship?.attn, ...(ship?.addressLines ?? [])].filter(Boolean).join(', '), units: d.order.lines.reduce((t, l) => t + l.qty, 0),
        invoice: d.invoice ? { number: d.invoice.number, total: num(d.invoice.grandTotal), due: round2(num(d.invoice.grandTotal) - num(d.invoice.amountPaid)) } : null,
        surgeryDate: isoDay(d.order.surgeryDate), patientName: d.order.patientName, note: d.order.customerNote, dispatchDate: isoDay(d.dispatchDate), vehicleNo: d.vehicleNo,
      };
    });
  }),

  /** Dispatcher's view: own deliveries still out (by person) and orders waiting for customer pickup. */
  board: permissionProcedure('VIEW_ORDERS').query(async ({ ctx }) => {
    const rows = await ctx.db.dispatch.findMany({
      where: { deliveredAt: null, method: { in: ['OWN_DELIVERY', 'PICKUP'] }, order: { status: 'DISPATCHED' } },
      orderBy: { createdAt: 'asc' },
      include: { order: { select: { id: true, number: true, shippingSnapshot: true, customer: { select: { name: true } } } }, invoice: { select: { number: true } } },
    });
    return rows.map((d) => {
      const ship = d.order.shippingSnapshot as Ship;
      return {
        dispatchId: d.id, method: d.method, orderId: d.order.id, orderNumber: d.order.number, customer: d.order.customer.name, address: (ship?.addressLines ?? []).join(', '),
        person: d.deliveryPersonName, personId: d.deliveryPersonId, mobile: d.deliveryPersonMobile, invoice: d.invoice?.number ?? null, since: d.createdAt,
      };
    });
  }),
});
