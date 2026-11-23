import { addDays, istDateString } from '@kush/core';
import { prisma } from '@kush/db';
import { beforeAll, describe, expect, it } from 'vitest';
import { callerFor, makeUser, tag } from './helpers';

const today = istDateString();
let owner: Awaited<ReturnType<typeof makeUser>>;
let store: Awaited<ReturnType<typeof makeUser>>;
let supplierId: string;
let lens: { id: string; code: string; v1: string; v2: string; barcode1: string };
let knife: { id: string; v: string; barcode: string };

beforeAll(async () => {
  await prisma.state.upsert({ where: { code: '27' }, create: { code: '27', name: 'Maharashtra', shortCode: 'MH' }, update: {} });
  owner = await makeUser('OWNER');
  store = await makeUser('EMPLOYEE', { permissions: ['MANAGE_STOCK'] });
  const { api } = await callerFor(owner.id);
  await api.settings.get();
  const categoryId = (await api.settings.createCategory({ name: `Inv ${tag()}` })).id;
  const code = `INV${tag()}`.toUpperCase();
  const l = await api.products.create({ code, name: `Inventory IOL ${code}`, categoryId, hsnCode: '90213900', gstRate: 5, unit: 'pcs', defaultRate: 3000, mrp: 4000, purchaseCost: 1500, isLens: true, lensType: 'MONOFOCAL', trackSerial: true, powerRange: { from: 20, to: 20.5, step: 0.5 } });
  const lv = (await api.products.get({ id: l.id })).variants;
  lens = { id: l.id, code, v1: lv[0]!.id, v2: lv[1]!.id, barcode1: lv[0]!.barcode };
  const k = await api.products.create({ code: `K${tag()}`.toUpperCase(), name: 'Inventory Knife', categoryId, hsnCode: '90185090', gstRate: 5, unit: 'pcs', defaultRate: 180, mrp: 250, purchaseCost: 70, trackExpiry: false, trackBatch: false });
  const kv = (await api.products.get({ id: k.id })).variants[0]!;
  knife = { id: k.id, v: kv.id, barcode: kv.barcode };
  supplierId = (await api.suppliers.create({ name: `Inv Supplier ${tag()}`, addressLine1: 'x', city: 'Mumbai', stateCode: '27', paymentTermsDays: 30 })).id;
});

const serials = (n: number) => Array.from({ length: n }, () => `SN${tag()}`.toUpperCase());

