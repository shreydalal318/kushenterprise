import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_GROUPS, accountGroup, assertBalanced, creditPart, debitPart, entriesTotal, gstVoucherEntries, isBalanced, isCashBankGroup,
  openingDifferenceLine, primaryGroupOf, purchaseLedgerKey, purchaseLedgerName, salesLedgerKey, salesLedgerName, sideOf, systemLedgerDef,
  VOUCHER_TYPE_LABEL, voucherAmount, type PostingLine,
} from '../src/accounts';
import { computeGst } from '../src/gst';
import { DEFAULT_PREFIXES } from '../src/numbering';

const key = (l: PostingLine) => (l.ref.kind === 'party' ? 'PARTY' : l.ref.kind === 'system' ? l.ref.key : `L:${l.ref.id}`);
const asMap = (lines: PostingLine[]) => Object.fromEntries(lines.map((l) => [key(l), l.amount]));

describe('groups, voucher types and system ledgers', () => {
  it('follows Tally: sub-groups roll up, natures and direct flags', () => {
    expect(accountGroup('SUNDRY_DEBTORS')).toMatchObject({ name: 'Sundry Debtors', nature: 'ASSET', parent: 'CURRENT_ASSETS' });
    expect(primaryGroupOf('DUTIES_TAXES')).toBe('CURRENT_LIABILITIES');
    expect(primaryGroupOf('SALES')).toBe('SALES');
    expect(accountGroup('SALES')).toMatchObject({ nature: 'INCOME', direct: true });
    expect(accountGroup('INDIRECT_EXPENSES')).toMatchObject({ nature: 'EXPENSE', direct: false });
    // Every parent is itself a primary group.
    for (const g of ACCOUNT_GROUPS) if (g.parent) expect(accountGroup(g.parent)?.parent).toBeNull();
    expect(isCashBankGroup('BANK_ACCOUNTS')).toBe(true);
    expect(isCashBankGroup('SUNDRY_DEBTORS')).toBe(false);
    expect(VOUCHER_TYPE_LABEL.CREDIT_NOTE).toBe('Credit Note');
    expect(DEFAULT_PREFIXES.PURCHASE_BILL).toBe('KE/PB/');
  });

  it('names per-rate sales and purchase ledgers', () => {
    expect(salesLedgerKey(5)).toBe('SALES_5');
    expect(salesLedgerKey(2.5)).toBe('SALES_2_5');
    expect(salesLedgerName(12)).toBe('Sales GST 12%');
    expect(salesLedgerName(0)).toBe('Sales Exempt');
    expect(purchaseLedgerKey(18)).toBe('PURCHASE_18');
    expect(purchaseLedgerName(0)).toBe('Purchase Exempt');
    expect(systemLedgerDef('SALES_2_5')).toEqual({ name: 'Sales GST 2.5%', group: 'SALES' });
    expect(systemLedgerDef('PURCHASE_0')).toEqual({ name: 'Purchase Exempt', group: 'PURCHASE' });
    expect(systemLedgerDef('OUTPUT_IGST')).toEqual({ name: 'Output IGST', group: 'DUTIES_TAXES' });
    expect(systemLedgerDef('NOPE')).toBeNull();
  });
});

describe('signs and balance', () => {
  it('treats + as Dr and − as Cr, exact to the paisa', () => {
    expect(debitPart(10)).toBe(10);
    expect(creditPart(10)).toBe(0);
    expect(creditPart(-0.1)).toBe(0.1);
    expect(sideOf(-1)).toBe('Cr');
    expect(sideOf(0)).toBe('Dr');
    // 0.1 + 0.2 − 0.3 is not 0 in floating point; in paise it is.
    expect(isBalanced([{ amount: 0.1 }, { amount: 0.2 }, { amount: -0.3 }])).toBe(true);
    expect(entriesTotal([{ amount: 100 }, { amount: -99.99 }])).toBe(0.01);
    expect(voucherAmount([{ amount: 60 }, { amount: 40 }, { amount: -100 }])).toBe(100);
    expect(() => assertBalanced([{ amount: 1 }, { amount: -2 }])).toThrow(/differ by -1.00/);
  });

  it('shows a difference in opening balances on the short side', () => {
    expect(openingDifferenceLine(500)).toEqual({ debit: 0, credit: 500 });
    expect(openingDifferenceLine(-25.5)).toEqual({ debit: 25.5, credit: 0 });
  });
});

