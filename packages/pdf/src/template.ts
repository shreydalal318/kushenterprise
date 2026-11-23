/**
 * Tally Prime–style GST document template (the layout approved in Phase 0).
 * Builds a self-contained HTML page; a small script inside lays out pages by measuring real
 * row heights, so long documents flow onto continuation pages that repeat the full header.
 */
import { formatDate, formatINR } from '@kush/core';
import { INTER_FACES, LOGO_PNG_BASE64 } from './assets.generated';
import type { DocLine, DocModel, DocParty } from './types';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmtINR = formatINR;
const fmtDate = (d: string | null | undefined) => (d ? formatDate(d) : '');

// Unicode ranges as published by @fontsource for the two subsets we embed.
const RANGES = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};
export const fontCss = INTER_FACES.map((f) => `@font-face{font-family:'Inter';font-style:${f.style};font-weight:${f.weight};font-display:block;src:url(data:font/woff2;base64,${f.data}) format('woff2');unicode-range:${RANGES[f.subset]};}`).join('\n');
export const LOGO = `data:image/png;base64,${LOGO_PNG_BASE64}`;

const css = String.raw`
@page { size: A4; margin: 0; }
:root { --line: 0.6pt solid #000; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: #000; }
body { font-family: 'Inter', Arial, sans-serif; font-size: 7.4pt; line-height: 1.22;
  font-feature-settings: 'calt' 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; padding: 7mm 8mm 6mm; display: flex; flex-direction: column;
  page-break-after: always; break-after: page; overflow: hidden; }
.page:last-child { page-break-after: auto; break-after: auto; }
.topbar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; margin-bottom: 1.4mm; }
.topbar .logo { height: 9mm; width: auto; display: block; }
.title { font-size: 11pt; font-weight: 700; letter-spacing: .04em; text-align: center; }
.copy { text-align: right; font-size: 6.6pt; font-style: italic; }
.box { flex: 1; display: flex; flex-direction: column; border: var(--line); min-height: 0; }

/* ---- header ---- */
.head { display: grid; grid-template-columns: 1fr 1fr; border-bottom: var(--line); }
.head > .left { border-right: var(--line); display: flex; flex-direction: column; }
.cell { padding: 1.1mm 1.6mm; }
.cell + .cell { border-top: var(--line); }
.lbl { font-size: 6.4pt; color: #000; }
.b { font-weight: 700; }
.party .name { font-weight: 700; font-size: 8pt; }
.seller { display: flex; flex-direction: column; }
.seller .name { font-weight: 700; font-size: 8.4pt; }
.kv { display: grid; grid-template-columns: auto 1fr; column-gap: 1.2mm; }
.refs { display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: minmax(7.2mm, auto); }
.refs > div { padding: .8mm 1.4mm; border-bottom: var(--line); }
.refs > div:nth-child(odd) { border-right: var(--line); }
.refs > div .v { font-weight: 700; min-height: 3.4mm; }
.refs > .tod { grid-column: 1 / -1; border-right: 0 !important; border-bottom: 0; }

/* ---- items ---- */
.items { flex: 1; min-height: 0; overflow: hidden; }
table { border-collapse: collapse; width: 100%; }
table.lines { table-layout: fixed; }
table.lines.measuring tr.filler { display: none; }
table.lines th { font-weight: 400; font-size: 6.8pt; padding: .9mm .8mm; border-bottom: var(--line);
  border-left: var(--line); text-align: center; vertical-align: middle; }
table.lines td { border-left: var(--line); padding: .55mm .9mm; vertical-align: top; }
table.lines th:first-child, table.lines td:first-child { border-left: 0; }
table.lines tr.item td { padding-top: 1mm; }
table.lines tr.filler td { padding: 0; }
table.lines tfoot td { border-top: var(--line); padding: 1mm .9mm; font-weight: 700; vertical-align: middle; }
.r { text-align: right; font-variant-numeric: tabular-nums; } .c { text-align: center; }
.desc .nm { font-weight: 700; }
.desc .meta { font-size: 6.4pt; font-style: italic; margin-top: .2mm; line-height: 1.25; }
.desc .meta span { display: inline-block; white-space: nowrap; margin-right: 2mm; }
.desc .meta span.sr { display: inline; white-space: normal; }
tr.tax td.desc { text-align: right; font-weight: 700; font-style: italic; }
tr.tax td.amt { font-weight: 700; }
tr.gap td { height: 2.2mm; }
.continued { font-style: italic; font-weight: 600; }

/* ---- footer ---- */
.foot { border-top: var(--line); }
.words { display: flex; justify-content: space-between; padding: .9mm 1.6mm .4mm; }
.words-v { padding: 0 1.6mm 1.2mm; font-weight: 700; font-size: 8pt; }
table.hsn th, table.hsn td { border: var(--line); padding: .6mm 1mm; font-size: 6.8pt; }
table.hsn th { font-weight: 400; text-align: center; }
table.hsn { border-left: 0; border-right: 0; }
table.hsn tr > :first-child { border-left: 0; }
table.hsn tr > :last-child { border-right: 0; }
table.hsn tfoot td { font-weight: 700; }
.taxwords { padding: 1mm 1.6mm; }
.taxwords .b { font-size: 7.6pt; }
.bottom { display: grid; grid-template-columns: 1fr 1fr; }
.bottom .l { padding: 1mm 1.6mm; display: flex; flex-direction: column; justify-content: flex-end; gap: 1mm; }
.decl-h { text-decoration: underline; }
.decl { font-size: 6.6pt; }
.bank { padding: 1mm 1.6mm; display: grid; grid-template-columns: 1fr auto; gap: 2mm; }
.bank .kv { row-gap: .2mm; }
.upi { text-align: center; font-size: 5.8pt; }
.upi img { width: 17mm; height: 17mm; display: block; image-rendering: pixelated; }
.sign { border-top: var(--line); border-left: var(--line); display: flex; flex-direction: column;
  justify-content: space-between; align-items: flex-end; padding: 1mm 1.6mm; height: 19mm; }
.sign .stamp { align-self: center; width: 34mm; height: 11mm; border: 0.5pt dashed #888; color: #777;
  font-size: 6pt; display: flex; align-items: center; justify-content: center; }
.custsign { border-top: var(--line); padding: 1mm 1.6mm; display: flex; align-items: flex-end; height: 19mm; font-size: 6.6pt; }
.computer { text-align: center; font-size: 6.6pt; margin-top: 1mm; }
.pagefoot { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin-top: 1.6mm;
  padding-top: 1.2mm; border-top: 0.4pt solid #bbb; font-size: 6.2pt; color: #333; }
.pagefoot img { height: 4.6mm; width: auto; }
.pagefoot .pg { text-align: right; }
.page { position: relative; }
.watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 5; }
.watermark span { transform: rotate(-30deg); font-size: 64pt; font-weight: 700; color: rgba(180, 35, 24, .16); border: 4pt solid rgba(180, 35, 24, .16); padding: 2mm 8mm; letter-spacing: .08em; }
.einv { display: grid; grid-template-columns: 1fr auto; gap: 2mm; align-items: center; border: var(--line); border-bottom: 0; padding: 1.2mm 1.6mm; font-size: 6.8pt; }
.einv .kv { grid-template-columns: 16mm 1fr; }
.einv img { width: 19mm; height: 19mm; }
.sign img.sig { align-self: center; max-height: 11mm; max-width: 40mm; object-fit: contain; }
`;


