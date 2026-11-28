/**
 * Bring the books up to date with the documents (idempotent; safe to run at every start):
 * system ledgers, a ledger per customer and supplier, the books start date, debit note values on
 * old supplier returns, and a voucher for every document that has none yet. Documents created by
 * the app post themselves; this catches data from before accounts existed (and demo data).
 */
import { financialYear, financialYearRange, istDateString } from '@kush/core';
import { Prisma, type PrismaClient, type Tx } from '@kush/db';
import { dayToDate, isoDay } from '../num';
import { getSettings } from '../settings';
import { valueSupplierReturn } from '../supplier-returns';
import { ensureSystemLedgers, ledgerForCustomer, ledgerForSupplier } from './ledgers';
import { postCreditNote, postDebitNote, postInvoice, postPurchaseBill, postReceipt, postSupplierPayment, type VoucherSource } from './posting';

type Poster = (tx: Tx, id: string) => Promise<unknown>;
const SOURCES: { table: string; source: VoucherSource; date: string; post: Poster; extra?: string }[] = [
  { table: 'Invoice', source: 'Invoice', date: 'date', post: postInvoice },
  { table: 'CreditNote', source: 'CreditNote', date: 'date', post: postCreditNote },
  { table: 'Payment', source: 'Payment', date: 'date', post: postReceipt },
  { table: 'PurchaseBill', source: 'PurchaseBill', date: 'billDate', post: postPurchaseBill },
  { table: 'SupplierReturn', source: 'SupplierReturn', date: 'date', post: postDebitNote, extra: 'AND t."grandTotal" <> 0' },
  { table: 'SupplierPayment', source: 'SupplierPayment', date: 'date', post: postSupplierPayment },
];

export async function syncAccounts(db: PrismaClient) {
  const ledgersBefore = await db.ledger.count();
  await ensureSystemLedgers(db);
  for (const c of await db.customer.findMany({ where: { ledger: null }, select: { id: true }, orderBy: { createdAt: 'asc' } })) await ledgerForCustomer(db, c.id);
  for (const s of await db.supplier.findMany({ where: { ledger: null }, select: { id: true }, orderBy: { createdAt: 'asc' } })) await ledgerForSupplier(db, s.id);

  // Opening balances are as on 1 April of the year the first sale or receipt of goods falls in.
  const settings = await getSettings(db);
  let booksFrom = isoDay(settings.booksFrom);
  if (!booksFrom) {
    const [inv, grn] = await Promise.all([
      db.invoice.findFirst({ orderBy: { date: 'asc' }, select: { date: true } }),
      db.grn.findFirst({ orderBy: { date: 'asc' }, select: { date: true } }),
    ]);
    const first = [isoDay(inv?.date), isoDay(grn?.date)].filter((d): d is string => !!d).sort()[0] ?? istDateString();
    booksFrom = financialYearRange(financialYear(first)).start;
    await db.companySettings.update({ where: { id: 'company' }, data: { booksFrom: dayToDate(booksFrom) } });
  }

  let supplierReturnsValued = 0;
  for (const r of await db.supplierReturn.findMany({ where: { grandTotal: 0 }, select: { id: true } })) {
    const g = await db.$transaction((tx) => valueSupplierReturn(tx, r.id));
    if (g.total !== 0) supplierReturnsValued++;
  }

  // One transaction per document: a document that can't post is reported and the rest still post.
  const posted: Record<VoucherSource, number> = { Invoice: 0, CreditNote: 0, Payment: 0, PurchaseBill: 0, SupplierReturn: 0, SupplierPayment: 0 };
  const errors: { source: VoucherSource; id: string; message: string }[] = [];
  for (const s of SOURCES) {
    const ids = await db.$queryRaw<{ id: string }[]>`
      SELECT t."id" FROM ${Prisma.raw(`"${s.table}"`)} t
      WHERE NOT EXISTS (SELECT 1 FROM "Voucher" v WHERE v."sourceType" = ${s.source} AND v."sourceId" = t."id") ${Prisma.raw(s.extra ?? '')}
      ORDER BY t.${Prisma.raw(`"${s.date}"`)}, t."createdAt"`;
    for (const { id } of ids) {
      try {
        await db.$transaction((tx) => s.post(tx, id), { timeout: 30_000 });
        posted[s.source]++;
      } catch (e) {
        errors.push({ source: s.source, id, message: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  return { booksFrom, ledgersCreated: (await db.ledger.count()) - ledgersBefore, supplierReturnsValued, posted, errors };
}

/** One line for logs (seeds, app start). */
export function describeSync(r: Awaited<ReturnType<typeof syncAccounts>>) {
  const n = Object.values(r.posted).reduce((t, x) => t + x, 0);
  const fails = r.errors.map((e) => `\n  ${e.source} ${e.id} not posted: ${e.message}`).join('');
  return `Accounts: books from ${r.booksFrom}, ${r.ledgersCreated} ledger(s) created, ${n} voucher(s) posted${r.errors.length ? `, ${r.errors.length} failed:${fails}` : '.'}`;
}