describe('goods receipt', () => {
  it('posts stock, creates batches and serial units, and numbers the GRN', async () => {
    const { api } = await callerFor(store.id);
    const sn = serials(3);
    const batchNo = `B${tag()}`.toUpperCase();
    const r = await api.inventory.createGrn({
      supplierId, date: today, supplierInvoiceNo: 'INV-1',
      lines: [
        { variantId: lens.v1, batchNo, expiryDate: addDays(today, 700), serialNos: sn, qty: 3, rate: 999 },
        { variantId: knife.v, serialNos: [], qty: 20 },
      ],
    });
    expect(r.number).toMatch(/\/GRN\/|GRN/);
    expect(r.units).toBe(23);
    const ps = await api.inventory.productStock({ productId: lens.id });
    const v1 = ps.variants.find((v) => v.id === lens.v1)!;
    expect(v1.qty).toBeGreaterThanOrEqual(3);
    expect(v1.batches.find((b) => b.batchNo === batchNo)?.serials.sort()).toEqual([...sn].sort());
    // Store staff can't set costs: the product's purchase cost was used, not 999, and rates are hidden.
    const line = await prisma.grnLine.findFirst({ where: { grnId: r.id, variantId: lens.v1 } });
    expect(Number(line!.rate)).toBe(1500);
    expect((await api.inventory.receipt({ id: r.id })).lines[0]!.rate).toBeUndefined();
    expect(await prisma.serialUnit.count({ where: { serialNo: { in: sn }, status: 'IN_STOCK' } })).toBe(3);
  });

  it('enforces batch, expiry and serial rules', async () => {
    const { api } = await callerFor(store.id);
    const base = { supplierId, date: today };
    await expect(api.inventory.createGrn({ ...base, lines: [{ variantId: lens.v1, expiryDate: addDays(today, 300), serialNos: serials(1), qty: 1 }] })).rejects.toThrow(/batch/);
    await expect(api.inventory.createGrn({ ...base, lines: [{ variantId: lens.v1, batchNo: 'X1', serialNos: serials(1), qty: 1 }] })).rejects.toThrow(/expiry date/);
    await expect(api.inventory.createGrn({ ...base, lines: [{ variantId: lens.v1, batchNo: 'X1', expiryDate: addDays(today, -1), serialNos: serials(1), qty: 1 }] })).rejects.toThrow(/expired/);
    await expect(api.inventory.createGrn({ ...base, lines: [{ variantId: lens.v1, batchNo: 'X1', expiryDate: addDays(today, 300), serialNos: serials(1), qty: 2 }] })).rejects.toThrow(/2 serial/);
    const b = `B${tag()}`.toUpperCase();
    await api.inventory.createGrn({ ...base, lines: [{ variantId: lens.v1, batchNo: b, expiryDate: addDays(today, 300), serialNos: serials(1), qty: 1 }] });
    await expect(api.inventory.createGrn({ ...base, lines: [{ variantId: lens.v1, batchNo: b, expiryDate: addDays(today, 301), serialNos: serials(1), qty: 1 }] })).rejects.toThrow(/already recorded with expiry/);
    const dup = serials(1);
    await api.inventory.createGrn({ ...base, lines: [{ variantId: lens.v2, batchNo: `C${tag()}`, expiryDate: addDays(today, 300), serialNos: dup, qty: 1 }] });
    await expect(api.inventory.createGrn({ ...base, lines: [{ variantId: lens.v2, batchNo: `D${tag()}`, expiryDate: addDays(today, 300), serialNos: dup, qty: 1 }] })).rejects.toThrow(/already in stock/);
    // A failed receipt leaves no trace (whole transaction rolls back)
    expect(await prisma.batch.count({ where: { variantId: lens.v1, batchNo: 'X1' } })).toBe(0);
  });

  it('lets cost viewers set the rate and records the supplier’s last purchase rate', async () => {
    const { api } = await callerFor(owner.id);
    const r = await api.inventory.createGrn({ supplierId, date: today, lines: [{ variantId: knife.v, qty: 5, rate: 66 }] });
    expect((await api.inventory.receipt({ id: r.id })).lines[0]!.rate).toBe(66);
    const sp = await prisma.supplierProduct.findUnique({ where: { supplierId_productId: { supplierId, productId: knife.id } } });
    expect(Number(sp!.lastPurchaseRate)).toBe(66);
  });
});