function partyBlock(label: string, p: DocParty, extra = '') {
  return `<div class="cell party">
    <div class="lbl">${esc(label)}</div>
    <div class="name">${esc(p.name)}</div>
    ${p.attn ? `<div>${esc(p.attn)}</div>` : ''}
    ${p.addressLines.map((l) => `<div>${esc(l)}</div>`).join('')}
    <div class="kv">
      <span>GSTIN/UIN</span><span>: <span class="b">${esc(p.gstin || 'Unregistered')}</span></span>
      <span>State Name</span><span>: ${esc(p.stateName)}, Code : ${esc(p.stateCode)}</span>
      ${p.drugLicence ? `<span>Drug Lic. No.</span><span>: ${esc(p.drugLicence)}</span>` : ''}
      ${extra}
    </div>
  </div>`;
}

function headerHtml(d: DocModel) {
  const s = d.supplier;
  const ref = (label: string, value: string | null | undefined) => `<div><div class="lbl">${esc(label)}</div><div class="v">${esc(value || '')}</div></div>`;
  const cells = [[d.numberLabel, d.number], ['Dated', fmtDate(d.date)], ...d.refs].slice(0, 12);
  while (cells.length < 12) cells.push(['', '']);
  const e = d.einvoice;
  const einv = e ? `<div class="einv"><div class="kv"><span>IRN</span><span>: <span class="b" style="word-break:break-all">${esc(e.irn)}</span></span><span>Ack No.</span><span>: <span class="b">${esc(e.ackNo)}</span></span><span>Ack Date</span><span>: <span class="b">${esc(fmtDate(e.ackDate))}</span></span></div>${e.qrDataUri ? `<img src="${e.qrDataUri}" alt="e-Invoice QR">` : ''}</div>` : '';
  return `${einv}<div class="head">
    <div class="left">
      <div class="cell seller">
        <div class="name">${esc(s.name)}</div>
        ${s.addressLines.map((l) => `<div>${esc(l)}</div>`).join('')}
        <div class="kv">
          ${s.phone || s.email ? `<span>Phone</span><span>: ${esc(s.phone ?? '')} &nbsp; E-Mail : ${esc(s.email ?? '')}</span>` : ''}
          <span>GSTIN/UIN</span><span>: <span class="b">${esc(s.gstin)}</span></span>
          <span>State Name</span><span>: ${esc(s.stateName)}, Code : ${esc(s.stateCode)}</span>
          <span>PAN</span><span>: ${esc(s.pan)} &nbsp; Drug Lic. No. : ${esc(s.drugLicence)}</span>
        </div>
      </div>
      ${partyBlock(d.labels.consignee, d.consignee)}
      ${partyBlock(d.labels.buyer, d.buyer, `<span>Place of Supply</span><span>: ${esc(d.placeOfSupply.stateName)} (${esc(d.placeOfSupply.stateCode)})</span>`)}
    </div>
    <div class="refs">
      ${cells.map(([l, v]) => ref(l as string, v as string)).join('')}
      <div class="tod"><div class="lbl">${esc(d.termsLabel)}</div><div class="v" style="font-weight:400">${esc(d.terms)}</div></div>
    </div>
  </div>`;
}

