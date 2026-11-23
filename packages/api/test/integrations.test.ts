import { addDays, gstinCheckChar, istDateString } from '@kush/core';
import { Prisma, prisma } from '@kush/db';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { sendWhatsApp } from '../src/notify';
import { renderDocument } from '../src/services/sales/documents';
import { shareToken, verifyShareToken } from '../src/services/integrations/share';
import { tallyMastersXml, tallyVouchersXml } from '../src/services/integrations/tally';
import { callerFor, makeUser, randomMobile, tag } from './helpers';

const today = istDateString();
const gstin = (state: string, pan: string) => `${state}${pan}1Z${gstinCheckChar(`${state}${pan}1Z`)}`;
let owner: Awaited<ReturnType<typeof makeUser>>;
let gel: { v: string };
let reg: string; // registered, same state
let unreg: string; // unregistered, other state
const ids: { intra?: string; inter?: string; cancelled?: string; cn?: string; pay?: string } = {};
const api = async (u = owner) => (await callerFor(u.id)).api;

beforeAll(async () => {
  for (const s of [{ code: '24', name: 'Gujarat', shortCode: 'GJ' }, { code: '27', name: 'Maharashtra', shortCode: 'MH' }]) await prisma.state.upsert({ where: { code: s.code }, create: s, update: {} });
  owner = await makeUser('OWNER');
  const a = await api();
  const s = await a.settings.get();
  await prisma.companySettings.update({ where: { id: 'company' }, data: { integrationConfig: Prisma.DbNull } }); // default ledger names
  await a.settings.updateCompany({ legalName: s.legalName, addressLine1: '12 Relief Road', addressLine2: '', city: 'Ahmedabad', pincode: '380001', stateCode: '24', phone: '', email: '', gstin: '[GSTIN]', pan: '[PAN]', drugLicenceNo: 'DL-1', jurisdictionCity: 'Ahmedabad' });
  const categoryId = (await a.settings.createCategory({ name: `Int ${tag()}` })).id;
  const g = await a.products.create({ code: `IG${tag()}`.toUpperCase(), name: 'Integration Gel', categoryId, hsnCode: '30049099', gstRate: 12, unit: 'pcs', defaultRate: 500, mrp: 800, purchaseCost: 300 });
  gel = { v: (await a.products.get({ id: g.id })).variants[0]!.id };
  const sup = (await a.suppliers.create({ name: `IS ${tag()}`, addressLine1: 'x', city: 'Ahmedabad', stateCode: '24', paymentTermsDays: 30 })).id;
  await a.inventory.createGrn({ supplierId: sup, date: today, lines: [{ variantId: gel.v, batchNo: `I${tag()}`, expiryDate: addDays(today, 500), qty: 100, rate: 300 }] });
  reg = (await a.customers.create({ type: 'HOSPITAL', name: `Tally Hospital ${tag()}`, stateCode: '24', gstin: gstin('24', 'AAACT1234T'), mobile: randomMobile(), paymentTermsDays: 30, billingAddress: { line1: 'Ring Road', city: 'Surat', pincode: '395001', stateCode: '24' } })).id;
  unreg = (await a.customers.create({ type: 'DOCTOR', name: `Dr Tally ${tag()}`, stateCode: '27', paymentTermsDays: 7, billingAddress: { line1: 'FC Road', city: 'Pune', pincode: '411004', stateCode: '27' } })).id;
  ids.intra = (await a.invoices.create({ customerId: reg, date: today, lines: [{ variantId: gel.v, qty: 7, rate: 499.5 }] })).id; // odd paise → round off
  ids.inter = (await a.invoices.create({ customerId: unreg, date: today, lines: [{ variantId: gel.v, qty: 3, rate: 500 }] })).id;
  ids.cancelled = (await a.invoices.create({ customerId: reg, date: today, lines: [{ variantId: gel.v, qty: 1, rate: 500 }] })).id;
  await a.invoices.cancel({ id: ids.cancelled, reason: 'Wrong item' });
  const inv = await a.invoices.get({ id: ids.intra });
  ids.cn = (await a.creditNotes.create({ invoiceId: ids.intra, date: today, reason: 'One returned', restock: true, lines: [{ invoiceLineId: inv.lines[0]!.id, qty: 1, serialNos: [] }] })).id;
  ids.pay = (await a.payments.record({ customerId: reg, date: today, amount: 5000, mode: 'NEFT_RTGS', reference: `UTR${tag()}`, allocations: [{ invoiceId: ids.intra, amount: 3000 }] })).id;
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Tally export', () => {
  it('writes balanced sales, credit note and receipt vouchers with stable ids and configured ledger names', async () => {
    const { xml, counts } = await tallyVouchersXml(prisma, { from: today, to: today }); // throws if any voucher does not balance
    expect(counts.sales).toBeGreaterThanOrEqual(3);
    expect(xml.split('<VOUCHER ').length).toBe(xml.split('</VOUCHER>').length);
    expect(xml).toContain(`REMOTEID="kush-inv-${ids.intra}" VCHTYPE="Sales"`);
    expect(xml).toMatch(new RegExp(`kush-inv-${ids.cancelled}[^]*?<ISCANCELLED>Yes</ISCANCELLED>`));
    expect(xml).toContain(`REMOTEID="kush-cn-${ids.cn}" VCHTYPE="Credit Note"`);
    expect(xml).toContain('<LEDGERNAME>Sales @ 12%</LEDGERNAME>');
    expect(xml).toContain('<LEDGERNAME>Output CGST @ 6%</LEDGERNAME>');
    expect(xml).toContain('<LEDGERNAME>Interstate Sales @ 12%</LEDGERNAME>');
    expect(xml).toContain('<LEDGERNAME>Output IGST @ 12%</LEDGERNAME>');
    const receipt = xml.slice(xml.indexOf(`kush-rcpt-${ids.pay}`), xml.indexOf('</VOUCHER>', xml.indexOf(`kush-rcpt-${ids.pay}`)));
    expect(receipt).toContain('<BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>3000.00</AMOUNT>');
    expect(receipt).toContain('<BILLTYPE>On Account</BILLTYPE><AMOUNT>2000.00</AMOUNT>');
    expect(receipt).toContain('<AMOUNT>-5000.00</AMOUNT>'); // bank debit

    await (await api()).integrations.updateSettings({ tally: { companyName: 'Kush Enterprise (2026-27)', salesLedger: 'Local Sales {rate}%', interstateSalesLedger: 'IGST Sales {rate}%', salesReturnLedger: 'Returns {rate}%', cgstLedger: 'CGST {half}%', sgstLedger: 'SGST {half}%', igstLedger: 'IGST {rate}%', roundOffLedger: 'Rounding', bankLedger: 'HDFC Bank', cashLedger: 'Cash', customerGroup: 'Sundry Debtors' }, eInvoice: { enabled: true }, ewayBill: { thresholdValue: 50000 } });
    const again = (await tallyVouchersXml(prisma, { from: today, to: today })).xml;
    expect(again).toContain('<SVCURRENTCOMPANY>Kush Enterprise (2026-27)</SVCURRENTCOMPANY>');
    expect(again).toContain('<LEDGERNAME>CGST 6%</LEDGERNAME>');
    expect(again).toContain('<LEDGERNAME>HDFC Bank</LEDGERNAME>');
    const masters = await tallyMastersXml(prisma, { from: today, to: today });
    expect(masters).toContain('<PARENT>Sundry Debtors</PARENT>');
    expect(masters).toContain(`<PARTYGSTIN>${gstin('24', 'AAACT1234T')}</PARTYGSTIN>`);
    expect(masters).toContain('<GSTDUTYHEAD>Integrated Tax</GSTDUTYHEAD>');
  });
});

