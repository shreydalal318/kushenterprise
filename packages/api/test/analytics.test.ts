import { addDays, gstinCheckChar, istDateString } from '@kush/core';
import { prisma } from '@kush/db';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildReportWorkbook } from '../src/services/report-excel';
import { callerFor, makeUser, tag } from './helpers';

const today = istDateString();
const r = { from: today, to: today };
let owner: Awaited<ReturnType<typeof makeUser>>;
let analyst: Awaited<ReturnType<typeof makeUser>>; // VIEW_ANALYTICS without cost access
let clerk: Awaited<ReturnType<typeof makeUser>>;
let gel: { productId: string; v: string; code: string };
let regCust: string; // with GSTIN → B2B
let unregCust: string; // no GSTIN → B2C (inter-state)
const api = async (u = owner) => (await callerFor(u.id)).api;

beforeAll(async () => {
  for (const s of [{ code: '24', name: 'Gujarat', shortCode: 'GJ' }, { code: '27', name: 'Maharashtra', shortCode: 'MH' }]) await prisma.state.upsert({ where: { code: s.code }, create: s, update: {} });
  owner = await makeUser('OWNER');
  analyst = await makeUser('EMPLOYEE', { permissions: ['VIEW_ANALYTICS'] });
  clerk = await makeUser('EMPLOYEE', { permissions: ['CREATE_TAX_INVOICE'] });
  const a = await api();
  const s = await a.settings.get();
  await a.settings.updateCompany({ legalName: s.legalName, addressLine1: '1 Test Rd', addressLine2: '', city: 'Ahmedabad', pincode: '380001', stateCode: '24', phone: '', email: '', gstin: '[GSTIN]', pan: '[PAN]', drugLicenceNo: 'DL-1', jurisdictionCity: 'Ahmedabad' });
  const categoryId = (await a.settings.createCategory({ name: `An ${tag()}` })).id;
  const code = `AN${tag()}`.toUpperCase();
  const g = await a.products.create({ code, name: 'Analytics Gel', categoryId, hsnCode: `3004${String(Math.floor(Math.random() * 9000) + 1000)}`, gstRate: 12, unit: 'pcs', defaultRate: 500, mrp: 800, purchaseCost: 300 });
  gel = { productId: g.id, v: (await a.products.get({ id: g.id })).variants[0]!.id, code };
  const sup = (await a.suppliers.create({ name: `AS ${tag()}`, addressLine1: 'x', city: 'Ahmedabad', stateCode: '24', paymentTermsDays: 30 })).id;
  await a.inventory.createGrn({ supplierId: sup, date: today, lines: [{ variantId: gel.v, batchNo: `A${tag()}`, expiryDate: addDays(today, 400), qty: 50, rate: 300 }] });
  regCust = (await a.customers.create({ type: 'HOSPITAL', name: `Reg ${tag()}`, stateCode: '24', gstin: `24AAACR5055K1Z${gstinCheckChar('24AAACR5055K1Z')}`, paymentTermsDays: 30, billingAddress: { line1: 'a', city: 'Surat', pincode: '395001', stateCode: '24' } })).id;
  unregCust = (await a.customers.create({ type: 'DOCTOR', name: `Dr Unreg ${tag()}`, stateCode: '27', paymentTermsDays: 7, billingAddress: { line1: 'b', city: 'Pune', pincode: '411001', stateCode: '27' } })).id;
});

