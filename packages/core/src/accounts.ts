/**
 * Accounting rules shared by the API (posting, reports) and the screens: Tally's groups, voucher
 * types, the ledgers the app creates itself, and the exact entries each GST document posts.
 * Sign convention everywhere: amount > 0 is a Debit, amount < 0 is a Credit; a voucher sums to zero.
 */
import { round2 } from './money';

export type AccountNature = 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE';

export interface AccountGroupDef {
  key: string;
  /** Tally's name, so an accountant finds the group where they expect it. */
  name: string;
  nature: AccountNature;
  /** Sub-groups sit under a primary group (Sundry Debtors under Current Assets). */
  parent: string | null;
  /** Affects gross profit (trading account) rather than net profit only. */
  direct: boolean;
}

/** Tally's predefined groups that this business uses. Keys are stored on Ledger.group. */
export const ACCOUNT_GROUPS = [
  { key: 'CAPITAL', name: 'Capital Account', nature: 'LIABILITY', parent: null, direct: false },
  { key: 'LOANS_LIABILITY', name: 'Loans (Liability)', nature: 'LIABILITY', parent: null, direct: false },
  { key: 'CURRENT_LIABILITIES', name: 'Current Liabilities', nature: 'LIABILITY', parent: null, direct: false },
  { key: 'DUTIES_TAXES', name: 'Duties & Taxes', nature: 'LIABILITY', parent: 'CURRENT_LIABILITIES', direct: false },
  { key: 'PROVISIONS', name: 'Provisions', nature: 'LIABILITY', parent: 'CURRENT_LIABILITIES', direct: false },
  { key: 'SUNDRY_CREDITORS', name: 'Sundry Creditors', nature: 'LIABILITY', parent: 'CURRENT_LIABILITIES', direct: false },
  { key: 'FIXED_ASSETS', name: 'Fixed Assets', nature: 'ASSET', parent: null, direct: false },
  { key: 'INVESTMENTS', name: 'Investments', nature: 'ASSET', parent: null, direct: false },
  { key: 'CURRENT_ASSETS', name: 'Current Assets', nature: 'ASSET', parent: null, direct: false },
  { key: 'BANK_ACCOUNTS', name: 'Bank Accounts', nature: 'ASSET', parent: 'CURRENT_ASSETS', direct: false },
  { key: 'CASH_IN_HAND', name: 'Cash-in-Hand', nature: 'ASSET', parent: 'CURRENT_ASSETS', direct: false },
  { key: 'DEPOSITS', name: 'Deposits (Asset)', nature: 'ASSET', parent: 'CURRENT_ASSETS', direct: false },
  { key: 'LOANS_ADVANCES', name: 'Loans & Advances (Asset)', nature: 'ASSET', parent: 'CURRENT_ASSETS', direct: false },
  { key: 'STOCK_IN_HAND', name: 'Stock-in-Hand', nature: 'ASSET', parent: 'CURRENT_ASSETS', direct: false },
  { key: 'SUNDRY_DEBTORS', name: 'Sundry Debtors', nature: 'ASSET', parent: 'CURRENT_ASSETS', direct: false },
  // Tally keeps Suspense as a liability-natured primary group.
  { key: 'SUSPENSE', name: 'Suspense A/c', nature: 'LIABILITY', parent: null, direct: false },
  { key: 'SALES', name: 'Sales Accounts', nature: 'INCOME', parent: null, direct: true },
  { key: 'PURCHASE', name: 'Purchase Accounts', nature: 'EXPENSE', parent: null, direct: true },
  { key: 'DIRECT_INCOMES', name: 'Direct Incomes', nature: 'INCOME', parent: null, direct: true },
  { key: 'INDIRECT_INCOMES', name: 'Indirect Incomes', nature: 'INCOME', parent: null, direct: false },
  { key: 'DIRECT_EXPENSES', name: 'Direct Expenses', nature: 'EXPENSE', parent: null, direct: true },
  { key: 'INDIRECT_EXPENSES', name: 'Indirect Expenses', nature: 'EXPENSE', parent: null, direct: false },
] as const satisfies readonly AccountGroupDef[];

export type AccountGroupKey = (typeof ACCOUNT_GROUPS)[number]['key'];
export const ACCOUNT_GROUP_KEYS = ACCOUNT_GROUPS.map((g) => g.key) as AccountGroupKey[];

const GROUP_BY_KEY = new Map<string, AccountGroupDef>(ACCOUNT_GROUPS.map((g) => [g.key, g]));
export const isAccountGroupKey = (k: string): k is AccountGroupKey => GROUP_BY_KEY.has(k);
export const accountGroup = (k: string): AccountGroupDef | undefined => GROUP_BY_KEY.get(k);
/** The primary group a (sub-)group rolls up to. */
export const primaryGroupOf = (k: string): string => {
  const g = GROUP_BY_KEY.get(k);
  return g?.parent ?? k;
};

/** Cash and bank ledgers are the only ones a Payment, Receipt or Contra may move money through. */
export const CASH_BANK_GROUPS: readonly string[] = ['CASH_IN_HAND', 'BANK_ACCOUNTS'];
export const isCashBankGroup = (group: string) => CASH_BANK_GROUPS.includes(group);