describe('e-invoice & e-way bill readiness', () => {
  it('builds IRP JSON, flags what the portal would reject, records the IRN and prints it', async () => {
    const a = await api();
    let r = await a.integrations.einvoice({ kind: 'invoice', id: ids.intra! });
    expect(r.issues.join(' ')).toMatch(/Seller GSTIN is missing/);
    const s = await a.settings.get();
    await a.settings.updateCompany({ legalName: s.legalName, addressLine1: s.addressLine1, addressLine2: '', city: 'Ahmedabad', pincode: '380001', stateCode: '24', phone: '', email: '', gstin: gstin('24', 'AAACK5678K'), pan: 'AAACK5678K', drugLicenceNo: 'DL-1', jurisdictionCity: 'Ahmedabad' });
    // Company details are frozen on each invoice, so a new invoice picks up the real GSTIN.
    const fresh = await a.invoices.create({ customerId: reg, date: today, lines: [{ variantId: gel.v, qty: 2, rate: 500 }] });
    r = await a.integrations.einvoice({ kind: 'invoice', id: fresh.id });
    expect(r.issues).toEqual([]);
    const j = r.json as { DocDtls: { Typ: string }; SellerDtls: { Pin: number; Stcd: string }; BuyerDtls: { Pos: string }; ItemList: { AssAmt: number; GstRt: number; CgstAmt: number }[]; ValDtls: { AssVal: number; TotInvVal: number } };
    expect(j.DocDtls.Typ).toBe('INV');
    expect(j.SellerDtls).toMatchObject({ Pin: 380001, Stcd: '24' });
    expect(j.ItemList.reduce((t, i) => t + i.AssAmt, 0)).toBe(j.ValDtls.AssVal);
    expect(j.ItemList[0]).toMatchObject({ GstRt: 12, CgstAmt: 60 });
    expect((await a.integrations.einvoice({ kind: 'invoice', id: ids.inter! })).issues.join(' ')).toMatch(/no GSTIN/);
    expect((await a.integrations.einvoice({ kind: 'credit-note', id: ids.cn! })).json.DocDtls.Typ).toBe('CRN');

    await expect(a.integrations.recordIrn({ kind: 'invoice', id: fresh.id, irn: 'short', ackNo: '112010036563310', ackDate: today, signedQr: 'x'.repeat(40) })).rejects.toThrow(/64/);
    const irn = 'a'.repeat(64);
    await a.integrations.recordIrn({ kind: 'invoice', id: fresh.id, irn, ackNo: '112010036563310', ackDate: today, signedQr: `eyJhbGciOiJSUzI1NiJ9.${'Q'.repeat(300)}.sig` });
    expect((await a.invoices.get({ id: fresh.id })).irn).toBe(irn);
    const bulk = await a.integrations.einvoiceBulk({ from: today, to: today });
    expect(bulk.documents.some((d) => (d as { DocDtls: { No: string } }).DocDtls.No === fresh.number)).toBe(false); // already has an IRN
    const { pdf } = await renderDocument(prisma, 'invoice', fresh.id);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);

  it('builds e-way bill JSON (URP for unregistered buyers) and records the number', async () => {
    const a = await api();
    expect((await a.integrations.eway({ invoiceId: ids.inter!, transMode: 1, distanceKm: 0 })).issues.join(' ')).toMatch(/Distance/);
    const r = await a.integrations.eway({ invoiceId: ids.inter!, transMode: 1, distanceKm: 660, vehicleNo: 'GJ01AB1234', transporterName: 'Shree Maruti' });
    const bill = (r.json as { billLists: Record<string, unknown>[] }).billLists[0]!;
    expect(bill).toMatchObject({ toGstin: 'URP', toStateCode: 27, transDistance: '660', vehicleNo: 'GJ01AB1234', docType: 'INV' });
    expect((bill.itemList as { igstRate: number }[])[0]!.igstRate).toBe(12);
    await expect(a.integrations.recordEway({ invoiceId: ids.inter!, ewayBillNo: '123', ewayBillDate: today })).rejects.toThrow(/12 digits/);
    await a.integrations.recordEway({ invoiceId: ids.inter!, ewayBillNo: '331009876543', ewayBillDate: today });
    expect((await a.invoices.get({ id: ids.inter! })).ewayBillNo).toBe('331009876543');
  });
});

describe('sharing and WhatsApp', () => {
  it('signs links that expire and cannot be altered; customers can share only their own documents', async () => {
    const r = await (await api()).integrations.shareLink({ kind: 'invoice', id: ids.intra! });
    const token = r.url.split('/d/')[1]!;
    expect(verifyShareToken(token)).toEqual({ kind: 'invoice', id: ids.intra });
    expect(verifyShareToken(token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA'))).toBeNull();
    expect(verifyShareToken(shareToken('invoice', ids.intra!, -1))).toBeNull();
    const [b64] = token.split('.');
    const forged = Buffer.from(Buffer.from(b64!, 'base64url').toString().replace(ids.intra!, ids.inter!)).toString('base64url');
    expect(verifyShareToken(`${forged}.${token.split('.')[1]}`)).toBeNull();
    const other = await makeUser('CUSTOMER', { customerId: unreg, mobile: randomMobile() });
    await expect((await api(other)).integrations.shareLink({ kind: 'invoice', id: ids.intra! })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await (await api(other)).integrations.shareLink({ kind: 'invoice', id: ids.inter! })).url).toMatch(/\/d\//);
  });

  it('sends WhatsApp through the Cloud API template when configured', async () => {
    vi.stubEnv('WHATSAPP_TOKEN', 'test-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '1234567890');
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendWhatsApp('+919876543210', 'Order KE/SO/1: Dispatched', 'Sent via DTDC\nhttps://example.com/d/abc');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ messaging_product: 'whatsapp', to: '919876543210', type: 'template', template: { name: 'kush_update' } });
    expect(body.template.components[0].parameters[1].text).toBe('Sent via DTDC https://example.com/d/abc');
  });
});