function itemRow(l: DocLine) {
  const m = l.meta ?? {};
  const meta = [
    m.batch && `<span>Batch : ${esc(m.batch)}</span>`,
    m.expiry && `<span>Exp. : ${esc(fmtDate(m.expiry))}</span>`,
    m.power && `<span>Power : ${esc(m.power)}</span>`,
    m.serials?.length && `<span class="sr">Sr. No. : ${esc(m.serials.join(', '))}</span>`,
  ].filter(Boolean).join('');
  return `<tr class="item">
    <td class="c">${l.sl}</td>
    <td class="desc"><div class="nm">${esc(l.description)}</div>${meta ? `<div class="meta">${meta}</div>` : ''}</td>
    <td class="c">${esc(l.hsn)}</td>
    <td class="r b">${l.qty} ${esc(l.per)}</td>
    <td class="r">${fmtINR(l.rate)}</td>
    <td class="c">${esc(l.per)}</td>
    <td class="r">${l.discPct ? `${l.discPct} %` : ''}</td>
    <td class="r b">${fmtINR(l.amount)}</td>
  </tr>`;
}

function taxRowsHtml(d: DocModel) {
  const signed = (n: number) => (n < 0 ? `(-)${fmtINR(-n)}` : fmtINR(n));
  const rows = d.taxLines.map((t) => `<tr class="tax">
      <td></td><td class="desc">${esc(t.label)}</td><td></td><td></td>
      <td class="r">${t.rate}</td><td class="c">%</td><td></td><td class="r amt">${fmtINR(t.amount)}</td></tr>`);
  if (d.roundOff !== 0) {
    rows.push(`<tr class="tax"><td></td><td class="desc">Round Off</td><td></td><td></td><td></td><td></td><td></td>
      <td class="r amt">${signed(d.roundOff)}</td></tr>`);
  }
  return `<tr class="gap"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>${rows.join('')}`;
}

