import { addDays, istDateString } from '@kush/core';
import { prisma } from '@kush/db';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderDocument } from '../src/services/sales/documents';
import { callerFor, makeUser, tag } from './helpers';

const today = istDateString();
let owner: Awaited<ReturnType<typeof makeUser>>;
let buyer: Awaited<ReturnType<typeof makeUser>>; // CREATE_PURCHASE_ORDERS + MANAGE_STOCK
let store: Awaited<ReturnType<typeof makeUser>>; // MANAGE_STOCK only: receives goods, never sees PO rates
let mumbai: string; // supplier in another state → IGST
let local: string; // supplier in the company's state → CGST + SGST
let lens: { productId: string; v: string };
let gel: { productId: string; v: string };

const api = async (u = owner) => (await callerFor(u.id)).api;

beforeAll(async () => {
  for (const s of [{ code: '24', name: 'Gujarat', shortCode: 'GJ' }, { code: '27', name: 'Maharashtra', shortCode: 'MH' }]) await prisma.state.upsert({ where: { code: s.code }, create: s, update: {} });
  owner = await makeUser('OWNER');
  buyer = await makeUser('EMPLOYEE', { permissions: ['CREATE_PURCHASE_ORDERS', 'MANAGE_STOCK'] });
  store = await makeUser('EMPLOYEE', { permissions: ['MANAGE_STOCK'] });
  const a = await api();
  const s = await a.settings.get();
  await a.settings.updateCompany({ legalName: s.legalName, addressLine1: '1 Test Rd', addressLine2: '', city: 'Ahmedabad', pincode: '380001', stateCode: '24', phone: '', email: '', gstin: '[GSTIN]', pan: '[PAN]', drugLicenceNo: 'DL-1', jurisdictionCity: 'Ahmedabad' });
  const categoryId = (await a.settings.createCategory({ name: `Purch ${tag()}` })).id;
  const l = await a.products.create({ code: `PL${tag()}`.toUpperCase(), name: 'PO Lens', categoryId, hsnCode: '90213900', gstRate: 5, unit: 'pcs', defaultRate: 3000, mrp: 4000, purchaseCost: 1500, isLens: true, lensType: 'MONOFOCAL', trackSerial: true, powerRange: { from: 20, to: 20, step: 0.5 } });
  lens = { productId: l.id, v: (await a.products.get({ id: l.id })).variants[0]!.id };
  const g = await a.products.create({ code: `PG${tag()}`.toUpperCase(), name: 'PO Gel', categoryId, hsnCode: '30049099', gstRate: 12, unit: 'pcs', defaultRate: 400, mrp: 600, purchaseCost: 200 });
  gel = { productId: g.id, v: (await a.products.get({ id: g.id })).variants[0]!.id };
  mumbai = (await a.suppliers.create({ name: `Mumbai Optics ${tag()}`, addressLine1: 'MIDC', city: 'Mumbai', stateCode: '27', paymentTermsDays: 45 })).id;
  local = (await a.suppliers.create({ name: `Local Surgicals ${tag()}`, addressLine1: 'GIDC', city: 'Ahmedabad', stateCode: '24', paymentTermsDays: 30 })).id;
  // A past purchase sets the "last purchase rate" for the gel from the Mumbai supplier.
  await a.inventory.createGrn({ supplierId: mumbai, date: today, lines: [{ variantId: gel.v, batchNo: `G${tag()}`, expiryDate: addDays(today, 500), qty: 1, rate: 185 }] });
});

