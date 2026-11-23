/** Data model for a Tally-style GST document (tax invoice, proforma, credit note). */

export interface DocParty {
  name: string;
  attn?: string | null;
  addressLines: string[];
  gstin?: string | null;
  stateName: string;
  stateCode: string;
  drugLicence?: string | null;
}

export interface DocSupplier {
  name: string;
  addressLines: string[];
  phone?: string | null;
  email?: string | null;
  gstin: string;
  stateName: string;
  stateCode: string;
  pan: string;
  drugLicence: string;
  jurisdiction: string;
  declaration: string;
  bank: { holder: string; name: string; account: string; branchIfsc: string };
  upiId?: string | null;
}

export interface DocLine {
  sl: number;
  description: string;
  meta?: { batch?: string | null; expiry?: string | null; power?: string | null; serials?: string[] };
  hsn: string;
  qty: number;
  per: string;
  rate: number;
  discPct: number;
  amount: number;
}

export interface DocHsnRow {
  hsn: string;
  taxable: number;
  cgstRate: number;
  cgst: number;
  sgstRate: number;
  sgst: number;
  igstRate: number;
  igst: number;
  totalTax: number;
}

export interface DocModel {
  title: string; // "TAX INVOICE" | "PROFORMA INVOICE" | "CREDIT NOTE"
  numberLabel: string; // "Invoice No." …
  number: string;
  date: string; // YYYY-MM-DD
  copies: string[]; // e.g. ["ORIGINAL FOR RECIPIENT"]; [""] for no copy label
  supplier: DocSupplier;
  consignee: DocParty;
  buyer: DocParty;
  placeOfSupply: { stateName: string; stateCode: string };
  /** Right-hand reference grid: 12 cells in Tally order (label, value). */
  refs: [string, string | null | undefined][];
  termsLabel: string; // "Terms of Delivery"
  terms?: string | null;
  interState: boolean;
  lines: DocLine[];
  taxLines: { label: string; rate: number; amount: number }[];
  roundOff: number;
  total: number;
  totalQty: number;
  totalInWords: string;
  taxInWords: string;
  hsnSummary: DocHsnRow[];
  hsnTotals: { taxable: number; cgst: number; sgst: number; igst: number; totalTax: number };
  showBank: boolean;
  watermark?: string | null; // e.g. "CANCELLED"
  signatureDataUri?: string | null;
  upiQrDataUri?: string | null;
  qtyUnit?: string; // unit shown in the total row
}
