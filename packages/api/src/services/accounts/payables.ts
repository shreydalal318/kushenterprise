/**
 * Payables: supplier bills (Tally purchase vouchers) and payments to suppliers. Minimal by design:
 * validate, number, save, keep amountPaid in step through allocations, and post. Goods come into
 * stock through the GRN, not the bill; a bill can point at the GRN it pays for.
 */
import { TRPCError } from '@trpc/server';
import { addDays, computeGst, isCashBankGroup, round2 } from '@kush/core';
import type { PaymentMode, Tx } from '@kush/db';
import { logActivity } from '../activity';
import { dayToDate, num } from '../num';
import { nextDocNumber } from '../numbering';
import { requireCompanyState } from '../sales/common';
import { loadVariant } from '../stock';
import { defaultMoneyLedgerId, requireCashBankLedger } from './ledgers';
import { postPurchaseBill, postSupplierPayment } from './posting';

export interface PurchaseBillLineInput {
  /** A stock item (posts to Purchase GST r%)… */
  variantId?: string | null;
  /** …or any other ledger: courier, rent, repairs, equipment bought. */
  ledgerId?: string | null;
  description?: string | null;
  hsnCode?: string | null;
  qty?: number | null;
  unit?: string | null;
  rate: number;
  discPct?: number;
  gstRate?: number | null;
}

export interface PurchaseBillInput {
  supplierId: string;
  billNo: string;
  billDate: string;
  dueDate?: string | null;
  grnId?: string | null;
  note?: string | null;
  /** The total printed on the supplier's bill; up to ₹1 difference from items + GST goes to round off. */
  billTotal?: number | null;
  lines: PurchaseBillLineInput[];
}

export async function createPurchaseBill(tx: Tx, input: PurchaseBillInput, actor: { id: string }, ip?: string | null) {
  const settings = await requireCompanyState(tx);
  const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier || !supplier.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose an active supplier' });
  const billNo = input.billNo.trim();
  const dup = await tx.purchaseBill.findUnique({ where: { supplierId_billNo: { supplierId: supplier.id, billNo } }, select: { number: true } });
  if (dup) throw new TRPCError({ code: 'CONFLICT', message: `Bill ${billNo} from ${supplier.name} is already entered (${dup.number})` });
  if (input.grnId) {
    const grn = await tx.grn.findUnique({ where: { id: input.grnId }, select: { supplierId: true, number: true, purchaseBills: { where: { status: 'ISSUED' }, select: { number: true } } } });
    if (!grn || grn.supplierId !== supplier.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'That goods receipt is not from this supplier' });
    if (grn.purchaseBills.length) throw new TRPCError({ code: 'BAD_REQUEST', message: `${grn.number} is already billed on ${grn.purchaseBills[0]!.number}` });
  }
  if (!input.lines.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add at least one line' });

  const built = [];
  for (const [i, l] of input.lines.entries()) {
    const n = `Line ${i + 1}`;
    if (!!l.variantId === !!l.ledgerId) throw new TRPCError({ code: 'BAD_REQUEST', message: `${n}: choose an item or a ledger` });
    const discPct = Math.min(100, Math.max(0, l.discPct ?? 0));
    if (l.variantId) {
      const v = await loadVariant(tx, l.variantId);
      if (!l.qty || l.qty <= 0 || !Number.isInteger(l.qty)) throw new TRPCError({ code: 'BAD_REQUEST', message: `${n}: enter a whole quantity` });
      built.push({
        variantId: v.id, ledgerId: null, description: l.description || (v.label ? `${v.product.name} (${v.label})` : v.product.name), hsnCode: l.hsnCode || v.product.hsnCode,
        qty: l.qty, unit: l.unit || v.product.unit, rate: round2(l.rate), discPct, gstRate: l.gstRate ?? num(v.product.gstRate),
      });
    } else {
      const led = await tx.ledger.findUnique({ where: { id: l.ledgerId! } });
      if (!led || !led.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: `${n}: choose an active ledger` });
      // GST, cash/bank and party ledgers are filled in by the posting itself, never as a bill line.
      if (isCashBankGroup(led.group) || led.group === 'DUTIES_TAXES' || led.customerId || led.supplierId) throw new TRPCError({ code: 'BAD_REQUEST', message: `${n}: ${led.name} can't be used on a bill line` });
      if (l.qty != null && l.qty <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: `${n}: quantity must be more than 0` });
      built.push({ variantId: null, ledgerId: led.id, description: l.description || led.name, hsnCode: l.hsnCode || null, qty: l.qty ?? null, unit: l.unit || null, rate: round2(l.rate), discPct, gstRate: l.gstRate ?? 0 });
    }
  }

  const gst = computeGst(supplier.stateCode, settings.stateCode, built.map((b) => ({ qty: b.qty ?? 1, rate: b.rate, discPct: b.discPct, hsn: b.hsnCode ?? '', gstRate: b.gstRate })));
  const inter = gst.taxType === 'INTER_STATE';
  let total = gst.total;
  let roundOff = gst.roundOff;
  if (input.billTotal != null) {
    roundOff = round2(input.billTotal - gst.taxable - gst.totalTax);
    if (Math.abs(roundOff) > 1) throw new TRPCError({ code: 'BAD_REQUEST', message: `The bill total ₹${input.billTotal} differs from items + GST (₹${round2(gst.taxable + gst.totalTax)}) by ₹${roundOff}; check the rates and GST` });
    total = round2(input.billTotal);
  }
  const number = await nextDocNumber(tx, 'PURCHASE_BILL', input.billDate);
  const bill = await tx.purchaseBill.create({
    data: {
      number, supplierId: supplier.id, billNo, billDate: dayToDate(input.billDate)!,
      dueDate: dayToDate(input.dueDate ?? addDays(input.billDate, supplier.paymentTermsDays))!, grnId: input.grnId ?? null,
      taxType: gst.taxType, taxableTotal: gst.taxable, cgstTotal: gst.cgst, sgstTotal: gst.sgst, igstTotal: gst.igst, roundOff, grandTotal: total,
      note: input.note ?? null, createdById: actor.id,
      lines: { create: built.map((b, i) => {
        const amount = gst.lines[i]!.amount;
        return {
          sl: i + 1, variantId: b.variantId, ledgerId: b.ledgerId, description: b.description, hsnCode: b.hsnCode, qty: b.qty, unit: b.unit,
          rate: b.rate, discPct: b.discPct, amount, gstRate: b.gstRate,
          cgstAmount: inter ? 0 : round2((amount * b.gstRate) / 200), sgstAmount: inter ? 0 : round2((amount * b.gstRate) / 200), igstAmount: inter ? round2((amount * b.gstRate) / 100) : 0,
        };
      }) },
    },
  });
  await postPurchaseBill(tx, bill.id);
  await logActivity(tx, { actorId: actor.id, action: 'purchase_bill.create', entityType: 'PurchaseBill', entityId: bill.id, ip, summary: `Purchase bill ${number}: ${supplier.name} bill ${billNo}, ₹${total}` });
  return { id: bill.id, number, total };
}

