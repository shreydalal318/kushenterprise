import type { CompanySettings } from '@kush/db';

/** Integration settings (no secrets): Tally ledger names, e-invoice / e-way bill switches. */
export const DEFAULT_INTEGRATIONS = {
  tally: {
    companyName: '', // the company name exactly as in Tally (blank = import into the open company)
    salesLedger: 'Sales @ {rate}%',
    interstateSalesLedger: 'Interstate Sales @ {rate}%',
    salesReturnLedger: 'Sales Returns @ {rate}%',
    cgstLedger: 'Output CGST @ {half}%',
    sgstLedger: 'Output SGST @ {half}%',
    igstLedger: 'Output IGST @ {rate}%',
    roundOffLedger: 'Round Off',
    bankLedger: 'Bank Account',
    cashLedger: 'Cash',
    customerGroup: 'Sundry Debtors',
  },
  eInvoice: { enabled: false },
  ewayBill: { thresholdValue: 50000 },
};
export type Integrations = typeof DEFAULT_INTEGRATIONS;

export function integrationsOf(s: CompanySettings): Integrations {
  const c = (s.integrationConfig ?? {}) as Partial<Integrations>;
  return { tally: { ...DEFAULT_INTEGRATIONS.tally, ...c.tally }, eInvoice: { ...DEFAULT_INTEGRATIONS.eInvoice, ...c.eInvoice }, ewayBill: { ...DEFAULT_INTEGRATIONS.ewayBill, ...c.ewayBill } };
}

/** "Sales @ {rate}%" → "Sales @ 12%"; {half} is half the rate (CGST/SGST). */
export const ledgerName = (pattern: string, rate: number) => pattern.replace('{rate}', trimNum(rate)).replace('{half}', trimNum(rate / 2));
const trimNum = (n: number) => String(Math.round(n * 100) / 100);