export const VOUCHER_TYPES = ['SALES', 'CREDIT_NOTE', 'RECEIPT', 'PURCHASE', 'DEBIT_NOTE', 'PAYMENT', 'CONTRA', 'JOURNAL'] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];
export const VOUCHER_TYPE_LABEL: Record<VoucherType, string> = {
  SALES: 'Sales', CREDIT_NOTE: 'Credit Note', RECEIPT: 'Receipt', PURCHASE: 'Purchase',
  DEBIT_NOTE: 'Debit Note', PAYMENT: 'Payment', CONTRA: 'Contra', JOURNAL: 'Journal',
};
/** Vouchers entered by hand; the rest are posted from their source document and change only through it. */
export const MANUAL_VOUCHER_TYPES = ['PAYMENT', 'RECEIPT', 'CONTRA', 'JOURNAL'] as const;
export type ManualVoucherType = (typeof MANUAL_VOUCHER_TYPES)[number];

/** Ledgers the app creates and posts to by key (names can be changed only for cash and bank). */
export const SYSTEM_LEDGERS = {
  CASH: { name: 'Cash', group: 'CASH_IN_HAND' },
  BANK: { name: 'Bank Account', group: 'BANK_ACCOUNTS' }, // the default bank for receipts other than cash
  ROUND_OFF: { name: 'Round Off', group: 'INDIRECT_EXPENSES' },
  OUTPUT_CGST: { name: 'Output CGST', group: 'DUTIES_TAXES' },
  OUTPUT_SGST: { name: 'Output SGST', group: 'DUTIES_TAXES' },
  OUTPUT_IGST: { name: 'Output IGST', group: 'DUTIES_TAXES' },
  INPUT_CGST: { name: 'Input CGST', group: 'DUTIES_TAXES' },
  INPUT_SGST: { name: 'Input SGST', group: 'DUTIES_TAXES' },
  INPUT_IGST: { name: 'Input IGST', group: 'DUTIES_TAXES' },
  SALES_RETURNS: { name: 'Sales Returns', group: 'SALES' },
  PURCHASE_RETURNS: { name: 'Purchase Returns', group: 'PURCHASE' },
} as const satisfies Record<string, { name: string; group: AccountGroupKey }>;
export type FixedSystemLedgerKey = keyof typeof SYSTEM_LEDGERS;

const rateText = (rate: number) => String(round2(rate));
/** 2.5 → "2_5": GST rate as it appears in a ledger key. */
const rateKey = (rate: number) => rateText(rate).replace('.', '_');
export const salesLedgerKey = (rate: number) => `SALES_${rateKey(rate)}`;
export const purchaseLedgerKey = (rate: number) => `PURCHASE_${rateKey(rate)}`;
export const salesLedgerName = (rate: number) => (round2(rate) === 0 ? 'Sales Exempt' : `Sales GST ${rateText(rate)}%`);
export const purchaseLedgerName = (rate: number) => (round2(rate) === 0 ? 'Purchase Exempt' : `Purchase GST ${rateText(rate)}%`);

/** Name and group for any system key, including the per-rate sales / purchase ledgers. */
export function systemLedgerDef(key: string): { name: string; group: AccountGroupKey } | null {
  if (key in SYSTEM_LEDGERS) return SYSTEM_LEDGERS[key as FixedSystemLedgerKey];
  const m = /^(SALES|PURCHASE)_(\d+(?:_\d+)?)$/.exec(key);
  if (!m) return null;
  const rate = Number(m[2]!.replace('_', '.'));
  return m[1] === 'SALES' ? { name: salesLedgerName(rate), group: 'SALES' } : { name: purchaseLedgerName(rate), group: 'PURCHASE' };
}

// ------------------------------------------------------------------ signs and balance

/** Money in paise, so sums are exact. */
export const toPaise = (n: number) => Math.round(round2(n) * 100);
export const debit = (n: number) => round2(Math.abs(n));
export const credit = (n: number) => -round2(Math.abs(n));
export const debitPart = (amount: number) => (amount > 0 ? round2(amount) : 0);
export const creditPart = (amount: number) => (amount < 0 ? round2(-amount) : 0);
export const sideOf = (amount: number): 'Dr' | 'Cr' => (amount < 0 ? 'Cr' : 'Dr');

/** Sum of signed amounts, exact to the paisa. */
export const entriesTotal = (entries: readonly { amount: number }[]) => entries.reduce((t, e) => t + toPaise(e.amount), 0) / 100;
export const isBalanced = (entries: readonly { amount: number }[]) => entries.reduce((t, e) => t + toPaise(e.amount), 0) === 0;
/** Sum of the debit side (what Tally shows as the voucher amount). */
export const voucherAmount = (entries: readonly { amount: number }[]) => entries.reduce((t, e) => t + Math.max(0, toPaise(e.amount)), 0) / 100;

export function assertBalanced(entries: readonly { amount: number }[], what = 'Voucher') {
  const diff = entriesTotal(entries);
  if (diff !== 0) throw new Error(`${what} does not balance: debits and credits differ by ${diff.toFixed(2)}`);
}