describe('purchase orders', () => {
  it('prices from the last purchase rate, works out IGST for an out-of-state supplier, edits only while draft', async () => {
    const b = await api(buyer);
    const po = await b.purchaseOrders.create({ supplierId: mumbai, date: today, expectedDate: addDays(today, 7), lines: [{ variantId: gel.v, qty: 10, discPct: 0 }, { variantId: lens.v, qty: 4, rate: 1450, discPct: 0 }] });
    expect(po.number).toMatch(/PO/);
    let got = await b.purchaseOrders.get({ id: po.id });
    expect(got.status).toBe('DRAFT');
    expect(got.taxType).toBe('INTER_STATE');
    expect(got.lines.map((l) => l.rate)).toEqual([185, 1450]);
    // 1850 @12% + 5800 @5% → 222 + 290 = 512 IGST
    expect(got.igstTotal).toBe(512);
    expect(got.grandTotal).toBe(8162);

    await b.purchaseOrders.update({ id: po.id, supplierId: mumbai, date: today, lines: [{ variantId: gel.v, qty: 20, discPct: 0 }, { variantId: lens.v, qty: 4, rate: 1450, discPct: 0 }] });
    got = await b.purchaseOrders.get({ id: po.id });
    expect(got.lines[0]!.qtyOrdered).toBe(20);
    await b.purchaseOrders.markSent({ id: po.id });
    await expect(b.purchaseOrders.update({ id: po.id, supplierId: mumbai, date: today, lines: [{ variantId: gel.v, qty: 1, discPct: 0 }] })).rejects.toThrow(/Only a draft/);

    const { pdf } = await renderDocument(prisma, 'purchase-order', po.id);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);

  it('uses CGST + SGST for a supplier in the company state', async () => {
    const po = await (await api(buyer)).purchaseOrders.create({ supplierId: local, date: today, lines: [{ variantId: gel.v, qty: 5, rate: 200, discPct: 0 }] });
    const got = await (await api()).purchaseOrders.get({ id: po.id });
    expect(got.taxType).toBe('INTRA_STATE');
    expect(got.cgstTotal).toBe(60);
    expect(got.sgstTotal).toBe(60);
  });

  it('receives goods against the PO: partial, refusals, then complete; the shortfall stays open', async () => {
    const b = await api(buyer);
    const s = await api(store);
    const po = await b.purchaseOrders.create({ supplierId: mumbai, date: today, lines: [{ variantId: gel.v, qty: 10, discPct: 0 }, { variantId: lens.v, qty: 2, discPct: 0 }] });
    const grn = (lines: Parameters<typeof s.inventory.createGrn>[0]['lines'], supplierId = mumbai) => s.inventory.createGrn({ supplierId, poId: po.id, date: today, lines });
    const batch = `B${tag()}`;
    await expect(grn([{ variantId: gel.v, batchNo: batch, expiryDate: addDays(today, 400), qty: 1 }])).rejects.toThrow(/still a draft/);
    await b.purchaseOrders.markSent({ id: po.id });

    // Store staff see the PO but not its rates
    const seen = await s.purchaseOrders.get({ id: po.id });
    expect(seen.lines[0]!.rate).toBeNull();
    expect(seen.grandTotal).toBeNull();
    await expect(s.purchaseOrders.create({ supplierId: mumbai, date: today, lines: [{ variantId: gel.v, qty: 1, discPct: 0 }] })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const r1 = await grn([{ variantId: gel.v, batchNo: batch, expiryDate: addDays(today, 400), qty: 6 }]);
    expect(r1.po).toMatchObject({ complete: false });
    let got = await b.purchaseOrders.get({ id: po.id });
    expect(got.status).toBe('PARTIALLY_RECEIVED');
    expect(got.lines[0]!.pending).toBe(4);
    expect(got.grns).toHaveLength(1);

    await expect(grn([{ variantId: gel.v, batchNo: batch, expiryDate: addDays(today, 400), qty: 5 }])).rejects.toThrow(/1 more than still due/);
    await expect(grn([{ variantId: gel.v, batchNo: batch, expiryDate: addDays(today, 400), qty: 1 }], local)).rejects.toThrow(/different supplier/);
    const other = await (await api()).products.create({ code: `PX${tag()}`.toUpperCase(), name: 'Not ordered', categoryId: (await prisma.product.findUniqueOrThrow({ where: { id: gel.productId } })).categoryId, hsnCode: '30049099', gstRate: 12, unit: 'pcs', defaultRate: 10, mrp: 20, trackBatch: false, trackExpiry: false });
    {
      const ov = (await (await api()).products.get({ id: other.id })).variants[0]!.id;
      await expect(grn([{ variantId: ov, batchNo: null, expiryDate: null, qty: 1 }])).rejects.toThrow(/is not on/);
    }
    // Nothing was booked by the refused receipts
    expect((await b.purchaseOrders.get({ id: po.id })).lines[0]!.qtyReceived).toBe(6);
    await expect(b.purchaseOrders.cancel({ id: po.id, reason: 'Supplier out of stock' })).rejects.toThrow(/short-close/);

    const sn = [`P${tag()}`.toUpperCase(), `P${tag()}`.toUpperCase()];
    const r2 = await grn([
      { variantId: gel.v, batchNo: batch, expiryDate: addDays(today, 400), qty: 4 },
      { variantId: lens.v, batchNo: `L${tag()}`, expiryDate: addDays(today, 700), serialNos: sn, qty: 2 },
    ]);
    expect(r2.po).toMatchObject({ complete: true });
    got = await b.purchaseOrders.get({ id: po.id });
    expect(got.status).toBe('RECEIVED');
    expect(await prisma.grnLine.count({ where: { poLine: { poId: po.id } } })).toBe(3);
  });

  it('short-closes a partly received PO and cancels an unsent one', async () => {
    const b = await api(buyer);
    const po = await b.purchaseOrders.create({ supplierId: local, date: today, lines: [{ variantId: gel.v, qty: 10, discPct: 0 }] });
    await b.purchaseOrders.markSent({ id: po.id });
    await (await api(store)).inventory.createGrn({ supplierId: local, poId: po.id, date: today, lines: [{ variantId: gel.v, batchNo: `C${tag()}`, expiryDate: addDays(today, 300), qty: 3 }] });
    await expect(b.purchaseOrders.close({ id: po.id, reason: 'no' })).rejects.toThrow(/at least 5/);
    await b.purchaseOrders.close({ id: po.id, reason: 'Balance not available with supplier' });
    expect((await b.purchaseOrders.get({ id: po.id })).status).toBe('CLOSED');
    await expect((await api(store)).inventory.createGrn({ supplierId: local, poId: po.id, date: today, lines: [{ variantId: gel.v, batchNo: `C${tag()}`, expiryDate: addDays(today, 300), qty: 1 }] })).rejects.toThrow(/closed/);

    const draft = await b.purchaseOrders.create({ supplierId: local, date: today, lines: [{ variantId: gel.v, qty: 1, discPct: 0 }] });
    await b.purchaseOrders.cancel({ id: draft.id, reason: 'Raised by mistake' });
    const doc = await (await import('../src/services/sales/documents')).documentSource(prisma, 'purchase-order', draft.id);
    expect(doc.src.watermark).toBe('CANCELLED');
  });

  it('suggests items below reorder level, less what is already on order', async () => {
    const b = await api(buyer);
    await (await api()).products.updateVariant({ id: lens.v, isActive: true, reorderLevel: 50 });
    const before = (await b.purchaseOrders.suggestions({ supplierId: null })).find((r) => r.variantId === lens.v);
    expect(before).toBeTruthy();
    expect(before!.suggestedQty).toBe(100 - before!.qty - before!.onOrder);
    await b.purchaseOrders.create({ supplierId: mumbai, date: today, lines: [{ variantId: lens.v, qty: 10, discPct: 0 }] });
    const after = (await b.purchaseOrders.suggestions({ supplierId: null })).find((r) => r.variantId === lens.v)!;
    expect(after.onOrder).toBe(before!.onOrder + 10);
    expect(after.suggestedQty).toBe(before!.suggestedQty - 10);
  });
});