function footerHtml(d: DocModel) {
  const s = d.supplier;
  const t = d.hsnTotals;
  const inter = d.interState;
  const hsnHead = inter
    ? `<tr><th rowspan="2">HSN/SAC</th><th rowspan="2">Taxable<br>Value</th><th colspan="2">Integrated Tax</th><th rowspan="2">Total<br>Tax Amount</th></tr><tr><th>Rate</th><th>Amount</th></tr>`
    : `<tr><th rowspan="2">HSN/SAC</th><th rowspan="2">Taxable<br>Value</th><th colspan="2">Central Tax</th><th colspan="2">State Tax</th><th rowspan="2">Total<br>Tax Amount</th></tr><tr><th>Rate</th><th>Amount</th><th>Rate</th><th>Amount</th></tr>`;
  const hsnRows = d.hsnSummary.map((h) => inter
    ? `<tr><td>${esc(h.hsn)}</td><td class="r">${fmtINR(h.taxable)}</td><td class="r">${h.igstRate}%</td><td class="r">${fmtINR(h.igst)}</td><td class="r">${fmtINR(h.totalTax)}</td></tr>`
    : `<tr><td>${esc(h.hsn)}</td><td class="r">${fmtINR(h.taxable)}</td><td class="r">${h.cgstRate}%</td><td class="r">${fmtINR(h.cgst)}</td><td class="r">${h.sgstRate}%</td><td class="r">${fmtINR(h.sgst)}</td><td class="r">${fmtINR(h.totalTax)}</td></tr>`).join('');
  const hsnFoot = inter
    ? `<tr><td class="r">Total</td><td class="r">${fmtINR(t.taxable)}</td><td></td><td class="r">${fmtINR(t.igst)}</td><td class="r">${fmtINR(t.totalTax)}</td></tr>`
    : `<tr><td class="r">Total</td><td class="r">${fmtINR(t.taxable)}</td><td></td><td class="r">${fmtINR(t.cgst)}</td><td></td><td class="r">${fmtINR(t.sgst)}</td><td class="r">${fmtINR(t.totalTax)}</td></tr>`;
  const cols = inter
    ? '<col style="width:34%"><col style="width:20%"><col style="width:10%"><col style="width:16%"><col style="width:20%">'
    : '<col style="width:24%"><col style="width:16%"><col style="width:8%"><col style="width:13%"><col style="width:8%"><col style="width:13%"><col style="width:18%">';
  const bank = d.showBank ? `<div class="bank">
        <div>
          <div class="lbl" style="margin-bottom:.4mm">Company's Bank Details</div>
          <div class="kv">
            <span>A/c Holder's Name</span><span>: <span class="b">${esc(s.bank.holder)}</span></span>
            <span>Bank Name</span><span>: <span class="b">${esc(s.bank.name)}</span></span>
            <span>A/c No.</span><span>: <span class="b">${esc(s.bank.account)}</span></span>
            <span>Branch &amp; IFS Code</span><span>: <span class="b">${esc(s.bank.branchIfsc)}</span></span>
            ${s.upiId ? `<span>UPI ID</span><span>: <span class="b">${esc(s.upiId)}</span></span>` : ''}
          </div>
        </div>
        ${d.upiQrDataUri ? `<div class="upi"><img src="${d.upiQrDataUri}" alt="UPI QR">Scan to pay</div>` : ''}
      </div>` : '<div></div>';
  return `<div class="foot">
    <div class="words"><span class="lbl">${esc(d.labels.amountWords)}</span><span style="font-style:italic">E. &amp; O.E</span></div>
    <div class="words-v">${esc(d.totalInWords)}</div>
    <table class="hsn"><colgroup>${cols}</colgroup><thead>${hsnHead}</thead><tbody>${hsnRows}</tbody><tfoot>${hsnFoot}</tfoot></table>
    <div class="taxwords">Tax Amount (in words) : <span class="b">${esc(d.taxInWords)}</span></div>
    <div class="bottom">
      <div class="l">
        <div class="kv"><span>Company's PAN</span><span>: <span class="b">${esc(s.pan)}</span></span></div>
        <div><div class="decl-h">Declaration</div><div class="decl">${esc(s.declaration)}</div></div>
      </div>
      ${bank}
      <div class="custsign">${esc(d.labels.counterSign)}</div>
      <div class="sign">
        <div class="b">for ${esc(s.name)}</div>
        ${d.signatureDataUri ? `<img class="sig" src="${d.signatureDataUri}" alt="Signature">` : '<div style="height:11mm"></div>'}
        <div>Authorised Signatory</div>
      </div>
    </div>
  </div>`;
}

/** Full HTML for a document (all requested copies). Sets window.__invoiceReady when laid out. */
export function buildDocumentHtml(d: DocModel): string {
  const pieces = {
    header: headerHtml(d),
    rows: d.lines.map(itemRow),
    taxRows: taxRowsHtml(d),
    footer: footerHtml(d),
    totalRow: `<tr><td></td><td class="r">Total</td><td></td><td class="r">${d.totalQty} ${esc(d.qtyUnit ?? 'pcs')}</td><td></td><td></td><td></td><td class="r" style="white-space:nowrap">&#8377; ${fmtINR(d.total)}</td></tr>`,
    copies: d.copies.length ? d.copies : [''],
    title: esc(d.title),
    jurisdiction: esc(d.supplier.jurisdiction),
    logoFooter: LOGO,
    watermark: d.watermark ? esc(d.watermark) : null,
  };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(d.title)} ${esc(d.number)}</title>
