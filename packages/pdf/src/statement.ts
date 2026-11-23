/** Customer account statement (A4, simple table) — generated for the portal and staff. */
import { amountInWords, formatDate, formatINR } from '@kush/core';
import { fontCss, LOGO } from './template';

export interface StatementModel {
  company: { name: string; addressLines: string[]; gstin: string; phone?: string | null; email?: string | null };
  customer: { name: string; code: string; addressLines: string[]; gstin?: string | null };
  from: string | null;
  to: string;
  opening: number;
  closing: number;
  rows: { date: string; type: string; number: string; narration: string; debit: number; credit: number; balance: number }[];
  ageing: Record<string, number>;
  overdue: number;
  onAccount: number;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (n: number) => (n ? formatINR(n) : '');
const signed = (n: number) => `${formatINR(Math.abs(n))} ${n < 0 ? 'Cr' : 'Dr'}`;

export function buildStatementHtml(m: StatementModel) {
  const rows = m.rows.map((r) => `<tr><td>${esc(formatDate(r.date))}</td><td>${esc(r.type)} <b>${esc(r.number)}</b></td><td>${esc(r.narration)}</td><td class="r">${money(r.debit)}</td><td class="r">${money(r.credit)}</td><td class="r b">${signed(r.balance)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Statement ${esc(m.customer.name)}</title>
<style>${fontCss}
@page { size: A4; margin: 12mm 11mm 14mm; }
body { font-family: Inter, sans-serif; font-size: 8.4pt; color: #111; margin: 0; }
.top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1pt solid #0f2f4d; padding-bottom: 3mm; }
.top img { height: 11mm; }
.co { text-align: right; font-size: 7.6pt; line-height: 1.45; }
h1 { font-size: 13pt; margin: 4mm 0 1mm; color: #0f2f4d; letter-spacing: .04em; }
.meta { display: flex; justify-content: space-between; gap: 6mm; margin-bottom: 3mm; }
.box { border: .6pt solid #999; padding: 2mm 3mm; flex: 1; line-height: 1.45; }
.lbl { font-size: 6.8pt; color: #555; text-transform: uppercase; letter-spacing: .05em; }
table { width: 100%; border-collapse: collapse; }
th, td { border: .5pt solid #999; padding: 1.3mm 1.6mm; vertical-align: top; }
th { background: #eef4f7; font-weight: 600; text-align: left; font-size: 7.4pt; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
.r { text-align: right; white-space: nowrap; } .b { font-weight: 600; }
.sum td { background: #f6f8fa; font-weight: 600; }
.ageing { margin-top: 4mm; width: 70%; }
.foot { margin-top: 4mm; font-size: 7.2pt; color: #444; }
</style></head><body>
<div class="top"><img src="${LOGO}" alt=""><div class="co"><b>${esc(m.company.name)}</b><br>${m.company.addressLines.map(esc).join('<br>')}<br>GSTIN: ${esc(m.company.gstin)}${m.company.phone ? ` · ${esc(m.company.phone)}` : ''}${m.company.email ? ` · ${esc(m.company.email)}` : ''}</div></div>
<h1>STATEMENT OF ACCOUNT</h1>
<div class="meta">
  <div class="box"><div class="lbl">Customer</div><b>${esc(m.customer.name)}</b> (${esc(m.customer.code)})<br>${m.customer.addressLines.map(esc).join('<br>')}${m.customer.gstin ? `<br>GSTIN: ${esc(m.customer.gstin)}` : ''}</div>
  <div class="box"><div class="lbl">Period</div>${m.from ? esc(formatDate(m.from)) : 'From the beginning'} to ${esc(formatDate(m.to))}<br><div class="lbl" style="margin-top:2mm">Balance due</div><b style="font-size:11pt">₹ ${signed(m.closing)}</b>${m.overdue > 0 ? `<br>of which overdue: ₹ ${formatINR(m.overdue)}` : ''}</div>
</div>
<table><thead><tr><th style="width:15mm">Date</th><th style="width:48mm">Document</th><th>Particulars</th><th class="r" style="width:24mm">Debit (₹)</th><th class="r" style="width:24mm">Credit (₹)</th><th class="r" style="width:28mm">Balance (₹)</th></tr></thead>
<tbody><tr class="sum"><td colspan="5">Opening balance</td><td class="r">${signed(m.opening)}</td></tr>${rows}<tr class="sum"><td colspan="5">Closing balance (${esc(amountInWords(Math.abs(m.closing)))})</td><td class="r">${signed(m.closing)}</td></tr></tbody></table>
<table class="ageing"><thead><tr>${Object.keys(m.ageing).map((k) => `<th class="r">${esc(k)} days</th>`).join('')}<th class="r">On account</th></tr></thead><tbody><tr>${Object.values(m.ageing).map((v) => `<td class="r">${formatINR(v)}</td>`).join('')}<td class="r">${formatINR(m.onAccount)}</td></tr></tbody></table>
<p class="foot">Dr = amount due from you, Cr = in your favour. Please let us know within 15 days if anything here does not match your books. This is a computer-generated statement.</p>
</body></html>`;
}
