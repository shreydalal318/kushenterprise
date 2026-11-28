/**
 * Auto-posting: each money document writes its Tally voucher inside the caller's transaction, so
 * the books can never disagree with the documents. Re-posting replaces the entries (the voucher
 * keeps its id); cancelling a document marks its voucher cancelled, which drops it from balances.
 */
import { assertBalanced, gstVoucherEntries, PAYMENT_MODE_LABEL, round2, tallyDate, voucherAmount, type PaymentMode, type PostingLine, type VoucherType } from '@kush/core';
import type { Db } from '@kush/db';
import { isoDay, num } from '../num';
import { defaultMoneyLedgerId, ledgerForCustomer, ledgerForSupplier, systemLedgerIds } from './ledgers';

export type VoucherSource = 'Invoice' | 'CreditNote' | 'Payment' | 'PurchaseBill' | 'SupplierReturn' | 'SupplierPayment';

export interface VoucherEntryDraft { ledgerId: string; amount: number; billRef?: string | null }
interface VoucherDraft {
  type: VoucherType;
  number: string;
  date: Date;
  narration: string | null;
  sourceType: VoucherSource;
  sourceId: string;
  partyLedgerId: string | null;
  cancelled: boolean;
  cancelReason?: string | null;
  cancelledAt?: Date | null;
  createdById: string | null;
  entries: VoucherEntryDraft[];
}

/** One line per ledger (amounts added up, first bill reference kept); zero lines dropped. */
export function mergeEntries(entries: VoucherEntryDraft[]): VoucherEntryDraft[] {
  const out: VoucherEntryDraft[] = [];
  for (const e of entries) {
    const hit = out.find((x) => x.ledgerId === e.ledgerId);
    if (hit) { hit.amount = round2(hit.amount + e.amount); hit.billRef ??= e.billRef ?? null; }
    else out.push({ ...e });
  }
  return out.filter((e) => e.amount !== 0);
}

/** Create or replace the voucher for a source document. */
async function writeVoucher(tx: Db, d: VoucherDraft) {
  const entries = mergeEntries(d.entries);
  assertBalanced(entries, `${d.type} voucher ${d.number}`);
  const data = {
    type: d.type, number: d.number, date: d.date, narration: d.narration, partyLedgerId: d.partyLedgerId, amount: voucherAmount(entries),
    cancelled: d.cancelled, cancelReason: d.cancelled ? d.cancelReason ?? null : null, cancelledAt: d.cancelled ? d.cancelledAt ?? new Date() : null, createdById: d.createdById,
  };
  const existing = await tx.voucher.findUnique({ where: { sourceType_sourceId: { sourceType: d.sourceType, sourceId: d.sourceId } }, select: { id: true } });
  let id: string;
  if (existing) {
    await tx.voucherEntry.deleteMany({ where: { voucherId: existing.id } });
    await tx.voucher.update({ where: { id: existing.id }, data });
    id = existing.id;
  } else {
    id = (await tx.voucher.create({ data: { ...data, sourceType: d.sourceType, sourceId: d.sourceId }, select: { id: true } })).id;
  }
  if (entries.length) await tx.voucherEntry.createMany({ data: entries.map((e, i) => ({ voucherId: id, ledgerId: e.ledgerId, amount: e.amount, billRef: e.billRef ?? null, sl: i + 1 })) });
  return { id };
}

/** Turn core's posting refs (party / system key / ledger) into ledger ids. */
async function resolve(tx: Db, lines: PostingLine[], partyLedgerId: string, partyBillRef: string | null): Promise<VoucherEntryDraft[]> {
  const ids = await systemLedgerIds(tx, lines.flatMap((l) => (l.ref.kind === 'system' ? [l.ref.key] : [])));
  return lines.map((l) => ({
    ledgerId: l.ref.kind === 'party' ? partyLedgerId : l.ref.kind === 'system' ? ids.get(l.ref.key)! : l.ref.id,
    amount: l.amount,
    billRef: l.ref.kind === 'party' ? partyBillRef : null,
  }));
}

export const deleteVoucherFor = (tx: Db, sourceType: VoucherSource, sourceId: string) => tx.voucher.deleteMany({ where: { sourceType, sourceId } });

const moneyNote = (mode: PaymentMode, reference: string | null) => `${PAYMENT_MODE_LABEL[mode]}${reference ? ` ${reference}` : ''}`;

/** Sales: Dr customer; Cr Sales GST r%, Output CGST + SGST (or IGST), Round Off. */
export async function postInvoice(tx: Db, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: { select: { gstRate: true, amount: true } } } });
  const party = await ledgerForCustomer(tx, inv.customerId);
  const lines = gstVoucherEntries('SALES', {
    lines: inv.lines.map((l) => ({ gstRate: num(l.gstRate), amount: num(l.amount) })),
    cgst: num(inv.cgstTotal), sgst: num(inv.sgstTotal), igst: num(inv.igstTotal), roundOff: num(inv.roundOff), total: num(inv.grandTotal),
  });
  return writeVoucher(tx, {
    type: 'SALES', number: inv.number, date: inv.date, narration: `Being goods sold vide ${inv.number}`,
    sourceType: 'Invoice', sourceId: inv.id, partyLedgerId: party.id, createdById: inv.createdById,
    cancelled: inv.status === 'CANCELLED', cancelReason: inv.cancelReason, cancelledAt: inv.cancelledAt,
    entries: await resolve(tx, lines, party.id, inv.number),
  });
}

