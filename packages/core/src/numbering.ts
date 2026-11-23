export const DOC_TYPES = [
  'TAX_INVOICE', 'PROFORMA', 'PURCHASE_ORDER', 'CREDIT_NOTE', 'GRN', 'SALES_ORDER', 'PAYMENT_RECEIPT', 'DEBIT_NOTE',
] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** Default prefixes; the financial year is inserted after the prefix: KE/PI/ + 2026-27 + / + 0001. */
export const DEFAULT_PREFIXES: Record<DocType, string> = {
  TAX_INVOICE: 'KE/',
  PROFORMA: 'KE/PI/',
  PURCHASE_ORDER: 'KE/PO/',
  CREDIT_NOTE: 'KE/CN/',
  GRN: 'KE/GRN/',
  SALES_ORDER: 'KE/SO/',
  PAYMENT_RECEIPT: 'KE/RC/',
  DEBIT_NOTE: 'KE/DN/',
};

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  TAX_INVOICE: 'Tax invoice',
  PROFORMA: 'Proforma invoice',
  PURCHASE_ORDER: 'Purchase order',
  CREDIT_NOTE: 'Credit note',
  GRN: 'Goods receipt (GRN)',
  SALES_ORDER: 'Sales order',
  PAYMENT_RECEIPT: 'Payment receipt',
  DEBIT_NOTE: 'Debit note',
};

/** ("KE/PI/", "2026-27", 1, 4) -> "KE/PI/2026-27/0001" */
export const formatDocNumber = (prefix: string, financialYear: string, n: number, padding = 4): string =>
  `${prefix}${financialYear}/${String(n).padStart(padding, '0')}`;
