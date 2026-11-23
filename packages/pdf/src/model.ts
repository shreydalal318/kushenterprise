import QRCode from 'qrcode';
import { amountInWords, computeGst, round2, stateByCode } from '@kush/core';
import { DEFAULT_LABELS, type DocHsnRow, type DocLabels, type DocModel, type DocParty, type DocSupplier } from './types';

/** What a stored document (invoice / proforma / credit note) provides to build the printable model. */
export interface DocSource {
  title: string;
  numberLabel: string;
  number: string;
  date: string;
  copies: string[];
  supplier: DocSupplier;
  consignee: DocParty;
  buyer: DocParty;
  placeOfSupplyCode: string;
  /** State compared with the place of supply for CGST+SGST vs IGST. Defaults to the issuer's state; a PO uses the vendor's. */
  gstStateCode?: string;
  labels?: Partial<DocLabels>;
  refs: [string, string | null | undefined][];
  termsLabel: string;
  terms?: string | null;
  lines: {
    description: string;
    hsn: string;
    qty: number;
    unit: string;
    rate: number;
    discPct: number;
    amount: number; // stored taxable value
    gstRate: number;
    batchNo?: string | null;
    expiryDate?: string | null;
    powerLabel?: string | null;
    serialNos?: string[];
  }[];
  /** Totals as stored on the document (authoritative). */
  stored: { taxable: number; totalTax: number; roundOff: number; total: number };
  showBank: boolean;
  watermark?: string | null;
  signatureDataUri?: string | null;
  upiAmount?: number | null;
}

/**
 * Build the printable model. Tax lines and the HSN summary are recomputed from the stored lines
 * with the same GST engine that created the document, then checked against the stored totals so
 * a PDF can never disagree with the saved invoice.
 */
export async function buildDocModel(src: DocSource): Promise<DocModel> {
  const g = computeGst(src.gstStateCode ?? src.supplier.stateCode, src.placeOfSupplyCode, src.lines.map((l) => ({ qty: l.qty, rate: l.rate, discPct: l.discPct, hsn: l.hsn, gstRate: l.gstRate })));
  if (Math.abs(g.taxable - src.stored.taxable) > 0.01 || Math.abs(g.totalTax - src.stored.totalTax) > 0.01 || Math.abs(g.total - src.stored.total) > 0.01) {
    throw new Error(`Stored totals for ${src.number} do not match its lines (taxable ${g.taxable} vs ${src.stored.taxable}, tax ${g.totalTax} vs ${src.stored.totalTax})`);
  }
  const pos = stateByCode(src.placeOfSupplyCode);
  const upi = src.showBank && src.supplier.upiId && src.upiAmount
    ? await QRCode.toDataURL(`upi://pay?pa=${encodeURIComponent(src.supplier.upiId)}&pn=${encodeURIComponent(src.supplier.name)}&am=${src.upiAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(src.number)}`, { margin: 0, width: 300, errorCorrectionLevel: 'M' })
    : null;
  const units = [...new Set(src.lines.map((l) => l.unit))];
  return {
    title: src.title, labels: { ...DEFAULT_LABELS, ...src.labels }, numberLabel: src.numberLabel, number: src.number, date: src.date, copies: src.copies,
    supplier: src.supplier, consignee: src.consignee, buyer: src.buyer,
    placeOfSupply: { stateName: pos?.name ?? src.placeOfSupplyCode, stateCode: src.placeOfSupplyCode },
    refs: src.refs, termsLabel: src.termsLabel, terms: src.terms,
    interState: g.taxType === 'INTER_STATE',
    lines: src.lines.map((l, i) => ({
      sl: i + 1, description: l.description, hsn: l.hsn, qty: l.qty, per: l.unit, rate: l.rate, discPct: l.discPct, amount: round2(l.amount),
      meta: { batch: l.batchNo && l.batchNo !== 'NA' ? l.batchNo : null, expiry: l.expiryDate ?? null, power: l.powerLabel ?? null, serials: l.serialNos ?? [] },
    })),
    taxLines: g.taxLines,
    roundOff: g.roundOff,
    total: g.total,
    totalQty: g.totalQty,
    totalInWords: amountInWords(g.total),
    taxInWords: amountInWords(g.totalTax),
    hsnSummary: g.hsnSummary as DocHsnRow[],
    hsnTotals: { taxable: g.taxable, cgst: g.cgst, sgst: g.sgst, igst: g.igst, totalTax: g.totalTax },
    showBank: src.showBank,
    watermark: src.watermark,
    signatureDataUri: src.signatureDataUri,
    upiQrDataUri: upi,
    qtyUnit: units.length === 1 ? units[0] : 'units',
  };
}
