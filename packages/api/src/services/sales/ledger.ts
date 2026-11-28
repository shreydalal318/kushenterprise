import { ageingBucket, AGEING_BUCKETS, istDateString, PAYMENT_MODE_LABEL, paymentStatus, round2, type AgeingBucket, type PaymentMode } from '@kush/core';
import type { Db } from '@kush/db';
import { isoDay, num } from '../num';

export interface LedgerEntry {
  date: string;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE' | 'CANCELLED_INVOICE';
  id: string;
  number: string;
  narration: string;
  /** Receipts: how the money came (Tally shows "By Cash" or "By Bank"). */
  mode: string | null;
  debit: number;
  credit: number;
  balance: number;
}

/**
 * Customer account statement and receivables position.
 * Balance = invoices − credit notes − payments (positive = customer owes us).
 * Ageing buckets the still-due part of each invoice by its invoice date.
 */
export async function customerLedger(db: Db, customerId: string, opts: { from?: string; to?: string } = {}) {
  const today = istDateString();
  const [invoices, payments, creditNotes] = await Promise.all([
    db.invoice.findMany({ where: { customerId }, orderBy: { date: 'asc' }, include: { creditNotes: { select: { grandTotal: true } } } }),
    db.payment.findMany({ where: { customerId }, orderBy: { date: 'asc' }, include: { allocations: true } }),
    db.creditNote.findMany({ where: { customerId }, orderBy: { date: 'asc' }, include: { invoice: { select: { number: true } } } }),
  ]);
  const all: Omit<LedgerEntry, 'balance'>[] = [
    ...invoices.map((i) => ({
      date: isoDay(i.date)!, type: (i.status === 'CANCELLED' ? 'CANCELLED_INVOICE' : 'INVOICE') as LedgerEntry['type'], id: i.id, number: i.number,
      narration: i.status === 'CANCELLED' ? `Cancelled: ${i.cancelReason ?? ''}` : 'Sales', mode: null, debit: i.status === 'CANCELLED' ? 0 : num(i.grandTotal), credit: 0,
    })),
    ...payments.map((p) => ({ date: isoDay(p.date)!, type: 'PAYMENT' as const, id: p.id, number: p.number, narration: `Receipt (${PAYMENT_MODE_LABEL[p.mode as PaymentMode]})${p.reference ? ` ${p.reference}` : ''}`, mode: p.mode, debit: 0, credit: num(p.amount) })),
    ...creditNotes.map((c) => ({ date: isoDay(c.date)!, type: 'CREDIT_NOTE' as const, id: c.id, number: c.number, narration: `Credit note${c.invoice ? ` against ${c.invoice.number}` : ''}: ${c.reason}`, mode: null, debit: 0, credit: num(c.grandTotal) })),
  // By date; on the same day sales first, then by voucher number (as Tally lists them).
  ].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : Number(b.type === 'INVOICE') - Number(a.type === 'INVOICE') || a.number.localeCompare(b.number, 'en', { numeric: true })));

  let opening = 0;
  const rows: LedgerEntry[] = [];
  let bal = 0;
  for (const e of all) {
    if (opts.from && e.date < opts.from) { opening = round2(opening + e.debit - e.credit); bal = opening; continue; }
    if (opts.to && e.date > opts.to) continue;
    bal = round2(bal + e.debit - e.credit);
    rows.push({ ...e, balance: bal });
  }

  const openInvoices = invoices.filter((i) => i.status === 'ISSUED').map((i) => {
    const settled = round2(num(i.amountPaid) + i.creditNotes.reduce((t, c) => t + num(c.grandTotal), 0));
    const due = round2(num(i.grandTotal) - settled);
    const dueDate = isoDay(i.dueDate)!;
    return { id: i.id, number: i.number, date: isoDay(i.date)!, dueDate, total: num(i.grandTotal), settled, due, status: paymentStatus({ total: num(i.grandTotal), settled, dueDate }, today), bucket: ageingBucket(isoDay(i.date)!, today) };
  });
  const ageing = Object.fromEntries(AGEING_BUCKETS.map((b) => [b, 0])) as Record<AgeingBucket, number>;
  for (const i of openInvoices) if (i.due > 0) ageing[i.bucket] = round2(ageing[i.bucket] + i.due);
  const unallocated = round2(payments.reduce((t, p) => t + num(p.amount) - p.allocations.reduce((s, a) => s + num(a.amount), 0), 0));
  const unappliedCredit = round2(Math.max(0, openInvoices.reduce((t, i) => t + Math.min(0, i.due), 0) * -1));
  const totalDue = round2(openInvoices.reduce((t, i) => t + Math.max(0, i.due), 0));
  return {
    today, opening, rows, closing: bal,
    outstanding: round2(totalDue - unallocated - unappliedCredit),
    totalDue, onAccount: round2(unallocated + unappliedCredit),
    overdue: round2(openInvoices.filter((i) => i.status === 'OVERDUE').reduce((t, i) => t + i.due, 0)),
    ageing, openInvoices: openInvoices.filter((i) => i.due > 0),
  };
}

/** Outstanding by customer with ageing (receivables list). */
export async function receivables(db: Db) {
  const customers = await db.customer.findMany({ where: { deletedAt: null, invoices: { some: { status: 'ISSUED' } } }, select: { id: true, code: true, name: true, type: true, creditLimit: true } });
  const out = [];
  for (const c of customers) {
    const l = await customerLedger(db, c.id);
    if (l.outstanding !== 0 || l.totalDue > 0) out.push({ customerId: c.id, code: c.code, name: c.name, type: c.type, creditLimit: c.creditLimit == null ? null : num(c.creditLimit), outstanding: l.outstanding, overdue: l.overdue, ageing: l.ageing, onAccount: l.onAccount });
  }
  return out.sort((a, b) => b.outstanding - a.outstanding);
}
