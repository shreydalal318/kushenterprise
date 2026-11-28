import { TRPCError } from '@trpc/server';
import { isCashBankGroup, purchaseLedgerKey, salesLedgerKey, SYSTEM_LEDGERS, systemLedgerDef } from '@kush/core';
import type { Db, Ledger, PaymentMode } from '@kush/db';
import { num } from '../num';
import { getSettings } from '../settings';

const isPlaceholder = (s: string | null | undefined) => !s || /^\[.*\]$/.test(s.trim());

/**
 * A ledger name nobody uses yet (Tally names are unique, ignoring case): the name itself, then
 * "Name (CUST-0004)" when a suffix is given, then "(2)", "(3)"...
 */
export async function uniqueLedgerName(db: Db, base: string, suffix?: string | null, exceptId?: string) {
  const taken = async (name: string) =>
    !!(await db.ledger.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } }));
  const first = base.trim();
  if (!(await taken(first))) return first;
  const withSuffix = suffix ? `${first} (${suffix})` : first;
  if (suffix && !(await taken(withSuffix))) return withSuffix;
  for (let i = 2; ; i++) if (!(await taken(`${withSuffix} (${i})`))) return `${withSuffix} (${i})`;
}

/**
 * Ledger ids for system keys (CASH, OUTPUT_CGST, SALES_5...), creating any that don't exist yet.
 * Upsert on the unique key, so two documents posting at the same moment don't both create one.
 */
export async function systemLedgerIds(db: Db, keys: readonly string[]): Promise<Map<string, string>> {
  const want = [...new Set(keys)];
  const have = await db.ledger.findMany({ where: { systemKey: { in: want } }, select: { id: true, systemKey: true } });
  const out = new Map(have.map((l) => [l.systemKey!, l.id]));
  for (const key of want) {
    if (out.has(key)) continue;
    const def = systemLedgerDef(key);
    if (!def) throw new Error(`Unknown system ledger "${key}"`);
    // The default bank starts with the bank details already in Settings.
    const bank = key === 'BANK' ? await getSettings(db) : null;
    const l = await db.ledger.upsert({
      where: { systemKey: key },
      create: {
        systemKey: key, name: await uniqueLedgerName(db, def.name), group: def.group,
        bankAccountNo: bank && !isPlaceholder(bank.bankAccountNo) ? bank.bankAccountNo : null,
        bankIfsc: bank && !isPlaceholder(bank.bankIfsc) ? bank.bankIfsc : null,
      },
      update: {},
      select: { id: true },
    });
    out.set(key, l.id);
  }
  return out;
}

export const systemLedgerId = async (db: Db, key: string) => (await systemLedgerIds(db, [key])).get(key)!;
export const salesLedger = (db: Db, rate: number) => systemLedgerId(db, salesLedgerKey(rate));
export const purchaseLedger = (db: Db, rate: number) => systemLedgerId(db, purchaseLedgerKey(rate));

/** Cash, bank, round off, GST and returns ledgers, plus sales / purchase ledgers for each GST rate in Settings. */
export async function ensureSystemLedgers(db: Db) {
  const s = await getSettings(db);
  const rates = s.gstRates.map((r) => num(r));
  return systemLedgerIds(db, [...Object.keys(SYSTEM_LEDGERS), ...rates.map(salesLedgerKey), ...rates.map(purchaseLedgerKey)]);
}

/** The customer's Sundry Debtors ledger, created on first use under the customer's name. */
export async function ledgerForCustomer(db: Db, customerId: string): Promise<Ledger> {
  const l = await db.ledger.findUnique({ where: { customerId } });
  if (l) return l;
  const c = await db.customer.findUnique({ where: { id: customerId }, select: { name: true, code: true } });
  if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
  return db.ledger.upsert({ where: { customerId }, create: { customerId, name: await uniqueLedgerName(db, c.name, c.code), group: 'SUNDRY_DEBTORS' }, update: {} });
}

/** The supplier's Sundry Creditors ledger, created on first use under the supplier's name. */
export async function ledgerForSupplier(db: Db, supplierId: string): Promise<Ledger> {
  const l = await db.ledger.findUnique({ where: { supplierId } });
  if (l) return l;
  const s = await db.supplier.findUnique({ where: { id: supplierId }, select: { name: true, code: true } });
  if (!s) throw new TRPCError({ code: 'NOT_FOUND', message: 'Supplier not found' });
  return db.ledger.upsert({ where: { supplierId }, create: { supplierId, name: await uniqueLedgerName(db, s.name, s.code), group: 'SUNDRY_CREDITORS' }, update: {} });
}

/** Party ledgers carry the party's name: call after a customer or supplier is renamed. */
export async function renamePartyLedger(db: Db, party: { customerId: string } | { supplierId: string }) {
  const l = await db.ledger.findUnique({ where: 'customerId' in party ? { customerId: party.customerId } : { supplierId: party.supplierId } });
  if (!l) return;
  const p = 'customerId' in party
    ? await db.customer.findUnique({ where: { id: party.customerId }, select: { name: true, code: true } })
    : await db.supplier.findUnique({ where: { id: party.supplierId }, select: { name: true, code: true } });
  if (!p || l.name === p.name.trim()) return;
  await db.ledger.update({ where: { id: l.id }, data: { name: await uniqueLedgerName(db, p.name, p.code, l.id) } });
}

/** Where money goes when no ledger is chosen: Cash for cash, the default bank for everything else. */
export const defaultMoneyLedgerId = (db: Db, mode: PaymentMode) => systemLedgerId(db, mode === 'CASH' ? 'CASH' : 'BANK');

/** A cash or bank ledger the user picked for a receipt or payment. */
export async function requireCashBankLedger(db: Db, ledgerId: string) {
  const l = await db.ledger.findUnique({ where: { id: ledgerId } });
  if (!l || !l.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose an active cash or bank ledger' });
  if (!isCashBankGroup(l.group)) throw new TRPCError({ code: 'BAD_REQUEST', message: `${l.name} is not a cash or bank ledger` });
  return l;
}