describe('GST document postings', () => {
  it('posts an intra-state mixed-rate sales invoice with round off credited', () => {
    // 1 × 110 @ 5% + 1 × 200 @ 12% → 310 + 5.50 + 24.00 = 339.50 → 340 (+0.50)
    const g = computeGst('24', '24', [{ qty: 1, rate: 110, hsn: '9021', gstRate: 5 }, { qty: 1, rate: 200, hsn: '3004', gstRate: 12 }]);
    const lines = gstVoucherEntries('SALES', { lines: g.lines.map((l) => ({ gstRate: l.gstRate, amount: l.amount })), cgst: g.cgst, sgst: g.sgst, igst: g.igst, roundOff: g.roundOff, total: g.total });
    expect(asMap(lines)).toEqual({ PARTY: 340, SALES_5: -110, SALES_12: -200, OUTPUT_CGST: -14.75, OUTPUT_SGST: -14.75, ROUND_OFF: -0.5 });
    expect(isBalanced(lines)).toBe(true);
    expect(key(lines[0]!)).toBe('PARTY');
  });

  it('debits round off when the invoice was rounded down, and uses IGST inter-state', () => {
    // 1 × 101 @ 5% inter-state → 101 + 5.05 = 106.05 → 106 (−0.05)
    const g = computeGst('24', '29', [{ qty: 1, rate: 101, hsn: '9021', gstRate: 5 }]);
    const lines = gstVoucherEntries('SALES', { lines: [{ gstRate: 5, amount: 101 }], cgst: g.cgst, sgst: g.sgst, igst: g.igst, roundOff: g.roundOff, total: g.total });
    expect(asMap(lines)).toEqual({ PARTY: 106, SALES_5: -101, OUTPUT_IGST: -5.05, ROUND_OFF: 0.05 });
  });

  it('mirrors a credit note into Sales Returns', () => {
    const lines = gstVoucherEntries('CREDIT_NOTE', { lines: [{ gstRate: 5, amount: 2900 }, { gstRate: 12, amount: 100 }], cgst: 78.5, sgst: 78.5, igst: 0, roundOff: 0, total: 3157 });
    expect(asMap(lines)).toEqual({ PARTY: -3157, SALES_RETURNS: 3000, OUTPUT_CGST: 78.5, OUTPUT_SGST: 78.5 });
  });

  it('posts a purchase bill to per-rate purchase ledgers or the line ledger, with input tax', () => {
    const lines = gstVoucherEntries('PURCHASE', {
      lines: [{ gstRate: 5, amount: 1000 }, { gstRate: 5, amount: 500 }, { gstRate: 18, amount: 100, ledgerId: 'courier' }],
      cgst: 46.5, sgst: 46.5, igst: 0, roundOff: 0, total: 1693,
    });
    expect(asMap(lines)).toEqual({ PARTY: -1693, PURCHASE_5: 1500, 'L:courier': 100, INPUT_CGST: 46.5, INPUT_SGST: 46.5 });
  });

  it('mirrors a debit note into Purchase Returns', () => {
    const lines = gstVoucherEntries('DEBIT_NOTE', { lines: [{ gstRate: 12, amount: 185 }], cgst: 0, sgst: 0, igst: 22.2, roundOff: -0.2, total: 207 });
    expect(asMap(lines)).toEqual({ PARTY: 207, PURCHASE_RETURNS: -185, INPUT_IGST: -22.2, ROUND_OFF: 0.2 });
  });

  it('sends paise residuals up to ₹1 to Round Off and refuses anything bigger', () => {
    // Header tax 0.02 short of the line-wise figure (e.g. per-line rounding on a supplier bill).
    const ok = gstVoucherEntries('PURCHASE', { lines: [{ gstRate: 18, amount: 100 }], cgst: 9, sgst: 9, igst: 0, roundOff: 0, total: 118.02 });
    expect(asMap(ok)).toEqual({ PARTY: -118.02, PURCHASE_18: 100, INPUT_CGST: 9, INPUT_SGST: 9, ROUND_OFF: 0.02 });
    expect(() => gstVoucherEntries('SALES', { lines: [{ gstRate: 5, amount: 100 }], cgst: 2.5, sgst: 2.5, igst: 0, roundOff: 0, total: 110 })).toThrow(/do not add up/);
  });

  it('agrees with computeGst for many random invoices', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 300; i++) {
      const n = 1 + Math.floor(rnd() * 5);
      const items = Array.from({ length: n }, () => ({ qty: 1 + Math.floor(rnd() * 9), rate: Math.round(rnd() * 500000) / 100, discPct: Math.floor(rnd() * 3) * 5, hsn: rnd() > 0.5 ? '9021' : '3004', gstRate: [0, 5, 12, 18][Math.floor(rnd() * 4)]! }));
      const g = computeGst('24', rnd() > 0.5 ? '24' : '27', items);
      const lines = gstVoucherEntries('SALES', { lines: g.lines.map((l) => ({ gstRate: l.gstRate, amount: l.amount })), cgst: g.cgst, sgst: g.sgst, igst: g.igst, roundOff: g.roundOff, total: g.total });
      expect(isBalanced(lines)).toBe(true);
      expect(asMap(lines).PARTY ?? 0).toBe(g.total);
    }
  });
});