describe('adjustments, returns, ledger, FEFO', () => {
  it('requires a reason, never goes negative, and keeps the ledger balanced', async () => {
    const { api } = await callerFor(store.id);
    const before = (await api.inventory.productStock({ productId: knife.id })).variants[0]!;
    const batchId = before.batches[0]!.batchId;
    await expect(api.inventory.adjust({ variantId: knife.v, batchId, qty: -1 } as never)).rejects.toThrow();
    await expect(api.inventory.adjust({ variantId: knife.v, batchId, qty: -(before.qty + 1), reason: 'DAMAGED' })).rejects.toThrow(/only \d+ in stock/);
    await api.inventory.adjust({ variantId: knife.v, batchId, qty: -2, reason: 'DAMAGED', note: 'Bent tips' });
    const after = (await api.inventory.productStock({ productId: knife.id })).variants[0]!;
    expect(after.qty).toBe(before.qty - 2);

    const ledger = await api.inventory.ledger({ variantId: knife.v });
    expect(ledger.opening).toBe(0);
    expect(ledger.closing).toBe(after.qty);
    expect(ledger.rows.at(-1)).toMatchObject({ type: 'ADJUSTMENT', qtyOut: 2, reason: 'DAMAGED' });
    expect(ledger.rows.reduce((t, r) => t + r.qtyIn - r.qtyOut, 0)).toBe(ledger.closing);
    const fromTomorrow = await api.inventory.ledger({ variantId: knife.v, from: addDays(today, 1) });
    expect(fromTomorrow.opening).toBe(after.qty);
    expect(fromTomorrow.rows).toHaveLength(0);
  });

  it('returns serial units to the supplier with a debit-note number', async () => {
    const { api } = await callerFor(store.id);
    const sn = serials(2);
    const batchNo = `R${tag()}`.toUpperCase();
    await api.inventory.createGrn({ supplierId, date: today, lines: [{ variantId: lens.v2, batchNo, expiryDate: addDays(today, 400), serialNos: sn, qty: 2 }] });
    const batch = await prisma.batch.findUniqueOrThrow({ where: { variantId_batchNo: { variantId: lens.v2, batchNo } } });
    await expect(api.inventory.returnToSupplier({ supplierId, date: today, reason: 'Damaged packs', lines: [{ variantId: lens.v2, batchId: batch.id, qty: 1, serialNos: ['NOT-A-SERIAL'] }] })).rejects.toThrow(/not in stock/);
    const r = await api.inventory.returnToSupplier({ supplierId, date: today, reason: 'Damaged packs', lines: [{ variantId: lens.v2, batchId: batch.id, qty: 1, serialNos: [sn[0]!] }] });
    expect(r.number).toMatch(/DN/);
    expect((await prisma.serialUnit.findFirst({ where: { serialNo: sn[0] } }))?.status).toBe('RETURNED_TO_SUPPLIER');
    expect((await prisma.stockBalance.findFirst({ where: { batchId: batch.id } }))?.qty).toBe(1);
  });

  it('suggests the earliest-expiring unexpired batch first', async () => {
    const { api } = await callerFor(owner.id);
    const v = (await api.products.create({ code: `F${tag()}`.toUpperCase(), name: 'FEFO Gel', categoryId: (await prisma.category.findFirstOrThrow()).id, hsnCode: '30049099', gstRate: 5, unit: 'pcs', defaultRate: 100, mrp: 150 })).id;
    const vid = (await api.products.get({ id: v })).variants[0]!.id;
    await api.inventory.createGrn({ supplierId, date: today, lines: [{ variantId: vid, batchNo: 'LATE', expiryDate: addDays(today, 500), qty: 5 }, { variantId: vid, batchNo: 'SOON', expiryDate: addDays(today, 40), qty: 2 }] });
    // An already-expired batch (opened via adjustment) must never be suggested.
    await api.inventory.adjust({ variantId: vid, batchNo: 'OLD', expiryDate: addDays(today, -5), qty: 4, reason: 'CORRECTION' });
    const pick = await api.inventory.fefo({ variantId: vid, qty: 4 });
    expect(pick.picks.map((p) => [p.batchNo, p.qty])).toEqual([['SOON', 2], ['LATE', 2]]);
    const exp = await api.inventory.expiring();
    expect(exp.rows.find((r) => r.batchNo === 'OLD')?.bucket).toBe('Expired');
    expect(exp.rows.find((r) => r.batchNo === 'SOON')?.bucket).toBe('31–60 days');
    expect(exp.rows[0]!.value).toBeDefined(); // owner sees value
    expect((await (await callerFor(store.id)).api.inventory.expiring()).rows[0]!.value).toBeUndefined();
  });

  it('keeps valuation for the owner only', async () => {
    const v = await (await callerFor(owner.id)).api.inventory.valuation();
    expect(v.total).toBeGreaterThan(0);
    await expect((await callerFor(store.id)).api.inventory.valuation()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const clerk = await makeUser('EMPLOYEE', { permissions: ['VIEW_ORDERS'] });
    await expect((await callerFor(clerk.id)).api.inventory.adjust({ variantId: knife.v, qty: 1, reason: 'CORRECTION' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await (await callerFor(clerk.id)).api.inventory.overview({ q: lens.code }))[0]?.value).toBeUndefined();
  });
});

describe('scanning', () => {
  it('resolves our barcode, our label QR, a GS1 box code, plain EAN, mapped codes and serials', async () => {
    const { api } = await callerFor(owner.id);
    const sn = serials(1);
    const batchNo = `S${tag()}`.toUpperCase();
    const expiry = addDays(today, 365);
    await api.inventory.createGrn({ supplierId, date: today, lines: [{ variantId: lens.v1, batchNo, expiryDate: expiry, serialNos: sn, qty: 1 }] });

    const byBarcode = await api.scan.resolve({ code: lens.barcode1 });
    expect(byBarcode).toMatchObject({ found: true, via: 'barcode', product: { id: lens.id } });
    expect(byBarcode.found && byBarcode.suggested).toBeTruthy();


    // Map a manufacturer GTIN once, then a full GS1 DataMatrix string resolves with batch & expiry.
    const gtin = '04006381333931';
    await prisma.productVariant.updateMany({ where: { gtin }, data: { gtin: null } });
    const unknown = await api.scan.resolve({ code: `(01)${gtin}(17)${expiry.slice(2, 4)}${expiry.slice(5, 7)}${expiry.slice(8, 10)}(10)${batchNo}` });
    expect(unknown.found).toBe(false);
    expect(await api.scan.mapAlias({ code: '4006381333931', variantId: lens.v1 })).toMatchObject({ stored: 'gtin' });
    const gs1 = await api.scan.resolve({ code: `]d201${gtin}17${expiry.slice(2, 4)}${expiry.slice(5, 7)}${expiry.slice(8, 10)}10${batchNo}` });
    expect(gs1).toMatchObject({ found: true, via: 'gs1', batch: { batchNo } });
    expect((await api.scan.resolve({ code: '4006381333931' })).found).toBe(true);

    const vendorCode = `VENDOR-${tag()}`;
    await api.scan.mapAlias({ code: vendorCode, variantId: knife.v });
    expect(await api.scan.resolve({ code: vendorCode })).toMatchObject({ found: true, via: 'alias', product: { id: knife.id } });

    expect(await api.scan.resolve({ code: sn[0]! })).toMatchObject({ found: true, via: 'serial', serial: { serialNo: sn[0] } });
    expect((await api.scan.resolve({ code: 'NO-SUCH-CODE-123' })).found).toBe(false);
  });

  it('flags expired batches and out-of-stock items', async () => {
    const { api } = await callerFor(owner.id);
    const expired = await api.scan.resolve({ code: `(01)04006381333931(17)200101(10)GONE${tag()}` });
    expect(expired.found && expired.warnings).toEqual(expect.arrayContaining(['EXPIRED']));
    const p = await api.products.create({ code: `O${tag()}`.toUpperCase(), name: 'Never stocked', categoryId: (await prisma.category.findFirstOrThrow()).id, hsnCode: '9018', gstRate: 5, unit: 'pcs', defaultRate: 10, mrp: 20 });
    const bc = (await api.products.get({ id: p.id })).variants[0]!.barcode;
    const r = await api.scan.resolve({ code: bc });
    expect(r.found && r.warnings).toEqual(['OUT_OF_STOCK']);
  });

  it('answers well inside the 300 ms target', async () => {
    const { api } = await callerFor(owner.id);
    await api.scan.resolve({ code: lens.barcode1 }); // warm up
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) await api.scan.resolve({ code: lens.barcode1 });
    const avg = (performance.now() - t0) / 20;
    expect(avg).toBeLessThan(300);
  });
});

describe('barcode linking (no stickers: items are scanned by the maker\'s barcode)', () => {
  it('links a vendor code, flags unlinked items on a receipt, and unlinks', async () => {
    const { api } = await callerFor(owner.id);
    const code = `MAKER-${tag()}`;
    const g = await api.inventory.createGrn({ supplierId, date: today, lines: [{ variantId: knife.v, qty: 1 }] });
    const before = (await api.inventory.receipt({ id: g.id })).lines[0]!;
    expect(before.hasBarcode).toBe((await api.products.get({ id: knife.id })).variants[0]!.linkedCodes.length > 0);
    await api.scan.mapAlias({ code, variantId: knife.v });
    expect((await api.products.get({ id: knife.id })).variants[0]!.linkedCodes).toContain(code);
    expect((await api.inventory.receipt({ id: g.id })).lines[0]!.hasBarcode).toBe(true);
    await expect(api.scan.mapAlias({ code, variantId: lens.v2 })).rejects.toMatchObject({ code: 'CONFLICT' });
    await api.scan.unlink({ variantId: knife.v, code });
    expect((await api.scan.resolve({ code })).found).toBe(false);
  });
});
