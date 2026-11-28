import { TRPCError } from '@trpc/server';
import {
  ACCOUNT_GROUPS, accountGroup, creditPart, debitPart, financialYear, financialYearRange, istDateString, openingDifferenceLine, primaryGroupOf, round2,
  VOUCHER_TYPE_LABEL, type VoucherType,
} from '@kush/core';
import type { Db } from '@kush/db';
import { dayToDate, isoDay, num } from '../num';
import { getSettings } from '../settings';

/** Default start of a report: the books start date, else 1 April of this financial year. */
export async function booksStart(db: Db) {
  const s = await getSettings(db);
  return isoDay(s.booksFrom) ?? financialYearRange(financialYear(istDateString())).start;
}

const live = { cancelled: false };

/**
 * A ledger account the way Tally prints it: opening balance, then each voucher with "To" (debit)
 * or "By" (credit) and the other side's ledger, a running balance, and the closing balance.
 * Balances are signed: + Dr, − Cr. When the other side has several ledgers, the largest is shown
 * and the rest are in `details`.
 */
export async function ledgerReport(db: Db, ledgerId: string, opts: { from?: string | null; to?: string | null } = {}) {
  const ledger = await db.ledger.findUnique({ where: { id: ledgerId } });
  if (!ledger) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ledger not found' });
  const from = opts.from || (await booksStart(db));
  const to = opts.to || istDateString();
  const before = await db.voucherEntry.aggregate({ where: { ledgerId, voucher: { ...live, date: { lt: dayToDate(from)! } } }, _sum: { amount: true } });
  const opening = round2(num(ledger.openingBalance) + num(before._sum.amount));
  const entries = await db.voucherEntry.findMany({
    where: { ledgerId, voucher: { ...live, date: { gte: dayToDate(from)!, lte: dayToDate(to)! } } },
    include: { voucher: { select: { id: true, type: true, number: true, date: true, narration: true, sourceType: true, sourceId: true } } },
    orderBy: [{ voucher: { date: 'asc' } }, { voucher: { createdAt: 'asc' } }, { sl: 'asc' }],
  });
  const others = await db.voucherEntry.findMany({
    where: { voucherId: { in: [...new Set(entries.map((e) => e.voucherId))] }, ledgerId: { not: ledgerId } },
    select: { voucherId: true, amount: true, ledger: { select: { id: true, name: true } } },
  });
  let bal = opening;
  let totalDr = 0;
  let totalCr = 0;
  const rows = entries.map((e) => {
    const amount = num(e.amount);
    const opposite = others
      .filter((o) => o.voucherId === e.voucherId && Math.sign(num(o.amount)) === -Math.sign(amount))
      .map((o) => ({ ledgerId: o.ledger.id, ledger: o.ledger.name, amount: num(o.amount) }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    bal = round2(bal + amount);
    totalDr = round2(totalDr + debitPart(amount));
    totalCr = round2(totalCr + creditPart(amount));
    return {
      date: isoDay(e.voucher.date)!, voucherId: e.voucher.id, particulars: `${amount >= 0 ? 'To' : 'By'} ${opposite[0]?.ledger ?? '(this ledger)'}`,
      details: opposite.length > 1 ? opposite : [], vchType: VOUCHER_TYPE_LABEL[e.voucher.type], type: e.voucher.type, vchNo: e.voucher.number,
      narration: e.voucher.narration, billRef: e.billRef, debit: debitPart(amount), credit: creditPart(amount), balance: bal,
      sourceType: e.voucher.sourceType, sourceId: e.voucher.sourceId,
    };
  });
  return {
    ledger: { id: ledger.id, name: ledger.name, group: ledger.group, groupName: accountGroup(ledger.group)?.name ?? ledger.group, systemKey: ledger.systemKey, customerId: ledger.customerId, supplierId: ledger.supplierId },
    from, to, opening, rows, totals: { debit: totalDr, credit: totalCr }, closing: bal,
  };
}

/** Closing balance (+Dr / −Cr) of every ledger as on a date, opening balance included. */
export async function ledgerBalances(db: Db, asOf?: string | null) {
  const sums = await db.voucherEntry.groupBy({
    by: ['ledgerId'],
    where: { voucher: { ...live, ...(asOf ? { date: { lte: dayToDate(asOf)! } } : {}) } },
    _sum: { amount: true },
  });
  return new Map(sums.map((s) => [s.ledgerId, num(s._sum.amount)]));
}

/**
 * Trial balance as on a date: each group (sub-groups under their primary group) with its net
 * closing balance and the ledgers in it. Totals add up the primary groups, as Tally does, plus a
 * "Difference in opening balances" line when the opening balances entered don't net to zero.
 */
export async function trialBalance(db: Db, opts: { asOf?: string | null } = {}) {
  const asOf = opts.asOf || istDateString();
  const [ledgers, sums] = await Promise.all([
    db.ledger.findMany({ select: { id: true, name: true, group: true, openingBalance: true }, orderBy: { name: 'asc' } }),
    ledgerBalances(db, asOf),
  ]);
  const own = new Map<string, { id: string; name: string; closing: number; debit: number; credit: number }[]>();
  let openingTotal = 0;
  for (const l of ledgers) {
    openingTotal = round2(openingTotal + num(l.openingBalance));
    const closing = round2(num(l.openingBalance) + (sums.get(l.id) ?? 0));
    if (closing === 0) continue;
    const g = accountGroup(l.group) ? l.group : 'SUSPENSE';
    own.set(g, [...(own.get(g) ?? []), { id: l.id, name: l.name, closing, debit: debitPart(closing), credit: creditPart(closing) }]);
  }
  const net = (key: string): number => {
    const mine = (own.get(key) ?? []).reduce((t, l) => t + l.closing, 0);
    const kids = ACCOUNT_GROUPS.filter((g) => g.parent === key).reduce((t, g) => t + net(g.key), 0);
    return round2(mine + kids);
  };
  const groups = ACCOUNT_GROUPS
    .map((g) => {
      const n = net(g.key);
      return { key: g.key, name: g.name, nature: g.nature, parent: g.parent, closing: n, debit: debitPart(n), credit: creditPart(n), ledgers: own.get(g.key) ?? [] };
    })
    .filter((g) => g.closing !== 0 || g.ledgers.length);
  const primary = groups.filter((g) => primaryGroupOf(g.key) === g.key);
  const diff = openingTotal !== 0 ? openingDifferenceLine(openingTotal) : null;
  const totals = {
    debit: round2(primary.reduce((t, g) => t + g.debit, 0) + (diff?.debit ?? 0)),
    credit: round2(primary.reduce((t, g) => t + g.credit, 0) + (diff?.credit ?? 0)),
  };
  return { asOf, groups, openingDifference: diff, totals };
}

/**
 * Day book: every voucher in a date range (cancelled ones flagged, with no amount), oldest first.
 * Particulars is the party (or main) ledger, with its own debit or credit in the voucher.
 */
export async function dayBook(db: Db, opts: { from?: string | null; to?: string | null; type?: VoucherType | null; ledgerId?: string | null; limit?: number } = {}) {
  const to = opts.to || istDateString();
  const from = opts.from || to;
  const vouchers = await db.voucher.findMany({
    where: {
      date: { gte: dayToDate(from)!, lte: dayToDate(to)! }, ...(opts.type ? { type: opts.type } : {}),
      ...(opts.ledgerId ? { entries: { some: { ledgerId: opts.ledgerId } } } : {}),
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    take: opts.limit ?? 500,
    include: { entries: { select: { amount: true, ledger: { select: { id: true, name: true } } }, orderBy: { sl: 'asc' } } },
  });
  return {
    from, to,
    rows: vouchers.map((v) => {
      const pick = v.entries.find((e) => e.ledger.id === v.partyLedgerId) ?? [...v.entries].sort((a, b) => Math.abs(num(b.amount)) - Math.abs(num(a.amount)))[0];
      const mine = pick ? v.entries.filter((e) => e.ledger.id === pick.ledger.id).reduce((t, e) => t + num(e.amount), 0) : 0;
      return {
        id: v.id, date: isoDay(v.date)!, type: v.type, vchType: VOUCHER_TYPE_LABEL[v.type], number: v.number, particulars: pick?.ledger.name ?? '', narration: v.narration,
        amount: num(v.amount), debit: v.cancelled ? 0 : debitPart(mine), credit: v.cancelled ? 0 : creditPart(mine), cancelled: v.cancelled,
        sourceType: v.sourceType, sourceId: v.sourceId, manual: !v.sourceType,
      };
    }),
  };
}
