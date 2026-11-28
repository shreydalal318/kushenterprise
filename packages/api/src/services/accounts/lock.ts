import { TRPCError } from '@trpc/server';
import { tallyDate } from '@kush/core';
import type { Db, Tx } from '@kush/db';
import { isoDay } from '../num';

/** The last locked day (YYYY-MM-DD), or null when the books are open. */
export async function booksLockedUntil(db: Db | Tx): Promise<string | null> {
  const s = await db.companySettings.findUnique({ where: { id: 'company' }, select: { booksLockedUntil: true } });
  return isoDay(s?.booksLockedUntil ?? null);
}

/**
 * Period lock: once a month's GST is filed the owner locks the books up to that date, and nothing dated on
 * or before it can be entered, cancelled or deleted (invoices, credit notes, receipts, bills, payments,
 * returns, vouchers, opening balances). Call it in every write path with the document's own date.
 */
export async function assertOpenPeriod(db: Db | Tx, date: string | Date, what = 'This entry') {
  const lock = await booksLockedUntil(db);
  if (!lock) return;
  const day = typeof date === 'string' ? date.slice(0, 10) : isoDay(date)!;
  if (day <= lock) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `The books are locked up to ${tallyDate(lock)}. ${what} dated ${tallyDate(day)} can't be entered or changed. Ask the owner to unlock that period.` });
  }
}
