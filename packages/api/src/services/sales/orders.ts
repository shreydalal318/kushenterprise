import { TRPCError } from '@trpc/server';
import { canMoveTo, ORDER_STATUS_LABEL, type OrderStatus } from '@kush/core';
import type { Tx } from '@kush/db';
import { logActivity } from '../activity';
import { dayToDate } from '../num';
import { nextDocNumber } from '../numbering';
import { resolveCustomerPrices } from '../pricing';
import { loadVariant } from '../stock';
import { customerForDocument } from './common';
import { notify, notifyCustomer, staffForCustomer } from '../../notify';
import { getSettings, settingsView } from '../settings';

export interface OrderInput {
  customerId: string;
  forDoctorId?: string | null;
  shippingAddressId?: string | null;
  customerNote?: string | null;
  patientName?: string | null;
  surgeryDate?: string | null;
  assignedToId?: string | null;
  source: 'PORTAL' | 'MOBILE_APP' | 'STAFF';
  clientRequestId?: string | null;
  lines: { variantId: string; qty: number }[];
}

/** Create an order at the customer's prices (rates are locked on the order lines). */
export async function createOrder(tx: Tx, input: OrderInput, actor: { id: string }, ip?: string | null) {
  if (input.clientRequestId) {
    const dup = await tx.salesOrder.findUnique({ where: { clientRequestId: input.clientRequestId }, select: { id: true, number: true } });
    if (dup) return { ...dup, duplicate: true };
  }
  if (!input.lines.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add at least one item' });
  const doc = await customerForDocument(tx, input.customerId, input);
  const variants = await Promise.all(input.lines.map((l) => loadVariant(tx, l.variantId)));
  for (const v of variants) if (!v.isActive || !v.product.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: `${v.product.name} ${v.label ?? ''} is not available` });
  const prices = await resolveCustomerPrices(tx, input.customerId, [...new Set(variants.map((v) => v.productId))]);
  const today = new Date().toISOString().slice(0, 10);
  const number = await nextDocNumber(tx, 'SALES_ORDER', today);
  const assignedToId = input.assignedToId ?? doc.customer.assignedEmployeeId ?? null;
  const o = await tx.salesOrder.create({
    data: {
      number, customerId: doc.customer.id, forDoctorId: doc.doctor?.id ?? null, status: 'PLACED', source: input.source,
      shippingAddressId: doc.shippingAddressId, shippingSnapshot: doc.consignee, customerNote: input.customerNote ?? null,
      patientName: input.patientName ?? null, surgeryDate: dayToDate(input.surgeryDate ?? null), placedById: actor.id, assignedToId,
      clientRequestId: input.clientRequestId ?? null,
      lines: { create: input.lines.map((l, i) => ({ variantId: l.variantId, qty: l.qty, rate: prices.get(variants[i]!.productId)!.rate })) },
      events: { create: [{ status: 'PLACED', byUserId: actor.id, note: input.source === 'STAFF' ? 'Entered by staff' : 'Placed by customer' }] },
    },
  });
  await logActivity(tx, { actorId: actor.id, action: 'order.create', entityType: 'SalesOrder', entityId: o.id, ip, summary: `Order ${number} for ${doc.customer.name}${doc.doctor ? ` (for ${doc.doctor.name})` : ''}: ${input.lines.length} line(s)` });
  if (input.source !== 'STAFF') {
    const units = input.lines.reduce((t, l) => t + l.qty, 0);
    await notify(tx, { userIds: [...(await staffForCustomer(tx, doc.customer.id)), ...(assignedToId ? [assignedToId] : [])], title: `New order ${number}`, body: `${doc.customer.name}${doc.doctor ? ` for ${doc.doctor.name}` : ''}: ${units} unit(s)${input.surgeryDate ? `, surgery ${input.surgeryDate}` : ''}`, link: `/app/orders/${o.id}`, channels: ['PUSH'] });
    await notifyCustomer(tx, doc.customer.id, { title: `Order ${number} received`, body: `We have your order for ${units} unit(s) and will confirm it shortly.`, link: `/portal/orders/${o.id}` });
  }
  return { id: o.id, number, duplicate: false };
}

export interface StatusInput {
  id: string;
  status: OrderStatus;
  note?: string | null;
  dispatch?: { courier?: string | null; docketNo?: string | null; vehicleNo?: string | null; dispatchDate: string; invoiceId?: string | null } | null;
}