/** Bills are never deleted: cancel with a reason (its Purchase voucher is marked cancelled). */
export async function cancelPurchaseBill(tx: Tx, id: string, reason: string, actor: { id: string }, ip?: string | null) {
  const b = await tx.purchaseBill.findUnique({ where: { id }, include: { allocations: true } });
  if (!b) throw new TRPCError({ code: 'NOT_FOUND' });
  if (b.status === 'CANCELLED') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already cancelled' });
  if (b.allocations.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Payments are applied to this bill; remove them first' });
  await tx.purchaseBill.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date() } });
  await postPurchaseBill(tx, id);
  await logActivity(tx, { actorId: actor.id, action: 'purchase_bill.cancel', entityType: 'PurchaseBill', entityId: id, ip, summary: `Cancelled ${b.number} (bill ${b.billNo}): ${reason}` });
  return { ok: true };
}

/** What is still to pay on a bill. */
export const billDue = (b: { grandTotal: unknown; amountPaid: unknown }) => round2(num(b.grandTotal as never) - num(b.amountPaid as never));

export interface SupplierPaymentInput {
  supplierId: string;
  date: string;
  amount: number;
  mode: PaymentMode;
  /** Cash / bank ledger paid from; default Cash for cash, else the default bank. */
  ledgerId?: string | null;
  reference?: string | null;
  note?: string | null;
  allocations?: { billId: string; amount: number }[];
  autoAllocate?: boolean;
}

/** Money paid to a supplier: applied to bills (chosen, or oldest due first); the rest stays on account. */
export async function createSupplierPayment(tx: Tx, input: SupplierPaymentInput, actor: { id: string }, ip?: string | null) {
  const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new TRPCError({ code: 'NOT_FOUND', message: 'Supplier not found' });
  const ledgerId = input.ledgerId ? (await requireCashBankLedger(tx, input.ledgerId)).id : await defaultMoneyLedgerId(tx, input.mode);
  let allocations = (input.allocations ?? []).filter((a) => a.amount > 0);
  if (input.autoAllocate) {
    const open = await tx.purchaseBill.findMany({ where: { supplierId: supplier.id, status: 'ISSUED' }, orderBy: [{ dueDate: 'asc' }, { billDate: 'asc' }] });
    allocations = [];
    let left = input.amount;
    for (const b of open) {
      const due = billDue(b);
      if (left <= 0) break;
      if (due <= 0) continue;
      const take = round2(Math.min(due, left));
      allocations.push({ billId: b.id, amount: take });
      left = round2(left - take);
    }
  }
  const allocated = round2(allocations.reduce((t, a) => t + a.amount, 0));
  if (allocated > input.amount + 0.001) throw new TRPCError({ code: 'BAD_REQUEST', message: `Allocated ₹${allocated} is more than the ₹${input.amount} paid` });
  const number = await nextDocNumber(tx, 'PAYMENT_VOUCHER', input.date);
  const p = await tx.supplierPayment.create({
    data: { number, supplierId: supplier.id, date: dayToDate(input.date)!, amount: input.amount, mode: input.mode, ledgerId, reference: input.reference ?? null, note: input.note ?? null, createdById: actor.id },
  });
  for (const a of allocations) {
    const b = await tx.purchaseBill.findUnique({ where: { id: a.billId } });
    if (!b || b.supplierId !== supplier.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'That bill belongs to another supplier' });
    if (b.status === 'CANCELLED') throw new TRPCError({ code: 'BAD_REQUEST', message: `${b.number} is cancelled` });
    if (a.amount > billDue(b) + 0.001) throw new TRPCError({ code: 'BAD_REQUEST', message: `Only ₹${billDue(b)} is due on bill ${b.billNo}` });
    await tx.supplierPaymentAllocation.create({ data: { paymentId: p.id, billId: b.id, amount: a.amount } });
    await tx.purchaseBill.update({ where: { id: b.id }, data: { amountPaid: { increment: a.amount } } });
  }
  await postSupplierPayment(tx, p.id);
  await logActivity(tx, { actorId: actor.id, action: 'supplier_payment.create', entityType: 'SupplierPayment', entityId: p.id, ip, summary: `${number}: ₹${input.amount} to ${supplier.name} by ${input.mode}${allocated < input.amount ? ` (₹${round2(input.amount - allocated)} on account)` : ''}` });
  return { id: p.id, number, allocated, onAccount: round2(input.amount - allocated) };
}

