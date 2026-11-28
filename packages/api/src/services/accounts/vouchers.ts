import { TRPCError } from '@trpc/server';
import { entriesTotal, formatINR, isCashBankGroup, round2, voucherAmount, VOUCHER_TYPE_LABEL, type DocType, type ManualVoucherType } from '@kush/core';
import type { Tx } from '@kush/db';
import { logActivity } from '../activity';
import { dayToDate } from '../num';
import { nextDocNumber } from '../numbering';

export interface ManualVoucherInput {
  type: ManualVoucherType;
  date: string;
  narration?: string | null;
  /** + Debit, − Credit. */
  entries: { ledgerId: string; amount: number }[];
}

/** Manual receipts share the customer receipt series, so receipt numbers never repeat. */
const SERIES: Record<ManualVoucherType, DocType> = { PAYMENT: 'PAYMENT_VOUCHER', RECEIPT: 'PAYMENT_RECEIPT', CONTRA: 'CONTRA_VOUCHER', JOURNAL: 'JOURNAL_VOUCHER' };

const bad = (message: string) => new TRPCError({ code: 'BAD_REQUEST', message });

/**
 * A Payment, Receipt, Contra or Journal entered by hand, checked the way Tally checks it:
 * at least two lines that balance; Payment credits only cash / bank; Receipt debits only cash / bank;
 * Contra moves money only between cash and bank; Journal never touches cash or bank.
 * Customer receipts and supplier payments have their own screens (they settle invoices and bills),
 * so a manual Receipt can't credit a customer and a manual Payment can't debit a supplier;
 * refunds the other way round are fine.
 */
export async function createManualVoucher(tx: Tx, input: ManualVoucherInput, actor: { id: string }, ip?: string | null) {
  const entries = input.entries.map((e) => ({ ledgerId: e.ledgerId, amount: round2(e.amount) })).filter((e) => e.amount !== 0);
  if (entries.length < 2 || !entries.some((e) => e.amount > 0) || !entries.some((e) => e.amount < 0)) throw bad('A voucher needs at least one debit and one credit line');
  const diff = entriesTotal(entries);
  if (diff !== 0) throw bad(`Debits ₹${formatINR(voucherAmount(entries))} and credits ₹${formatINR(round2(voucherAmount(entries) - diff))} must be equal`);

  const ledgers = new Map((await tx.ledger.findMany({ where: { id: { in: entries.map((e) => e.ledgerId) } } })).map((l) => [l.id, l]));
  for (const e of entries) {
    const l = ledgers.get(e.ledgerId);
    if (!l) throw bad('Ledger not found');
    if (!l.isActive) throw bad(`${l.name} is inactive`);
  }
  const lines = entries.map((e) => ({ ...e, ledger: ledgers.get(e.ledgerId)!, cash: isCashBankGroup(ledgers.get(e.ledgerId)!.group) }));
  const label = VOUCHER_TYPE_LABEL[input.type];
  const notCash = (side: typeof lines) => side.find((l) => !l.cash)?.ledger.name;
  if (input.type === 'PAYMENT') {
    const x = notCash(lines.filter((l) => l.amount < 0));
    if (x) throw bad(`A payment goes out of cash or a bank: only cash / bank ledgers can be credited (${x} is not)`);
    if (lines.some((l) => l.amount > 0 && l.ledger.supplierId)) throw bad('Record payments to suppliers under Supplier payments, so their bills are marked paid');
  } else if (input.type === 'RECEIPT') {
    const x = notCash(lines.filter((l) => l.amount > 0));
    if (x) throw bad(`A receipt comes into cash or a bank: only cash / bank ledgers can be debited (${x} is not)`);
    if (lines.some((l) => l.amount < 0 && l.ledger.customerId)) throw bad('Record money from customers under Payments, so their invoices are marked paid');
  } else if (input.type === 'CONTRA') {
    const x = notCash(lines);
    if (x) throw bad(`A contra only moves money between cash and bank ledgers (${x} is not one)`);
  } else {
    const x = lines.find((l) => l.cash)?.ledger.name;
    if (x) throw bad(`A journal can't touch cash or bank (${x}); use a Payment, Receipt or Contra`);
  }

  // The ledger shown in lists: for a payment what it was paid for, for a receipt who paid, else the biggest debit.
  const side = input.type === 'RECEIPT' ? lines.filter((l) => l.amount < 0) : lines.filter((l) => l.amount > 0 && (input.type === 'CONTRA' || !l.cash));
  const main = [...side].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0] ?? null;
  const number = await nextDocNumber(tx, SERIES[input.type], input.date);
  const v = await tx.voucher.create({
    data: {
      type: input.type, number, date: dayToDate(input.date)!, narration: input.narration ?? null, partyLedgerId: main?.ledgerId ?? null,
      amount: voucherAmount(entries), createdById: actor.id,
      entries: { create: entries.map((e, i) => ({ ledgerId: e.ledgerId, amount: e.amount, sl: i + 1 })) },
    },
  });
  await logActivity(tx, { actorId: actor.id, action: 'voucher.create', entityType: 'Voucher', entityId: v.id, ip, summary: `${label} ${number}: ₹${formatINR(voucherAmount(entries))}${main ? ` (${main.ledger.name})` : ''}` });
  return { id: v.id, number };
}

/** Owner only. Vouchers posted from a document change only through that document. */
export async function cancelManualVoucher(tx: Tx, id: string, reason: string, actor: { id: string }, ip?: string | null) {
  const v = await tx.voucher.findUnique({ where: { id } });
  if (!v) throw new TRPCError({ code: 'NOT_FOUND' });
  if (v.sourceType) throw bad(`${VOUCHER_TYPE_LABEL[v.type]} ${v.number} comes from its ${v.sourceType.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}; cancel or change that instead`);
  if (v.cancelled) throw bad('Already cancelled');
  await tx.voucher.update({ where: { id }, data: { cancelled: true, cancelReason: reason, cancelledAt: new Date() } });
  await logActivity(tx, { actorId: actor.id, action: 'voucher.cancel', entityType: 'Voucher', entityId: id, ip, summary: `Cancelled ${VOUCHER_TYPE_LABEL[v.type]} ${v.number}: ${reason}` });
  return { ok: true };
}