/** Move an order along Placed → Confirmed → Packed → Dispatched → Delivered (hold / cancel aside). */
export async function changeOrderStatus(tx: Tx, input: StatusInput, actor: { id: string }, ip?: string | null) {
  const o = await tx.salesOrder.findUnique({ where: { id: input.id }, include: { lines: true, invoices: { where: { status: 'ISSUED' }, select: { id: true } } } });
  if (!o) throw new TRPCError({ code: 'NOT_FOUND' });
  if (!canMoveTo(o.status, input.status)) throw new TRPCError({ code: 'BAD_REQUEST', message: `An order that is ${ORDER_STATUS_LABEL[o.status].toLowerCase()} cannot be marked ${ORDER_STATUS_LABEL[input.status].toLowerCase()}` });
  if (input.status === 'CANCELLED' && o.invoices.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This order has invoices; cancel those first' });
  if (input.status === 'DISPATCHED') {
    if (!o.invoices.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Raise a tax invoice before dispatching' });
    if (!input.dispatch?.dispatchDate) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Enter the dispatch date and courier details' });
    const invoiceId = input.dispatch.invoiceId ?? o.invoices[o.invoices.length - 1]!.id;
    const exists = await tx.dispatch.findUnique({ where: { invoiceId } });
    const data = { orderId: o.id, invoiceId, courier: input.dispatch.courier ?? null, docketNo: input.dispatch.docketNo ?? null, vehicleNo: input.dispatch.vehicleNo ?? null, dispatchDate: dayToDate(input.dispatch.dispatchDate)! };
    if (exists) await tx.dispatch.update({ where: { id: exists.id }, data }); else await tx.dispatch.create({ data });
    // Print the dispatch details on the invoice too (Tally's "Dispatched through" / "Dispatch Doc No.").
    await tx.invoice.update({ where: { id: invoiceId }, data: { dispatchedThrough: [input.dispatch.courier, input.dispatch.vehicleNo].filter(Boolean).join(', ') || undefined, dispatchDocNo: input.dispatch.docketNo ?? undefined } });
  }
  await tx.salesOrder.update({ where: { id: o.id }, data: { status: input.status } });
  if (settingsView(await getSettings(tx)).notificationConfig.orderStatusToCustomer) {
    const d = input.dispatch;
    const body = input.status === 'DISPATCHED' && d ? `Sent${d.courier ? ` via ${d.courier}` : ''}${d.docketNo ? `, docket ${d.docketNo}` : ''}.`
      : input.status === 'CANCELLED' ? `Your order was cancelled${input.note ? `: ${input.note}` : '.'}`
        : input.status === 'ON_HOLD' ? `Your order is on hold${input.note ? `: ${input.note}` : '.'}`
          : `Your order is now ${ORDER_STATUS_LABEL[input.status].toLowerCase()}.`;
    await notifyCustomer(tx, o.customerId, { title: `Order ${o.number}: ${ORDER_STATUS_LABEL[input.status]}`, body, link: `/portal/orders/${o.id}` });
  }
  await tx.orderStatusEvent.create({ data: { orderId: o.id, status: input.status, note: input.note ?? null, byUserId: actor.id } });
  await logActivity(tx, { actorId: actor.id, action: 'order.status', entityType: 'SalesOrder', entityId: o.id, ip, summary: `${o.number}: ${ORDER_STATUS_LABEL[o.status]} → ${ORDER_STATUS_LABEL[input.status]}${input.note ? ` (${input.note})` : ''}` });
  return { ok: true };
}

/** Scan-to-dispatch check: every outstanding unit on the order must have been scanned. */
export async function verifyPacked(tx: Tx, id: string, scanned: { variantId: string; qty: number }[], actor: { id: string }, ip?: string | null) {
  const o = await tx.salesOrder.findUnique({ where: { id }, include: { lines: { include: { variant: { select: { label: true, product: { select: { name: true } } } } } } } });
  if (!o) throw new TRPCError({ code: 'NOT_FOUND' });
  const problems: string[] = [];
  const need = new Map<string, number>();
  for (const l of o.lines) need.set(l.variantId, (need.get(l.variantId) ?? 0) + l.qty);
  const got = new Map<string, number>();
  for (const s of scanned) got.set(s.variantId, (got.get(s.variantId) ?? 0) + s.qty);
  for (const l of o.lines) {
    const n = need.get(l.variantId)!, g = got.get(l.variantId) ?? 0;
    if (g < n) problems.push(`${l.variant.product.name} ${l.variant.label ?? ''}: ${n - g} missing`);
    if (g > n) problems.push(`${l.variant.product.name} ${l.variant.label ?? ''}: ${g - n} extra`);
  }
  for (const v of got.keys()) if (!need.has(v)) problems.push('An item that is not on this order was scanned');
  if (problems.length) return { ok: false as const, problems: [...new Set(problems)] };
  if (canMoveTo(o.status, 'PACKED')) await changeOrderStatus(tx, { id, status: 'PACKED', note: 'Verified by scanning' }, actor, ip);
  return { ok: true as const, problems: [] };
}