<style>${fontCss}</style>
<style>${css}</style>
</head><body>
<div id="root"></div>
<script>
const P = ${JSON.stringify(pieces).replace(/</g, '\\u003c')};
const colgroup = '<colgroup><col style="width:4.5%"><col style="width:47.5%"><col style="width:9%"><col style="width:8%"><col style="width:9%"><col style="width:4.5%"><col style="width:5.5%"><col style="width:11.5%"></colgroup>';
const thead = '<thead><tr><th>Sl<br>No.</th><th>Description of Goods</th><th>HSN/SAC</th><th>Quantity</th><th>Rate</th><th>per</th><th>Disc. %</th><th>Amount</th></tr></thead>';
const filler = '<tr class="filler"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';

function pageEl(copyLabel, rows, isLast) {
  const sec = document.createElement('section');
  sec.className = 'page';
  sec.innerHTML =
    (P.watermark ? '<div class="watermark"><span>' + P.watermark + '</span></div>' : '') + '<div class="topbar"><div><img class="logo" src="' + P.logoFooter + '" alt="Kush Enterprise"></div><div class="title">' + P.title + '</div><div class="copy">' + (copyLabel ? '(' + copyLabel + ')' : '') + '</div></div>' +
    '<div class="box">' + P.header +
      '<div class="items"><table class="lines measuring">' + colgroup + thead +
        '<tbody>' + rows.join('') + (isLast ? P.taxRows : '') + filler + '</tbody>' +
        '<tfoot>' + (isLast ? P.totalRow : '<tr><td colspan="8" class="r continued">continued to page <span class="nextpg"></span> &hellip;</td></tr>') + '</tfoot>' +
      '</table></div>' +
      (isLast ? P.footer : '') +
    '</div>' +
    (isLast ? '<div class="computer">This is a Computer Generated Invoice</div>' : '') +
    '<div class="pagefoot"><img src="' + P.logoFooter + '" alt=""><div>SUBJECT TO ' + P.jurisdiction.toUpperCase() + ' JURISDICTION</div><div class="pg"></div></div>';
  return sec;
}
const fits = (sec) => {
  const box = sec.querySelector('.items');
  return sec.querySelector('table.lines').offsetHeight <= box.clientHeight + 0.5;
};

const root = document.getElementById('root');
// Fonts load lazily, so request every face up front; pagination must measure real glyphs.
const faces = ['400', '600', '700', 'italic 400', 'italic 600'];
Promise.all(faces.map((f) => document.fonts.load(f + ' 10px Inter', 'Aa1\u20B9'))).then(() => document.fonts.ready).then(() => {
for (const copy of P.copies) {
  const pages = [];
  let remaining = P.rows.slice();
  while (true) {
    // Try to finish here: all remaining rows + tax lines + totals + footer.
    let sec = pageEl(copy, remaining, true);
    root.appendChild(sec);
    if (fits(sec)) { pages.push(sec); break; }
    root.removeChild(sec);
    // Otherwise fill this page with as many rows as fit; at least one row must move on
    // so the final page carries items above the totals (Tally behaviour).
    let n = Math.min(remaining.length - 1, remaining.length);
    while (n > 1) {
      sec = pageEl(copy, remaining.slice(0, n), false);
      root.appendChild(sec);
      if (fits(sec)) break;
      root.removeChild(sec);
      n--;
    }
    if (n <= 1) { sec = pageEl(copy, remaining.slice(0, 1), false); root.appendChild(sec); n = 1; }
    pages.push(sec);
    remaining = remaining.slice(n);
  }
  pages.forEach((sec, i) => {
    // Stretch the column rules down to the totals row: give the filler row the exact slack.
    const table = sec.querySelector('table.lines');
    const slack = sec.querySelector('.items').clientHeight - table.offsetHeight;
    table.classList.remove('measuring');
    const fillTd = sec.querySelector('tr.filler td');
    fillTd.style.height = Math.max(0, Math.floor(slack)) + 'px';
    const over = table.offsetHeight - sec.querySelector('.items').clientHeight;
    if (over > 0) fillTd.style.height = Math.max(0, Math.floor(slack - over)) + 'px';
    sec.querySelector('.pg').textContent = 'Page ' + (i + 1) + ' of ' + pages.length;
    const nx = sec.querySelector('.nextpg'); if (nx) nx.textContent = i + 2;
  });
}
window.__invoiceReady = true;
});
</script>
</body></html>`;
}
