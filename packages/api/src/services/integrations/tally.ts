/**
 * Tally Prime XML export (Gateway of Tally → Import → Vouchers / Masters).
 *
 * Vouchers are written in accounting-invoice mode (party, sales ledger per GST rate, output tax
 * ledgers, round off), so they import without needing stock items in Tally. Each voucher carries
 * a stable REMOTEID, so importing the same period again updates rather than duplicates.
 * Tally sign convention: debits are negative amounts, credits positive; every voucher sums to zero.
 */
import { round2, stateByCode } from '@kush/core';
import type { Db } from '@kush/db';
import { dayToDate, isoDay, num } from '../num';
import { getSettings } from '../settings';
import { integrationsOf, ledgerName, type Integrations } from './config';

export interface TallyRange { from: string; to: string }
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const amt = (n: number) => round2(n).toFixed(2);
const tdate = (iso: string) => iso.replace(/-/g, '');
const tag = (name: string, v: unknown) => (v == null || v === '' ? '' : `<${name}>${esc(v)}</${name}>`);

function envelope(report: 'Vouchers' | 'All Masters', company: string, messages: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC><REPORTNAME>${report}</REPORTNAME>${company ? `<STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES>` : ''}</REQUESTDESC>
   <REQUESTDATA>
${messages.map((m) => `    <TALLYMESSAGE xmlns:UDF="TallyUDF">${m}</TALLYMESSAGE>`).join('\n')}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>
`;
}

interface Entry { ledger: string; amount: number; party?: boolean; bills?: { name: string; type: 'New Ref' | 'Agst Ref' | 'On Account'; amount: number; creditDays?: number }[] }
function entries(list: Entry[]) {
  return list.filter((e) => Math.abs(e.amount) >= 0.005).map((e) => `<LEDGERENTRIES.LIST>${tag('LEDGERNAME', e.ledger)}<ISDEEMEDPOSITIVE>${e.amount < 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>${e.party ? '<ISPARTYLEDGER>Yes</ISPARTYLEDGER>' : ''}<AMOUNT>${amt(e.amount)}</AMOUNT>${(e.bills ?? []).map((b) => `<BILLALLOCATIONS.LIST>${b.type === 'On Account' ? '' : tag('NAME', b.name)}<BILLTYPE>${b.type}</BILLTYPE>${b.creditDays != null ? `<BILLCREDITPERIOD>${b.creditDays} Days</BILLCREDITPERIOD>` : ''}<AMOUNT>${amt(b.amount)}</AMOUNT></BILLALLOCATIONS.LIST>`).join('')}</LEDGERENTRIES.LIST>`).join('');
}

/**
 * Split a document's stored header totals by GST rate. Taxable values are exact per rate; the tax
 * per rate is computed and the largest group absorbs any paise difference, so the voucher always
 * equals the printed invoice.
 */
function byRate(lines: { gstRate: unknown; amount: unknown }[], head: { cgst: number; sgst: number; igst: number }) {
  const m = new Map<number, number>();
  for (const l of lines) m.set(num(l.gstRate as never), (m.get(num(l.gstRate as never)) ?? 0) + num(l.amount as never));
  const groups = [...m.entries()].map(([rate, taxable]) => ({ rate, taxable: round2(taxable), cgst: head.cgst ? round2((taxable * rate) / 200) : 0, sgst: head.sgst ? round2((taxable * rate) / 200) : 0, igst: head.igst ? round2((taxable * rate) / 100) : 0 })).sort((a, b) => b.taxable - a.taxable);
  if (groups[0]) {
    for (const k of ['cgst', 'sgst', 'igst'] as const) groups[0][k] = round2(groups[0][k] + head[k] - groups.reduce((t, g) => t + g[k], 0));
  }
  return groups;
}

async function partyInfo(db: Db, ids: string[]) {
  const cs = await db.customer.findMany({ where: { id: { in: ids } }, include: { addresses: { where: { kind: 'BILLING' }, orderBy: { isDefault: 'desc' }, take: 1 } } });
  return new Map(cs.map((c) => [c.id, c]));
}

/** Ledger masters: one per customer (Sundry Debtors, bill-wise, GST details) plus the sales and tax ledgers used. */
export async function tallyMastersXml(db: Db, r: TallyRange) {
  const s = await getSettings(db);
  const cfg = integrationsOf(s).tally;
  const inv = await db.invoice.findMany({ where: { date: { gte: dayToDate(r.from)!, lte: dayToDate(r.to)! } }, select: { customerId: true, taxType: true, lines: { select: { gstRate: true } } } });
  const cn = await db.creditNote.findMany({ where: { date: { gte: dayToDate(r.from)!, lte: dayToDate(r.to)! } }, select: { customerId: true, lines: { select: { gstRate: true } } } });
  const pay = await db.payment.findMany({ where: { date: { gte: dayToDate(r.from)!, lte: dayToDate(r.to)! } }, select: { customerId: true } });
  const parties = await partyInfo(db, [...new Set([...inv, ...cn, ...pay].map((x) => x.customerId))]);
  const msgs: string[] = [];
  for (const c of parties.values()) {
    const a = c.addresses[0];
    msgs.push(`<LEDGER NAME="${esc(c.name)}" ACTION="Create"><NAME.LIST><NAME>${esc(c.name)}</NAME></NAME.LIST>${tag('PARENT', cfg.customerGroup)}<ISBILLWISEON>Yes</ISBILLWISEON><BILLCREDITPERIOD>${c.paymentTermsDays} Days</BILLCREDITPERIOD>${a ? `<ADDRESS.LIST TYPE="String">${[a.line1, a.line2, `${a.city} - ${a.pincode}`].filter(Boolean).map((x) => tag('ADDRESS', x)).join('')}</ADDRESS.LIST>${tag('PINCODE', a.pincode)}` : ''}${tag('LEDSTATENAME', stateByCode(c.stateCode)?.name)}<COUNTRYNAME>India</COUNTRYNAME><GSTREGISTRATIONTYPE>${c.gstin ? 'Regular' : 'Unregistered/Consumer'}</GSTREGISTRATIONTYPE>${tag('PARTYGSTIN', c.gstin)}${tag('INCOMETAXNUMBER', c.pan)}${tag('LEDGERMOBILE', c.mobile)}${tag('EMAIL', c.email)}</LEDGER>`);
  }
  const rates = new Set<number>();
  const inter = new Set<number>();
  for (const i of inv) for (const l of i.lines) { const rt = num(l.gstRate); rates.add(rt); if (i.taxType === 'INTER_STATE') inter.add(rt); }
  for (const c of cn) for (const l of c.lines) rates.add(num(l.gstRate));
  const ledger = (name: string, parent: string, extra = '') => `<LEDGER NAME="${esc(name)}" ACTION="Create"><NAME.LIST><NAME>${esc(name)}</NAME></NAME.LIST>${tag('PARENT', parent)}${extra}</LEDGER>`;
  const duty = (name: string, head: string, rate: number) => ledger(name, 'Duties & Taxes', `<TAXTYPE>GST</TAXTYPE><GSTDUTYHEAD>${head}</GSTDUTYHEAD><RATEOFTAXCALCULATION>${rate}</RATEOFTAXCALCULATION>`);
  for (const rt of [...rates].sort((a, b) => a - b)) {
    msgs.push(ledger(ledgerName(cfg.salesLedger, rt), 'Sales Accounts', '<AFFECTSSTOCK>No</AFFECTSSTOCK>'));
    msgs.push(ledger(ledgerName(cfg.salesReturnLedger, rt), 'Sales Accounts', '<AFFECTSSTOCK>No</AFFECTSSTOCK>'));
    if (inter.has(rt) && cfg.interstateSalesLedger !== cfg.salesLedger) msgs.push(ledger(ledgerName(cfg.interstateSalesLedger, rt), 'Sales Accounts', '<AFFECTSSTOCK>No</AFFECTSSTOCK>'));
    if (rt > 0) {
      msgs.push(duty(ledgerName(cfg.cgstLedger, rt), 'Central Tax', rt / 2));
      msgs.push(duty(ledgerName(cfg.sgstLedger, rt), 'State Tax', rt / 2));
      msgs.push(duty(ledgerName(cfg.igstLedger, rt), 'Integrated Tax', rt));
    }
  }
  msgs.push(ledger(cfg.roundOffLedger, 'Indirect Expenses'));
  return envelope('All Masters', cfg.companyName, [...new Set(msgs)]);
}

/** Sales, credit note and receipt vouchers for a period. */
export async function tallyVouchersXml(db: Db, r: TallyRange, kinds: { sales?: boolean; creditNotes?: boolean; receipts?: boolean } = { sales: true, creditNotes: true, receipts: true }) {
  const s = await getSettings(db);
  const cfg = integrationsOf(s).tally;
  const range = { gte: dayToDate(r.from)!, lte: dayToDate(r.to)! };
  const [inv, cn, pay] = await Promise.all([
    kinds.sales ? db.invoice.findMany({ where: { date: range }, orderBy: [{ date: 'asc' }, { number: 'asc' }], include: { lines: { select: { gstRate: true, amount: true } } } }) : [],
    kinds.creditNotes ? db.creditNote.findMany({ where: { date: range }, orderBy: [{ date: 'asc' }, { number: 'asc' }], include: { lines: { select: { gstRate: true, amount: true } }, invoice: { select: { number: true } } } }) : [],
    kinds.receipts ? db.payment.findMany({ where: { date: range }, orderBy: [{ date: 'asc' }, { number: 'asc' }], include: { allocations: { include: { invoice: { select: { number: true } } } } } }) : [],
  ]);
  const parties = await partyInfo(db, [...new Set([...inv, ...cn, ...pay].map((x) => x.customerId))]);
  const msgs: string[] = [];
  const balance: { number: string; sum: number }[] = [];

  for (const i of inv) {
    const c = parties.get(i.customerId)!;
    const d = isoDay(i.date)!;
    const head = `<DATE>${tdate(d)}</DATE><EFFECTIVEDATE>${tdate(d)}</EFFECTIVEDATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>${tag('VOUCHERNUMBER', i.number)}${tag('PARTYLEDGERNAME', c.name)}`;
    if (i.status === 'CANCELLED') {
      msgs.push(`<VOUCHER REMOTEID="kush-inv-${i.id}" VCHTYPE="Sales" ACTION="Create">${head}<ISCANCELLED>Yes</ISCANCELLED>${tag('NARRATION', `Cancelled: ${i.cancelReason ?? ''}`)}</VOUCHER>`);
      continue;
    }
    const total = num(i.grandTotal);
    const groups = byRate(i.lines, { cgst: num(i.cgstTotal), sgst: num(i.sgstTotal), igst: num(i.igstTotal) });
    const sales = i.taxType === 'INTER_STATE' ? cfg.interstateSalesLedger : cfg.salesLedger;
    const list: Entry[] = [
      { ledger: c.name, amount: -total, party: true, bills: [{ name: i.number, type: 'New Ref', amount: -total, creditDays: c.paymentTermsDays }] },
      ...groups.map((g) => ({ ledger: ledgerName(sales, g.rate), amount: g.taxable })),
      ...groups.flatMap((g) => [{ ledger: ledgerName(cfg.cgstLedger, g.rate), amount: g.cgst }, { ledger: ledgerName(cfg.sgstLedger, g.rate), amount: g.sgst }, { ledger: ledgerName(cfg.igstLedger, g.rate), amount: g.igst }]),
      { ledger: cfg.roundOffLedger, amount: num(i.roundOff) },
    ];
    balance.push({ number: i.number, sum: round2(list.reduce((t, e) => t + e.amount, 0)) });
    const buyer = (i.buyerSnapshot ?? {}) as { gstin?: string | null };
    msgs.push(`<VOUCHER REMOTEID="kush-inv-${i.id}" VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">${head}<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW><ISINVOICE>Yes</ISINVOICE>${tag('PARTYNAME', c.name)}${tag('BASICBUYERNAME', c.name)}${tag('PARTYGSTIN', buyer.gstin)}${tag('PLACEOFSUPPLY', stateByCode(i.placeOfSupply)?.name)}${tag('STATENAME', stateByCode(i.placeOfSupply)?.name)}${tag('REFERENCE', i.buyersOrderNo)}${tag('BASICSHIPDOCUMENTNO', i.dispatchDocNo)}${tag('BASICSHIPPEDBY', i.dispatchedThrough)}${tag('IRN', i.irn)}${tag('IRNACKNO', i.ackNo)}${tag('EWAYBILLNO', i.ewayBillNo)}${tag('NARRATION', `Tax invoice ${i.number}`)}${entries(list)}</VOUCHER>`);
  }

  for (const n of cn) {
    const c = parties.get(n.customerId)!;
    const d = isoDay(n.date)!;
    const total = num(n.grandTotal);
    const groups = byRate(n.lines, { cgst: num(n.cgstTotal), sgst: num(n.sgstTotal), igst: num(n.igstTotal) });
    const list: Entry[] = [
      { ledger: c.name, amount: total, party: true, bills: [n.invoice ? { name: n.invoice.number, type: 'Agst Ref', amount: total } : { name: n.number, type: 'On Account', amount: total }] },
      ...groups.map((g) => ({ ledger: ledgerName(cfg.salesReturnLedger, g.rate), amount: -g.taxable })),
      ...groups.flatMap((g) => [{ ledger: ledgerName(cfg.cgstLedger, g.rate), amount: -g.cgst }, { ledger: ledgerName(cfg.sgstLedger, g.rate), amount: -g.sgst }, { ledger: ledgerName(cfg.igstLedger, g.rate), amount: -g.igst }]),
      { ledger: cfg.roundOffLedger, amount: -num(n.roundOff) },
    ];
    balance.push({ number: n.number, sum: round2(list.reduce((t, e) => t + e.amount, 0)) });
    msgs.push(`<VOUCHER REMOTEID="kush-cn-${n.id}" VCHTYPE="Credit Note" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${tdate(d)}</DATE><EFFECTIVEDATE>${tdate(d)}</EFFECTIVEDATE><VOUCHERTYPENAME>Credit Note</VOUCHERTYPENAME>${tag('VOUCHERNUMBER', n.number)}${tag('PARTYLEDGERNAME', c.name)}<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW><ISINVOICE>Yes</ISINVOICE>${tag('PLACEOFSUPPLY', stateByCode(n.placeOfSupply)?.name)}${tag('REFERENCE', n.invoice?.number)}${tag('IRN', n.irn)}${tag('NARRATION', `Credit note ${n.number}${n.invoice ? ` against ${n.invoice.number}` : ''}: ${n.reason}`)}${entries(list)}</VOUCHER>`);
  }

  for (const p of pay) {
    const c = parties.get(p.customerId)!;
    const d = isoDay(p.date)!;
    const amount = num(p.amount);
    const allocated = round2(p.allocations.reduce((t, a) => t + num(a.amount), 0));
    const bills: Entry['bills'] = [...p.allocations.map((a) => ({ name: a.invoice.number, type: 'Agst Ref' as const, amount: num(a.amount) })), ...(amount - allocated > 0.004 ? [{ name: p.number, type: 'On Account' as const, amount: round2(amount - allocated) }] : [])];
    const list: Entry[] = [{ ledger: c.name, amount, party: true, bills }, { ledger: p.mode === 'CASH' ? cfg.cashLedger : cfg.bankLedger, amount: -amount }];
    balance.push({ number: p.number, sum: round2(list.reduce((t, e) => t + e.amount, 0)) });
    msgs.push(`<VOUCHER REMOTEID="kush-rcpt-${p.id}" VCHTYPE="Receipt" ACTION="Create"><DATE>${tdate(d)}</DATE><EFFECTIVEDATE>${tdate(d)}</EFFECTIVEDATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>${tag('VOUCHERNUMBER', p.number)}${tag('PARTYLEDGERNAME', c.name)}${tag('NARRATION', `Receipt ${p.number} (${p.mode.replace('_', '/')})${p.reference ? ` ${p.reference}` : ''}`)}${entries(list)}</VOUCHER>`);
  }

  const unbalanced = balance.filter((b) => Math.abs(b.sum) > 0.004);
  if (unbalanced.length) throw new Error(`Tally export stopped: these vouchers do not balance: ${unbalanced.map((b) => `${b.number} (${b.sum})`).join(', ')}`);
  return { xml: envelope('Vouchers', cfg.companyName, msgs), counts: { sales: inv.length, creditNotes: cn.length, receipts: pay.length } };
}

export type { Integrations };
