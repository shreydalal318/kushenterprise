/**
 * e-invoice and e-way bill readiness. Builds the government JSON from the stored documents so it
 * can be uploaded on the IRP / e-way bill portal (or sent through a GSP later), and lists anything
 * that would be rejected before you try.
 */
import { TRPCError } from '@trpc/server';
import { gstinError, round2 } from '@kush/core';
import type { Db } from '@kush/db';
import { isoDay, num } from '../num';

type Party = { name: string; attn?: string | null; addressLines: string[]; gstin?: string | null; stateCode: string; phone?: string | null; email?: string | null };
const dmy = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : undefined);
const placeholder = (v: string | null | undefined) => !v || /^\[.*\]$/.test(v.trim());
const pinOf = (p: Party) => { const m = p.addressLines.join(' ').match(/\b(\d{6})\b/); return m ? Number(m[1]) : null; };
const cityOf = (p: Party) => { const last = p.addressLines.at(-1) ?? ''; return last.replace(/\s*-\s*\d{6}.*$/, '').trim() || last; };
const UNITS: Record<string, string> = { pcs: 'PCS', nos: 'NOS', box: 'BOX', bottle: 'BTL', btl: 'BTL', set: 'SET', pack: 'PAC', kit: 'KIT', vial: 'VIA', ml: 'MLT', ltr: 'LTR', kg: 'KGS', gm: 'GMS', pair: 'PRS' };
const uqc = (u: string) => UNITS[u.toLowerCase()] ?? 'OTH';
const clip = (s: string | undefined | null, n: number) => (s ?? '').slice(0, n) || undefined;

function party(p: Party, role: 'Seller' | 'Buyer', issues: string[]) {
  if (placeholder(p.gstin)) issues.push(`${role} GSTIN is missing${role === 'Seller' ? ' (Settings → Company)' : ''}`);
  else { const e = gstinError(p.gstin!); if (e) issues.push(`${role} GSTIN: ${e}`); }
  if (!pinOf(p)) issues.push(`${role} PIN code is missing from the address`);
  if (placeholder(p.addressLines[0])) issues.push(`${role} address is missing`);
  return { Gstin: p.gstin ?? '', LglNm: clip(p.name, 100)!, Addr1: clip(p.addressLines[0], 100) ?? '', Addr2: p.addressLines.length > 2 ? clip(p.addressLines[1], 100) : undefined, Loc: clip(cityOf(p), 50) ?? '', Pin: pinOf(p) ?? 0, Stcd: p.stateCode };
}

