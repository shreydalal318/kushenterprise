/**
 * A customer's account printed the way Tally prints a Ledger Account: company and party centred at the top,
 * then Date / Particulars (To … for debits, By … for credits) / Vch Type / Vch No. / Debit / Credit, the
 * opening balance first, and the closing balance on the other side so both columns total the same.
 */
import { formatINR, tallyDate } from '@kush/core';
import { fontCss } from './template';

export interface StatementRow {
  date: string;
  /** "To Sales", "By Bank", "By Sales Returns" … */
  particulars: string;
  vchType: string;
  vchNo: string;
  narration: string;
  debit: number;
  credit: number;
  cancelled?: boolean;
}

export interface StatementModel {
  company: { name: string; addressLines: string[]; gstin: string; phone?: string | null; email?: string | null };
  customer: { name: string; code: string; addressLines: string[]; gstin?: string | null };
  from: string | null;
  to: string;
  opening: number;
  closing: number;
  rows: StatementRow[];
  /** Tally's bill-wise pending bills: each unpaid invoice, what is left on it and how late it is. */
  pendingBills: { date: string; ref: string; opening: number; pending: number; dueOn: string; overdueDays: number }[];
  ageing: Record<string, number>;
  overdue: number;
  onAccount: number;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (n: number) => (n ? formatINR(n) : '');
const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildStatementHtml(m: StatementModel) {
  const firstDate = m.from ?? m.rows[0]?.date ?? m.to;
  const openDr = m.opening > 0 ? m.opening : 0;
  const openCr = m.opening < 0 ? -m.opening : 0;
  const totalDr = round2(openDr + m.rows.reduce((t, r) => t + r.debit, 0));
  const totalCr = round2(openCr + m.rows.reduce((t, r) => t + r.credit, 0));
  // Tally balances the account: the closing balance goes on the smaller side.
  const closeDr = m.closing < 0 ? -m.closing : 0;
  const closeCr = m.closing > 0 ? m.closing : 0;
  const grand = round2(Math.max(totalDr + closeDr, totalCr + closeCr));

  const line = (date: string, particulars: string, vchType: string, vchNo: string, debit: number, credit: number, narration = '', cls = '') =>
    `<tr class="${cls}"><td class="dt">${esc(date)}</td><td class="pt">${particulars}${narration ? `<div class="nar">${esc(narration)}</div>` : ''}</td><td>${esc(vchType)}</td><td>${esc(vchNo)}</td><td class="r">${money(debit)}</td><td class="r">${money(credit)}</td></tr>`;
  const body = [
    m.opening ? line(tallyDate(firstDate), '<b>Opening Balance</b>', '', '', openDr, openCr) : '',
    ...m.rows.map((r) => line(tallyDate(r.date), r.cancelled ? '<i>(cancelled)</i>' : esc(r.particulars), r.vchType, r.vchNo, r.debit, r.credit, r.narration, r.cancelled ? 'cancelled' : '')),
  ].join('');
  const ageingCells = Object.entries(m.ageing);

  return `<!doctype html><html><head><meta charset="utf-8"><title>Ledger Account ${esc(m.customer.name)}</title>
<style>${fontCss}
@page { size: A4; margin: 12mm 12mm 14mm; }
@media screen { body { padding: 10mm 12mm; max-width: 186mm; margin: 0 auto; background: #fff; } }
body { font-family: Inter, Arial, sans-serif; font-size: 8.2pt; color: #000; margin: 0; }
.head { text-align: center; line-height: 1.4; }
.co { font-size: 12pt; font-weight: 700; }
.party { margin-top: 4mm; }
.party .nm { font-size: 10.5pt; font-weight: 700; }
.party .ttl { font-size: 8.4pt; margin: .6mm 0; }
.period { margin: 2.5mm 0 3mm; font-weight: 600; }
table.ledger { width: 100%; border-collapse: collapse; }
table.ledger th { font-weight: 600; text-align: left; padding: 1.2mm 1.4mm; border-top: .8pt solid #000; border-bottom: .8pt solid #000; }
table.ledger th.r, td.r { text-align: right; }
table.ledger td { padding: .9mm 1.4mm; vertical-align: top; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
td.dt { white-space: nowrap; width: 17mm; }
td.r { white-space: nowrap; width: 25mm; }
.nar { font-style: italic; font-size: 7.4pt; color: #333; }
tr.cancelled td { color: #666; }
tr.sub td { border-top: .6pt solid #000; font-weight: 600; padding-top: 1.2mm; }
tr.close td { font-weight: 600; }
tr.grand td { border-top: .6pt solid #000; border-bottom: 1.6pt double #000; font-weight: 700; padding: 1.2mm 1.4mm; }
.age { margin-top: 6mm; }
.age h2 { font-size: 8.6pt; margin: 0 0 1.5mm; }
.age table { border-collapse: collapse; }
.age th, .age td { padding: .8mm 3mm; text-align: right; }
.age th { font-weight: 600; border-top: .6pt solid #000; border-bottom: .6pt solid #000; }
.age table.bills { width: 100%; }
.age .l { text-align: left; }
.age tr.tot td { border-top: .6pt solid #000; font-weight: 700; }
.foot { margin-top: 5mm; font-size: 7.2pt; color: #333; }
</style></head><body>
<div class="head">
  <div class="co">${esc(m.company.name)}</div>
  ${m.company.addressLines.map((l) => `<div>${esc(l)}</div>`).join('')}
  ${m.company.gstin ? `<div>GSTIN/UIN: ${esc(m.company.gstin)}</div>` : ''}
  ${m.company.phone || m.company.email ? `<div>${[m.company.phone && `Contact: ${esc(m.company.phone)}`, m.company.email && `E-Mail: ${esc(m.company.email)}`].filter(Boolean).join(' · ')}</div>` : ''}
  <div class="party">
    <div class="nm">${esc(m.customer.name)}</div>
    <div class="ttl">Ledger Account</div>
    ${m.customer.addressLines.map((l) => `<div>${esc(l)}</div>`).join('')}
    ${m.customer.gstin ? `<div>GSTIN/UIN: ${esc(m.customer.gstin)}</div>` : ''}
  </div>
  <div class="period">${esc(tallyDate(firstDate))} to ${esc(tallyDate(m.to))}</div>
</div>
<table class="ledger">
  <thead><tr><th>Date</th><th>Particulars</th><th>Vch Type</th><th>Vch No.</th><th class="r">Debit</th><th class="r">Credit</th></tr></thead>
  <tbody>
    ${body || '<tr><td colspan="6" style="text-align:center;padding:6mm">No entries in this period.</td></tr>'}
    <tr class="sub"><td></td><td></td><td></td><td></td><td class="r">${formatINR(totalDr)}</td><td class="r">${formatINR(totalCr)}</td></tr>
    ${m.closing ? line('', `<b>${m.closing > 0 ? 'By' : 'To'} Closing Balance</b>`, '', '', closeDr, closeCr, '', 'close') : ''}
    <tr class="grand"><td></td><td></td><td></td><td></td><td class="r">${formatINR(grand)}</td><td class="r">${formatINR(grand)}</td></tr>
  </tbody>
</table>
<div class="age">
  <h2>Pending Bills (as on ${esc(tallyDate(m.to))})</h2>
  <table class="bills"><thead><tr><th class="l">Date</th><th class="l">Ref. No.</th><th>Opening Amount</th><th>Pending Amount</th><th class="l">Due on</th><th>Overdue by days</th></tr></thead>
  <tbody>${m.pendingBills.map((b) => `<tr><td class="l">${esc(tallyDate(b.date))}</td><td class="l">${esc(b.ref)}</td><td>${formatINR(b.opening)} Dr</td><td>${formatINR(b.pending)} Dr</td><td class="l">${esc(tallyDate(b.dueOn))}</td><td>${b.overdueDays > 0 ? b.overdueDays : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="l">No pending bills.</td></tr>'}
  ${m.onAccount > 0 ? `<tr><td class="l"></td><td class="l">On Account</td><td></td><td>${formatINR(m.onAccount)} Cr</td><td></td><td></td></tr>` : ''}
  <tr class="tot"><td class="l"></td><td class="l">Total</td><td></td><td>${formatINR(Math.abs(m.pendingBills.reduce((t, b) => t + b.pending, 0) - m.onAccount))} ${m.pendingBills.reduce((t, b) => t + b.pending, 0) - m.onAccount < 0 ? 'Cr' : 'Dr'}</td><td></td><td></td></tr></tbody></table>
  <h2 style="margin-top:4mm">Ageing</h2>
  <table><thead><tr>${ageingCells.map(([k]) => `<th>${esc(k)} days</th>`).join('')}<th>Overdue</th></tr></thead>
  <tbody><tr>${ageingCells.map(([, v]) => `<td>${formatINR(v)}</td>`).join('')}<td>${formatINR(m.overdue)}</td></tr></tbody></table>
</div>
<p class="foot">Closing balance: <b>${formatINR(Math.abs(m.closing))} ${m.closing < 0 ? 'Cr' : 'Dr'}</b> (Dr = due from you, Cr = in your favour). Please tell us within 15 days if anything here does not match your books. This is a computer generated ledger.</p>
</body></html>`;
}
