import { TRPCError } from '@trpc/server';
import { notifyCustomer } from '../../notify';
import { round2 } from '@kush/core';
import type { Tx } from '@kush/db';
import { logActivity } from '../activity';
import { dayToDate, num } from '../num';
import { nextDocNumber } from '../numbering';

/** Amount still due on an invoice: total − payments applied − credit notes against it. */
export async function invoiceDue(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { creditNotes: { select: { grandTotal: true } } } });
  if (!inv) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
  const credited = inv.creditNotes.reduce((t, c) => t + num(c.grandTotal), 0);
  return { inv, due: round2(num(inv.grandTotal) - num(inv.amountPaid) - credited) };
}

async function applyAllocation(tx: Tx, paymentId: string, customerId: string, a: { invoiceId: string; amount: number }) {
  const { inv, due } = await invoiceDue(tx, a.invoiceId);
  if (inv.customerId !== customerId) throw new TRPCError({ code: 'BAD_REQUEST', message: `${inv.number} belongs to another customer` });
  if (inv.status === 'CANCELLED') throw new TRPCError({ code: 'BAD_REQUEST', message: `${inv.number} is cancelled` });
  if (a.amount > due + 0.001) throw new TRPCError({ code: 'BAD_REQUEST', message: `Only ₹${due} is due on ${inv.number}` });
  await tx.paymentAllocation.upsert({
    where: { paymentId_invoiceId: { paymentId, invoiceId: inv.id } },
    create: { paymentId, invoiceId: inv.id, amount: a.amount },
    update: { amount: { increment: a.amount } },
  });
  await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: { increment: a.amount } } });
}

/** Oldest-due-first allocation of `amount` across the customer's open invoices. */
async function autoAllocations(tx: Tx, customerId: string, amount: number) {
  const open = await tx.invoice.findMany({ where: { customerId, status: 'ISSUED' }, orderBy: [{ dueDate: 'asc' }, { date: 'asc' }], include: { creditNotes: { select: { grandTotal: true } } } });
  const out: { invoiceId: string; amount: number }[] = [];
  let left = amount;
  for (const i of open) {
    if (left <= 0) break;
    const due = round2(num(i.grandTotal) - num(i.amountPaid) - i.creditNotes.reduce((t, c) => t + num(c.grandTotal), 0));
    if (due <= 0) continue;
    const take = round2(Math.min(due, left));
    out.push({ invoiceId: i.id, amount: take });
    left = round2(left - take);
  }
  return out;
}

export interface PaymentInput {
  customerId: string;
  date: string;
  amount: number;
  mode: 'CASH' | 'UPI' | 'NEFT_RTGS' | 'CHEQUE' | 'CARD' | 'OTHER';
  reference?: string | null;
  note?: string | null;
  allocations?: { invoiceId: string; amount: number }[];
  autoAllocate?: boolean;
}

/** Record money received; apply it to invoices (chosen, or oldest first). The rest stays on account. */
export async function recordPayment(tx: Tx, input: PaymentInput, actor: { id: string }, ip?: string | null) {
  const c = await tx.customer.findUnique({ where: { id: input.customerId } });
  if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
  const allocations = input.autoAllocate ? await autoAllocations(tx, c.id, input.amount) : (input.allocations ?? []).filter((a) => a.amount > 0);
  const allocated = round2(allocations.reduce((t, a) => t + a.amount, 0));
  if (allocated > input.amount + 0.001) throw new TRPCError({ code: 'BAD_REQUEST', message: `Allocated ₹${allocated} is more than the ₹${input.amount} received` });
  const number = await nextDocNumber(tx, 'PAYMENT_RECEIPT', input.date);
  const p = await tx.payment.create({ data: { number, customerId: c.id, date: dayToDate(input.date)!, amount: input.amount, mode: input.mode, reference: input.reference ?? null, note: input.note ?? null, createdById: actor.id } });
  for (const a of allocations) await applyAllocation(tx, p.id, c.id, a);
  await logActivity(tx, { actorId: actor.id, action: 'payment.record', entityType: 'Payment', entityId: p.id, ip, summary: `${number}: ₹${input.amount} from ${c.name} by ${input.mode}${allocated < input.amount ? ` (₹${round2(input.amount - allocated)} on account)` : ''}` });
  await notifyCustomer(tx, c.id, { title: `Payment received: ₹${input.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, body: `Thank you. Receipt ${number}${input.reference ? ` (${input.reference})` : ''}.`, link: '/portal/account' });
  return { id: p.id, number, allocated, onAccount: round2(input.amount - allocated) };
}

/** Apply an existing payment's unallocated balance to invoices. */
export async function allocatePayment(tx: Tx, paymentId: string, allocations: { invoiceId: string; amount: number }[], actor: { id: string }, ip?: string | null) {
  const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { allocations: true } });
  if (!p) throw new TRPCError({ code: 'NOT_FOUND' });
  const free = round2(num(p.amount) - p.allocations.reduce((t, a) => t + num(a.amount), 0));
  const want = round2(allocations.reduce((t, a) => t + a.amount, 0));
  if (want > free + 0.001) throw new TRPCError({ code: 'BAD_REQUEST', message: `Only ₹${free} of ${p.number} is unallocated` });
  for (const a of allocations.filter((x) => x.amount > 0)) await applyAllocation(tx, p.id, p.customerId, a);
  await logActivity(tx, { actorId: actor.id, action: 'payment.allocate', entityType: 'Payment', entityId: p.id, ip, summary: `${p.number}: applied ₹${want}` });
  return { ok: true };
}

/** Remove a wrongly entered payment (owner): un-applies it from invoices; kept in the activity log. */
export async function deletePayment(tx: Tx, paymentId: string, reason: string, actor: { id: string }, ip?: string | null) {
  const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { allocations: true, customer: { select: { name: true } } } });
  if (!p) throw new TRPCError({ code: 'NOT_FOUND' });
  for (const a of p.allocations) await tx.invoice.update({ where: { id: a.invoiceId }, data: { amountPaid: { decrement: num(a.amount) } } });
  await tx.payment.delete({ where: { id: p.id } });
  await logActivity(tx, { actorId: actor.id, action: 'payment.delete', entityType: 'Payment', entityId: p.id, ip, summary: `Deleted ${p.number} (₹${num(p.amount)} from ${p.customer.name}): ${reason}`, before: { number: p.number, amount: num(p.amount), allocations: p.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: num(a.amount) })) } });
  return { ok: true };
}