/** IRP e-invoice JSON (schema 1.1) for a tax invoice or credit note to a registered buyer. */
export async function einvoiceJson(db: Db, kind: 'invoice' | 'credit-note', id: string) {
  const doc = kind === 'invoice'
    ? await db.invoice.findUnique({ where: { id }, include: { lines: { orderBy: { sl: 'asc' } } } })
    : await db.creditNote.findUnique({ where: { id }, include: { lines: { orderBy: { sl: 'asc' } }, invoice: { select: { number: true, date: true } } } });
  if (!doc) throw new TRPCError({ code: 'NOT_FOUND' });
  const issues: string[] = [];
  if ('status' in doc && doc.status === 'CANCELLED') issues.push('The invoice is cancelled');
  if (doc.number.length > 16) issues.push(`Document number ${doc.number} is longer than 16 characters`);
  const seller = doc.supplierSnapshot as unknown as Party;
  const buyer = doc.buyerSnapshot as unknown as Party;
  if (!buyer.gstin) issues.push('The buyer has no GSTIN: e-invoicing applies only to B2B documents');
  const consignee = ('consigneeSnapshot' in doc ? doc.consigneeSnapshot : null) as Party | null;
  const ship = consignee && (consignee.addressLines.join('|') !== buyer.addressLines.join('|') || consignee.stateCode !== buyer.stateCode) ? consignee : null;
  const items = doc.lines.map((l, i) => {
    const qty = l.qty;
    const rate = num(l.rate);
    const gross = round2(qty * rate);
    const ass = num(l.amount);
    const tax = num(l.cgstAmount) + num(l.sgstAmount) + num(l.igstAmount);
    return {
      SlNo: String(i + 1), PrdDesc: clip(l.description, 300), IsServc: 'N', HsnCd: l.hsnCode, Qty: qty, Unit: uqc(l.unit), UnitPrice: rate, TotAmt: gross, Discount: round2(gross - ass), AssAmt: ass,
      GstRt: num(l.gstRate), IgstAmt: num(l.igstAmount), CgstAmt: num(l.cgstAmount), SgstAmt: num(l.sgstAmount), TotItemVal: round2(ass + tax),
      ...(l.batchNo && l.batchNo !== 'NA' ? { BchDtls: { Nm: clip(l.batchNo, 20), ExpDt: dmy(isoDay(l.expiryDate)) } } : {}),
    };
  });
  for (const it of items) if (!/^\d{4,8}$/.test(it.HsnCd)) issues.push(`Line ${it.SlNo}: HSN ${it.HsnCd} must be 4–8 digits`);
  const json = {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: kind === 'invoice' ? 'INV' : 'CRN', No: doc.number, Dt: dmy(isoDay(doc.date))! },
    SellerDtls: { ...party(seller, 'Seller', issues), Ph: clip(seller.phone?.replace(/\D/g, ''), 12), Em: clip(seller.email, 100) },
    BuyerDtls: { ...party(buyer, 'Buyer', issues), Pos: doc.placeOfSupply },
    ...(ship ? { ShipDtls: { Gstin: ship.gstin ?? undefined, LglNm: clip(ship.name, 100), Addr1: clip(ship.addressLines[0], 100), Loc: clip(cityOf(ship), 50), Pin: pinOf(ship) ?? undefined, Stcd: ship.stateCode } } : {}),
    ItemList: items,
    ValDtls: { AssVal: num(doc.taxableTotal), CgstVal: num(doc.cgstTotal), SgstVal: num(doc.sgstTotal), IgstVal: num(doc.igstTotal), RndOffAmt: num(doc.roundOff), TotInvVal: num(doc.grandTotal) },
    ...('invoice' in doc && doc.invoice ? { RefDtls: { PrecDocDtls: [{ InvNo: doc.invoice.number, InvDt: dmy(isoDay(doc.invoice.date))! }] } } : {}),
  };
  return { json, issues: [...new Set(issues)], number: doc.number, irn: doc.irn };
}

export interface EwayTransport { transMode: 1 | 2 | 3 | 4; distanceKm: number; transporterId?: string | null; transporterName?: string | null; vehicleNo?: string | null; transDocNo?: string | null; transDocDate?: string | null }

