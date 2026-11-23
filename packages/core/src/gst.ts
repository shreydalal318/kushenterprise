import { amountInWords, round2 } from './money';

export type TaxType = 'INTRA_STATE' | 'INTER_STATE';

/** CGST+SGST when supplier state == place of supply, else IGST. */
export const taxTypeFor = (supplierStateCode: string, placeOfSupplyStateCode: string): TaxType =>
  supplierStateCode === placeOfSupplyStateCode ? 'INTRA_STATE' : 'INTER_STATE';

export interface TaxableLineInput {
  qty: number;
  rate: number;
  discPct?: number;
  hsn: string;
  gstRate: number; // percent, e.g. 5
}

export interface HsnSummaryRow {
  hsn: string;
  gstRate: number;
  taxable: number;
  cgstRate: number;
  cgst: number;
  sgstRate: number;
  sgst: number;
  igstRate: number;
  igst: number;
  totalTax: number;
}

export interface TaxLedgerLine {
  label: 'CGST' | 'SGST' | 'IGST';
  rate: number;
  amount: number;
}

export interface GstComputation<L> {
  taxType: TaxType;
  lines: (L & { amount: number })[];
  hsnSummary: HsnSummaryRow[];
  taxLines: TaxLedgerLine[];
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  roundOff: number;
  total: number;
  totalQty: number;
  totalInWords: string;
  taxInWords: string;
}

/** Taxable value of a line: qty × rate less discount, rounded to paise. */
export const lineAmount = (l: Pick<TaxableLineInput, 'qty' | 'rate' | 'discPct'>): number =>
  round2(l.qty * l.rate * (1 - (l.discPct ?? 0) / 100));

/**
 * GST for a document. Tax is computed per HSN + rate group on the taxable value (as Tally does),
 * so the HSN summary always reconciles with the tax lines. Grand total is rounded to the rupee.
 */
export function computeGst<L extends TaxableLineInput>(
  supplierStateCode: string,
  placeOfSupplyStateCode: string,
  inputLines: L[],
): GstComputation<L> {
  const taxType = taxTypeFor(supplierStateCode, placeOfSupplyStateCode);
  const inter = taxType === 'INTER_STATE';
  const lines = inputLines.map((l) => ({ ...l, amount: lineAmount(l) }));

  const groups = new Map<string, { hsn: string; gstRate: number; taxable: number }>();
  for (const l of lines) {
    const key = `${l.hsn}|${l.gstRate}`;
    const g = groups.get(key) ?? { hsn: l.hsn, gstRate: l.gstRate, taxable: 0 };
    g.taxable = round2(g.taxable + l.amount);
    groups.set(key, g);
  }

  const hsnSummary: HsnSummaryRow[] = [...groups.values()].map((g) => {
    if (inter) {
      const igst = round2((g.taxable * g.gstRate) / 100);
      return { ...g, cgstRate: 0, cgst: 0, sgstRate: 0, sgst: 0, igstRate: g.gstRate, igst, totalTax: igst };
    }
    const half = g.gstRate / 2;
    const cgst = round2((g.taxable * half) / 100);
    return { ...g, cgstRate: half, cgst, sgstRate: half, sgst: cgst, igstRate: 0, igst: 0, totalTax: round2(cgst * 2) };
  });

  const byRate = new Map<number, { cgst: number; sgst: number; igst: number }>();
  for (const h of hsnSummary) {
    const r = byRate.get(h.gstRate) ?? { cgst: 0, sgst: 0, igst: 0 };
    r.cgst = round2(r.cgst + h.cgst);
    r.sgst = round2(r.sgst + h.sgst);
    r.igst = round2(r.igst + h.igst);
    byRate.set(h.gstRate, r);
  }
  const taxLines: TaxLedgerLine[] = [];
  for (const [rate, r] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
    if (inter) taxLines.push({ label: 'IGST', rate, amount: r.igst });
    else taxLines.push({ label: 'CGST', rate: rate / 2, amount: r.cgst }, { label: 'SGST', rate: rate / 2, amount: r.sgst });
  }

  const sum = (f: (h: HsnSummaryRow) => number) => round2(hsnSummary.reduce((s, h) => s + f(h), 0));
  const taxable = round2(lines.reduce((s, l) => s + l.amount, 0));
  const totalTax = sum((h) => h.totalTax);
  const beforeRound = round2(taxable + totalTax);
  const total = Math.round(beforeRound);

  return {
    taxType,
    lines,
    hsnSummary,
    taxLines,
    taxable,
    cgst: sum((h) => h.cgst),
    sgst: sum((h) => h.sgst),
    igst: sum((h) => h.igst),
    totalTax,
    roundOff: round2(total - beforeRound),
    total,
    totalQty: lines.reduce((s, l) => s + l.qty, 0),
    totalInWords: amountInWords(total),
    taxInWords: amountInWords(totalTax),
  };
}