// ------------------------------------------------------------------ GST document postings

/** Where an entry goes: the document's party, a system ledger by key, or a specific ledger. */
export type PostingRef = { kind: 'party' } | { kind: 'system'; key: string } | { kind: 'ledger'; id: string };
export interface PostingLine { ref: PostingRef; amount: number }

export type GstVoucherKind = 'SALES' | 'CREDIT_NOTE' | 'PURCHASE' | 'DEBIT_NOTE';

export interface GstDocumentForPosting {
  /** Taxable value per line with its GST rate; purchase lines may name their own ledger (courier, rent). */
  lines: readonly { gstRate: number; amount: number; ledgerId?: string | null }[];
  cgst: number;
  sgst: number;
  igst: number;
  /** As printed: total − (taxable + tax). */
  roundOff: number;
  total: number;
}

/** Residual paise a voucher may push into Round Off; anything larger means the document is wrong. */
export const MAX_ROUNDING_RESIDUAL = 1;

const sameRef = (a: PostingRef, b: PostingRef) =>
  a.kind === b.kind && (a.kind !== 'system' || a.key === (b as { key: string }).key) && (a.kind !== 'ledger' || a.id === (b as { id: string }).id);

/**
 * Entries for a GST document, the way Tally posts it:
 *  - Sales:       Dr party = total; Cr Sales GST r% per rate; Cr Output CGST+SGST or IGST; Round Off.
 *  - Credit note: the mirror, with a single Sales Returns ledger.
 *  - Purchase:    Dr Purchase GST r% (or the line's own ledger); Dr Input taxes; Cr party = total; Round Off.
 *  - Debit note:  the mirror, with a single Purchase Returns ledger.
 * Round Off takes the printed round-off plus any paise residual up to ₹1, so every voucher balances exactly.
 */
export function gstVoucherEntries(kind: GstVoucherKind, doc: GstDocumentForPosting): PostingLine[] {
  // Sales and debit notes debit the party; credit notes and purchases credit it. Everything else is the opposite side.
  const partySign = kind === 'SALES' || kind === 'DEBIT_NOTE' ? 1 : -1;
  const sales = kind === 'SALES' || kind === 'CREDIT_NOTE';
  const out: PostingLine[] = [{ ref: { kind: 'party' }, amount: partySign * round2(doc.total) }];
  const push = (ref: PostingRef, amount: number) => {
    const a = round2(amount);
    if (a === 0) return;
    const hit = out.find((e) => sameRef(e.ref, ref));
    if (hit) hit.amount = round2(hit.amount + a);
    else out.push({ ref, amount: a });
  };

  // Goods / services: per rate (or per own ledger) for sales and purchases, one returns ledger for notes.
  const byRef = new Map<string, { ref: PostingRef; amount: number }>();
  for (const l of doc.lines) {
    const ref: PostingRef =
      kind === 'SALES' ? { kind: 'system', key: salesLedgerKey(l.gstRate) }
      : kind === 'CREDIT_NOTE' ? { kind: 'system', key: 'SALES_RETURNS' }
      : kind === 'DEBIT_NOTE' ? { kind: 'system', key: 'PURCHASE_RETURNS' }
      : l.ledgerId ? { kind: 'ledger', id: l.ledgerId } : { kind: 'system', key: purchaseLedgerKey(l.gstRate) };
    const k = ref.kind === 'system' ? `s:${ref.key}` : ref.kind === 'ledger' ? `l:${ref.id}` : 'p';
    const cur = byRef.get(k) ?? { ref, amount: 0 };
    cur.amount = round2(cur.amount + l.amount);
    byRef.set(k, cur);
  }
  for (const g of byRef.values()) push(g.ref, -partySign * g.amount);

  const tax = sales ? { c: 'OUTPUT_CGST', s: 'OUTPUT_SGST', i: 'OUTPUT_IGST' } : { c: 'INPUT_CGST', s: 'INPUT_SGST', i: 'INPUT_IGST' };
  push({ kind: 'system', key: tax.c }, -partySign * doc.cgst);
  push({ kind: 'system', key: tax.s }, -partySign * doc.sgst);
  push({ kind: 'system', key: tax.i }, -partySign * doc.igst);
  push({ kind: 'system', key: 'ROUND_OFF' }, -partySign * doc.roundOff);

  const residual = entriesTotal(out);
  if (residual !== 0) {
    if (Math.abs(residual) > MAX_ROUNDING_RESIDUAL) throw new Error(`Document totals do not add up: off by ${residual.toFixed(2)}`);
    push({ kind: 'system', key: 'ROUND_OFF' }, -residual);
  }
  const lines = out.filter((e) => e.amount !== 0);
  assertBalanced(lines);
  return lines;
}

/**
 * Trial balance arithmetic: if the opening balances don't net to zero, Tally shows the gap as
 * "Difference in opening balances" on the short side so the totals still agree.
 */
export function openingDifferenceLine(openingTotal: number): { debit: number; credit: number } {
  const t = round2(openingTotal);
  return t > 0 ? { debit: 0, credit: t } : { debit: round2(-t), credit: 0 };
}