/** E-way bill JSON in the portal's bulk-upload format (Part A, plus Part B when a vehicle is given). */
export async function ewayJson(db: Db, invoiceId: string, t: EwayTransport) {
  const i = await db.invoice.findUnique({ where: { id: invoiceId }, include: { lines: { orderBy: { sl: 'asc' } } } });
  if (!i) throw new TRPCError({ code: 'NOT_FOUND' });
  const issues: string[] = [];
  if (i.status === 'CANCELLED') issues.push('The invoice is cancelled');
  const seller = i.supplierSnapshot as unknown as Party;
  const buyer = i.buyerSnapshot as unknown as Party;
  const ship = (i.consigneeSnapshot as unknown as Party) ?? buyer;
  if (placeholder(seller.gstin) || gstinError(seller.gstin ?? '')) issues.push('Company GSTIN is missing or invalid (Settings → Company)');
  if (!pinOf(seller)) issues.push('Company PIN code is missing');
  if (!pinOf(ship)) issues.push('Delivery address PIN code is missing');
  if (!(t.distanceKm >= 1 && t.distanceKm <= 4000)) issues.push('Distance must be between 1 and 4000 km');
  if (t.transporterId && gstinError(t.transporterId)) issues.push('Transporter ID must be a valid GSTIN / TRANSIN');
  if (t.vehicleNo && !/^[A-Z]{2}[0-9A-Z]{1,3}[A-Z]{0,3}[0-9]{4}$/.test(t.vehicleNo.replace(/[\s-]/g, '').toUpperCase())) issues.push('Vehicle number looks wrong (e.g. GJ01AB1234)');
  const byHsn = new Map<string, { qty: number; taxable: number; rate: number; unit: string; desc: string }>();
  for (const l of i.lines) {
    const k = `${l.hsnCode}|${num(l.gstRate)}`;
    const cur = byHsn.get(k) ?? { qty: 0, taxable: 0, rate: num(l.gstRate), unit: uqc(l.unit), desc: l.description };
    cur.qty += l.qty; cur.taxable += num(l.amount);
    byHsn.set(k, cur);
  }
  const inter = i.taxType === 'INTER_STATE';
  const items = [...byHsn.entries()].map(([k, v], n) => ({
    itemNo: n + 1, productName: clip(v.desc, 100), productDesc: clip(v.desc, 100), hsnCode: Number(k.split('|')[0]), quantity: v.qty, qtyUnit: v.unit, taxableAmount: round2(v.taxable),
    sgstRate: inter ? 0 : v.rate / 2, cgstRate: inter ? 0 : v.rate / 2, igstRate: inter ? v.rate : 0, cessRate: 0, cessNonadvol: 0,
  }));
  const main = [...byHsn.entries()].sort((a, b) => b[1].taxable - a[1].taxable)[0];
  const bill = {
    userGstin: seller.gstin, supplyType: 'O', subSupplyType: 1, subSupplyDesc: '', docType: 'INV', docNo: i.number, docDate: dmy(isoDay(i.date)),
    transType: ship !== buyer && ship.addressLines.join('|') !== buyer.addressLines.join('|') ? 2 : 1,
    fromGstin: seller.gstin, fromTrdName: clip(seller.name, 100), fromAddr1: clip(seller.addressLines[0], 120), fromAddr2: clip(seller.addressLines[1], 120), fromPlace: clip(cityOf(seller), 50), fromPincode: pinOf(seller), fromStateCode: Number(seller.stateCode), actualFromStateCode: Number(seller.stateCode),
    toGstin: buyer.gstin || 'URP', toTrdName: clip(buyer.name, 100), toAddr1: clip(ship.addressLines[0], 120), toAddr2: clip(ship.addressLines[1], 120), toPlace: clip(cityOf(ship), 50), toPincode: pinOf(ship), toStateCode: Number(buyer.stateCode), actualToStateCode: Number(ship.stateCode),
    totalValue: num(i.taxableTotal), cgstValue: num(i.cgstTotal), sgstValue: num(i.sgstTotal), igstValue: num(i.igstTotal), cessValue: 0, cessNonAdvolValue: 0, OthValue: num(i.roundOff), totInvValue: num(i.grandTotal),
    transMode: t.transMode, transDistance: String(Math.round(t.distanceKm)), transporterId: t.transporterId?.toUpperCase() ?? '', transporterName: t.transporterName ?? '',
    transDocNo: t.transDocNo ?? '', transDocDate: t.transDocDate ? dmy(t.transDocDate) : '', vehicleNo: t.vehicleNo?.replace(/[\s-]/g, '').toUpperCase() ?? '', vehicleType: t.vehicleNo ? 'R' : '',
    mainHsnCode: main ? Number(main[0].split('|')[0]) : undefined, itemList: items,
  };
  return { json: { version: '1.0.0621', billLists: [bill] }, issues, number: i.number, ewayBillNo: i.ewayBillNo };
}