describe('analytics and reports', () => {
  it('sales, margins, GST sections and the HSN summary move by exactly what was billed and returned', async () => {
    const a = await api();
    const [s0, g0, reg0] = [await a.analytics.sales(r), await a.analytics.gst(r), await a.analytics.salesRegister(r)];
    const i1 = await a.invoices.create({ customerId: regCust, date: today, lines: [{ variantId: gel.v, qty: 10, rate: 500 }] }); // 5000 + 12% CGST/SGST
    const i2 = await a.invoices.create({ customerId: unregCust, date: today, lines: [{ variantId: gel.v, qty: 4, rate: 500 }] }); // 2000 + 12% IGST
    const inv1 = await a.invoices.get({ id: i1.id });
    await a.creditNotes.create({ invoiceId: i1.id, date: today, reason: 'Two returned', restock: true, lines: [{ invoiceLineId: inv1.lines[0]!.id, qty: 2, serialNos: [] }] }); // -1000
    const cancelled = await a.invoices.create({ customerId: regCust, date: today, lines: [{ variantId: gel.v, qty: 1, rate: 500 }] });
    await a.invoices.cancel({ id: cancelled.id, reason: 'Test cancel' });

    const s1 = await a.analytics.sales(r);
    expect(Math.round((s1.total - s0.total) * 100) / 100).toBe(6000); // 5000 + 2000 − 1000; cancelled ignored
    const p = (s1.products as unknown as { id: string; qty: number; sales: number; cost: number; margin: number }[]).find((x) => x.id === gel.productId)!;
    expect(p.qty).toBe(12);
    expect(p.sales).toBe(6000);
    expect(p.cost).toBe(3600); // 12 × ₹300 batch cost
    expect(p.margin).toBe(2400);

    const g1 = await a.analytics.gst(r);
    const d = (x: number, y: number) => Math.round((x - y) * 100) / 100;
    expect(d(g1.b2b.totals.taxable, g0.b2b.totals.taxable)).toBe(5000);
    expect(d(g1.b2b.totals.cgst, g0.b2b.totals.cgst)).toBe(300);
    expect(d(g1.b2c.totals.igst, g0.b2c.totals.igst)).toBe(240);
    expect(d(g1.creditNotes.totals.taxable, g0.creditNotes.totals.taxable)).toBe(1000);
    const hsn = g1.hsn.rows.find((h) => h.rate === 12 && h.qty === 12 && h.taxable === 6000);
    expect(hsn).toBeTruthy(); // unique HSN for this run: 14 sold − 2 returned

    const reg1 = await a.analytics.salesRegister(r);
    expect(reg1.rows.length - reg0.rows.length).toBe(4); // 3 invoices (one cancelled, shown at zero) + 1 credit note
    expect(reg1.rows.find((x) => x.number === (cancelled as { number: string }).number)?.total).toBe(0);
    expect(d(reg1.totals.taxable, reg0.totals.taxable)).toBe(6000);
  });

  it('hides margins from analytics users who may not see costs, and analytics from everyone else', async () => {
    const s = await (await api(analyst)).analytics.sales(r);
    expect(s.margin).toBeNull();
    expect(JSON.stringify(s.products)).not.toMatch(/"cost"|"margin"/);
    const home = await (await api(analyst)).analytics.home();
    expect(home.kind).toBe('owner');
    expect(home.owner!.stock.value).toBeNull();
    await expect((await api(clerk)).analytics.sales(r)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const staff = await (await api(clerk)).analytics.home();
    expect(staff.kind).toBe('staff');
    expect(staff.owner).toBeNull();
    expect(typeof staff.staff.lowCount).toBe('number');
  });

  it('owner dashboard: tiles, a 30-day trend and stock value', async () => {
    const d = (await (await api()).analytics.home()).owner!;
    expect(d.trend.current).toHaveLength(30);
    expect(d.trend.previous).toHaveLength(30);
    expect(d.trend.current.at(-1)!.date).toBe(today);
    expect(d.tiles.today.sales).toBeGreaterThan(0);
    expect(d.stock.value).toBeGreaterThan(0);
    expect(Object.keys(d.ageing)).toHaveLength(4);
  });

  it('stock summary balances: opening + in − out = closing', async () => {
    const rows = await (await api()).analytics.stockSummary(r);
    const row = rows.find((x) => x.code === gel.code)!;
    expect(row.opening + row.inward - row.outward).toBe(row.closing);
    expect(row.closing).toBe(50 - 14 + 2 + 0); // received 50, sold 14 (incl. cancelled & restored), 2 returned
  });

  it('builds a real Excel workbook', async () => {
    const buf = await buildReportWorkbook('Test', [{ name: 'Sheet', columns: [{ header: 'A', key: 'a' }, { header: 'Amount', key: 'b', type: 'money' }], rows: [{ a: 'x', b: 12.5 }], totals: { a: 'Total', b: 12.5 } }]);
    expect(buf.subarray(0, 2).toString()).toBe('PK'); // xlsx is a zip
  });
});