/** Credit note: the mirror of a sale, through Sales Returns. */
export async function postCreditNote(tx: Db, creditNoteId: string) {
  const cn = await tx.creditNote.findUniqueOrThrow({ where: { id: creditNoteId }, include: { lines: { select: { gstRate: true, amount: true } }, invoice: { select: { number: true } } } });
  const party = await ledgerForCustomer(tx, cn.customerId);
  const lines = gstVoucherEntries('CREDIT_NOTE', {
    lines: cn.lines.map((l) => ({ gstRate: num(l.gstRate), amount: num(l.amount) })),
    cgst: num(cn.cgstTotal), sgst: num(cn.sgstTotal), igst: num(cn.igstTotal), roundOff: num(cn.roundOff), total: num(cn.grandTotal),
  });
  return writeVoucher(tx, {
    type: 'CREDIT_NOTE', number: cn.number, date: cn.date, narration: `Being goods returned${cn.invoice ? ` against ${cn.invoice.number}` : ''}: ${cn.reason}`,
    sourceType: 'CreditNote', sourceId: cn.id, partyLedgerId: party.id, createdById: cn.createdById, cancelled: false,
    entries: await resolve(tx, lines, party.id, cn.invoice?.number ?? cn.number),
  });
}

/** Customer receipt: Dr Cash / Bank, Cr customer (the invoices it settles go in the narration). */
export async function postReceipt(tx: Db, paymentId: string) {
  const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { allocations: { include: { invoice: { select: { number: true } } }, orderBy: { invoice: { date: 'asc' } } } } });
  const party = await ledgerForCustomer(tx, p.customerId);
  const money = p.ledgerId ?? (await defaultMoneyLedgerId(tx, p.mode));
  const bills = p.allocations.map((a) => a.invoice.number);
  const amount = num(p.amount);
  return writeVoucher(tx, {
    type: 'RECEIPT', number: p.number, date: p.date, narration: `Receipt ${moneyNote(p.mode, p.reference)}${bills.length ? ` against ${bills.join(', ')}` : ' on account'}`,
    sourceType: 'Payment', sourceId: p.id, partyLedgerId: party.id, createdById: p.createdById, cancelled: false,
    entries: [{ ledgerId: money, amount }, { ledgerId: party.id, amount: -amount, billRef: bills.join(', ') || null }],
  });
}

/** Purchase: Dr Purchase GST r% (or the line's own ledger), Dr Input taxes; Cr supplier. */
export async function postPurchaseBill(tx: Db, billId: string) {
  const b = await tx.purchaseBill.findUniqueOrThrow({ where: { id: billId }, include: { supplier: { select: { name: true } }, lines: { select: { gstRate: true, amount: true, ledgerId: true } } } });
  const party = await ledgerForSupplier(tx, b.supplierId);
  const lines = gstVoucherEntries('PURCHASE', {
    lines: b.lines.map((l) => ({ gstRate: num(l.gstRate), amount: num(l.amount), ledgerId: l.ledgerId })),
    cgst: num(b.cgstTotal), sgst: num(b.sgstTotal), igst: num(b.igstTotal), roundOff: num(b.roundOff), total: num(b.grandTotal),
  });
  return writeVoucher(tx, {
    type: 'PURCHASE', number: b.number, date: b.billDate, narration: `Being purchases from ${b.supplier.name} vide bill ${b.billNo} dt ${tallyDate(isoDay(b.billDate))}`,
    sourceType: 'PurchaseBill', sourceId: b.id, partyLedgerId: party.id, createdById: b.createdById,
    cancelled: b.status === 'CANCELLED', cancelReason: b.cancelReason, cancelledAt: b.cancelledAt,
    entries: await resolve(tx, lines, party.id, b.billNo),
  });
}

/** Debit note (goods returned to a supplier): Dr supplier; Cr Purchase Returns and Input taxes. */
export async function postDebitNote(tx: Db, returnId: string) {
  const r = await tx.supplierReturn.findUniqueOrThrow({ where: { id: returnId }, include: { supplier: { select: { name: true } } } });
  // Nothing known about its value (no cost on file): there is nothing to post.
  if (num(r.grandTotal) === 0) { await deleteVoucherFor(tx, 'SupplierReturn', r.id); return null; }
  const party = await ledgerForSupplier(tx, r.supplierId);
  const lines = gstVoucherEntries('DEBIT_NOTE', {
    lines: [{ gstRate: 0, amount: num(r.taxableTotal) }],
    cgst: num(r.cgstTotal), sgst: num(r.sgstTotal), igst: num(r.igstTotal), roundOff: num(r.roundOff), total: num(r.grandTotal),
  });
  return writeVoucher(tx, {
    type: 'DEBIT_NOTE', number: r.number, date: r.date, narration: `Being goods returned to ${r.supplier.name}: ${r.reason}`,
    sourceType: 'SupplierReturn', sourceId: r.id, partyLedgerId: party.id, createdById: r.createdById, cancelled: false,
    entries: await resolve(tx, lines, party.id, r.number),
  });
}

/** Supplier payment: Dr supplier, Cr the cash / bank ledger it was paid from. */
export async function postSupplierPayment(tx: Db, paymentId: string) {
  const p = await tx.supplierPayment.findUniqueOrThrow({ where: { id: paymentId }, include: { allocations: { include: { bill: { select: { billNo: true } } } } } });
  const party = await ledgerForSupplier(tx, p.supplierId);
  const bills = p.allocations.map((a) => a.bill.billNo);
  const amount = num(p.amount);
  return writeVoucher(tx, {
    type: 'PAYMENT', number: p.number, date: p.date, narration: `Payment ${moneyNote(p.mode, p.reference)}${bills.length ? ` against bill ${bills.join(', ')}` : ' on account'}`,
    sourceType: 'SupplierPayment', sourceId: p.id, partyLedgerId: party.id, createdById: p.createdById, cancelled: false,
    entries: [{ ledgerId: party.id, amount, billRef: bills.join(', ') || null }, { ledgerId: p.ledgerId, amount: -amount }],
  });
}
