import ExcelJS from 'exceljs';
import { gstinCheckChar } from '@kush/core';
import { prisma } from '@kush/db';
import { beforeAll, describe, expect, it } from 'vitest';
import { outbox } from '../src/notify/sms';
import { exportPriceSheet, previewPriceImport } from '../src/services/price-sheets';
import { anon, callerFor, makeUser, randomMobile, tag } from './helpers';

let categoryId: string;
let owner: Awaited<ReturnType<typeof makeUser>>;

const gstin = (state: string) => { const b = `${state}AB${tag().slice(0, 3).toUpperCase().replace(/[0-9]/g, 'X')}1234F1Z`; return b + gstinCheckChar(b); };
const addr = (stateCode = '24') => ({ line1: '1 Test Road', city: 'Ahmedabad', pincode: '380001', stateCode });

beforeAll(async () => {
  for (const s of [{ code: '24', name: 'Gujarat', shortCode: 'GJ' }, { code: '27', name: 'Maharashtra', shortCode: 'MH' }, { code: '29', name: 'Karnataka', shortCode: 'KA' }]) {
    await prisma.state.upsert({ where: { code: s.code }, create: s, update: {} });
  }
  owner = await makeUser('OWNER');
  const { api } = await callerFor(owner.id);
  await api.settings.get(); // creates settings with default GST rates & units
  categoryId = (await api.settings.createCategory({ name: `IOL ${tag()}` })).id;
});

const lensInput = (code: string, extra: Record<string, unknown> = {}) => ({
  code, name: `Test IOL ${code}`, categoryId, hsnCode: '90213900', gstRate: 5, unit: 'pcs',
  defaultRate: 3250, mrp: 4500, isLens: true, lensType: 'MONOFOCAL' as const, trackSerial: true, ...extra,
});

describe('products & variants', () => {
  it('generates one variant per power with unique barcodes and filters by power', async () => {
    const { api } = await callerFor(owner.id);
    const code = `L${tag()}`.toUpperCase();
    const r = await api.products.create({ ...lensInput(code), purchaseCost: 1800, powerRange: { from: 10, to: 30, step: 0.5 } });
    expect(r.variantsCreated).toBe(41);
    const p = await api.products.get({ id: r.id });
    expect(p.variants).toHaveLength(41);
    expect(new Set(p.variants.map((v) => v.barcode)).size).toBe(41);
    expect(p.variants.every((v) => /^KE\d{8}$/.test(v.barcode))).toBe(true);
    expect(p.variants.find((v) => v.powerSph === 21.5)?.sku).toBe(`${code}-+21.50`);
    expect(p.variants.find((v) => v.powerSph === 21.5)?.label).toBe('+21.50 D');

    const again = await api.products.generateVariants({ productId: r.id, range: { from: 29, to: 31, step: 0.5 } });
    expect(again).toEqual({ created: 2, skipped: 3 });

    const byPower = await api.products.list({ power: 30.5, q: code });
    expect(byPower.map((x) => x.id)).toEqual([r.id]);
    expect(byPower[0]).toMatchObject({ variantCount: 43, powerMin: 10, powerMax: 31 });
  });

  it('gives non-lens items a single variant whose SKU is the product code', async () => {
    const { api } = await callerFor(owner.id);
    const code = `KN${tag()}`.toUpperCase();
    const r = await api.products.create({ ...lensInput(code), isLens: false, lensType: null, hsnCode: '90185090', defaultRate: 180, mrp: 250 });
    const p = await api.products.get({ id: r.id });
    expect(p.variants).toHaveLength(1);
    expect(p.variants[0]!.sku).toBe(code);
  });

  it('validates MRP, GST rate from settings, GTIN check digit and uniqueness', async () => {
    const { api } = await callerFor(owner.id);
    await expect(api.products.create({ ...lensInput(`X${tag()}`), defaultRate: 5000, mrp: 4500 })).rejects.toThrow(/above MRP/);
    await expect(api.products.create({ ...lensInput(`X${tag()}`), gstRate: 7 })).rejects.toThrow(/not in Settings/);
    const r = await api.products.create({ ...lensInput(`G${tag()}`), powerRange: { from: 20, to: 21, step: 1 } });
    const [v1, v2] = (await api.products.get({ id: r.id })).variants;
    await expect(api.products.updateVariant({ id: v1!.id, isActive: true, gtin: '4006381333932' })).rejects.toThrow(/check digit/);
    const gt = '4006381333931';
    await prisma.productVariant.updateMany({ where: { gtin: '04006381333931' }, data: { gtin: null } }); // re-runnable
    await api.products.updateVariant({ id: v1!.id, isActive: true, gtin: gt });
    expect((await prisma.productVariant.findUnique({ where: { id: v1!.id } }))?.gtin).toBe('04006381333931');
    await expect(api.products.updateVariant({ id: v2!.id, isActive: true, gtin: gt })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('blocks deleting a variant that has stock history', async () => {
    const { api } = await callerFor(owner.id);
    const r = await api.products.create({ ...lensInput(`D${tag()}`), powerRange: { from: 20, to: 20.5, step: 0.5 } });
    const [v1, v2] = (await api.products.get({ id: r.id })).variants;
    await prisma.batch.create({ data: { variantId: v1!.id, batchNo: 'B1' } });
    await expect(api.products.removeVariant({ id: v1!.id })).rejects.toThrow(/deactivate/);
    await api.products.removeVariant({ id: v2!.id });
  });

  it('hides purchase cost from staff without "View prices / margins"', async () => {
    const { api: ownerApi } = await callerFor(owner.id);
    const code = `C${tag()}`.toUpperCase();
    const { id } = await ownerApi.products.create({ ...lensInput(code), purchaseCost: 1800 });
    const clerk = await makeUser('EMPLOYEE', { permissions: ['MANAGE_PRODUCTS'] });
    const { api } = await callerFor(clerk.id);
    const listed = (await api.products.list({ q: code }))[0]!;
    expect('purchaseCost' in listed && listed.purchaseCost !== undefined).toBe(false);
    expect((await api.products.get({ id })).purchaseCost).toBeUndefined();
    await expect(api.products.create({ ...lensInput(`C${tag()}`), purchaseCost: 10 })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Editing other fields leaves the hidden cost untouched; default-rate changes are logged.
    const p = await api.products.get({ id });
    const { variants: _v, category: _c, brand: _b, supplierLinks: _s, canSeeCost: _cs, purchaseCost: _pc, createdAt: _ca, updatedAt: _ua, deletedAt: _d, imageIds: _i, ...rest } = p;
    await api.products.update({ ...(rest as unknown as Parameters<typeof api.products.update>[0]), id, defaultRate: 3100, purchaseCost: undefined });
    const after = await prisma.product.findUniqueOrThrow({ where: { id } });
    expect(Number(after.purchaseCost)).toBe(1800);
    expect(await prisma.priceChangeLog.count({ where: { productId: id, scope: 'DEFAULT' } })).toBe(2);

    const viewer = await makeUser('EMPLOYEE', { permissions: ['VIEW_PRICES_MARGINS'] });
    expect((await (await callerFor(viewer.id)).api.products.get({ id })).purchaseCost).toBe(1800);
    await expect((await callerFor(viewer.id)).api.products.create(lensInput(`Z${tag()}`))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('customers', () => {
  it('validates GSTIN against state, derives PAN, and links doctors under hospitals', async () => {
    const mgr = await makeUser('EMPLOYEE', { permissions: ['MANAGE_CUSTOMERS'] });
    const { api } = await callerFor(mgr.id);
    const g = gstin('24');
    await expect(api.customers.create({ type: 'HOSPITAL', name: 'Wrong State', stateCode: '27', gstin: g, billingAddress: addr('27') })).rejects.toThrow(/state must match/);
    const h = await api.customers.create({ type: 'HOSPITAL', name: `Netra ${tag()}`, stateCode: '24', gstin: g, billingAddress: addr(), paymentTermsDays: 45 });
    expect(h.code).toMatch(/^CUST-\d{4}$/);
    const hosp = await api.customers.get({ id: h.id });
    expect(hosp.pan).toBe(g.slice(2, 12));

    const d = await api.customers.create({ type: 'DOCTOR', name: `Dr. Iyer ${tag()}`, stateCode: '24', parentId: h.id, billingAddress: addr() });
    expect((await api.customers.get({ id: h.id })).doctors.map((x) => x.id)).toContain(d.id);
    await expect(api.customers.create({ type: 'DOCTOR', name: 'Dr. Nested', stateCode: '24', parentId: d.id, billingAddress: addr() })).rejects.toThrow(/hospital or clinic/);
    await expect(api.customers.update({ ...(await api.customers.get({ id: h.id })), id: h.id, type: 'DOCTOR', creditLimit: null } as never)).rejects.toThrow(/Unlink the doctors/);
  });

  it('keeps one default address per kind and at least one billing address', async () => {
    const { api } = await callerFor(owner.id);
    const c = await api.customers.create({ type: 'CLINIC', name: `Clinic ${tag()}`, stateCode: '24', billingAddress: addr() });
    const s1 = await api.customers.addAddress({ customerId: c.id, kind: 'SHIPPING', isDefault: true, address: { ...addr(), city: 'Surat', label: 'OT' } });
    const s2 = await api.customers.addAddress({ customerId: c.id, kind: 'SHIPPING', isDefault: true, address: { ...addr(), city: 'Vadodara' } });
    const shipping = (await api.customers.get({ id: c.id })).addresses.filter((a) => a.kind === 'SHIPPING');
    expect(shipping.filter((a) => a.isDefault).map((a) => a.id)).toEqual([s2.id]);
    await api.customers.removeAddress({ id: s2.id });
    expect((await api.customers.get({ id: c.id })).addresses.find((a) => a.id === s1.id)?.isDefault).toBe(true);
    const billing = (await api.customers.get({ id: c.id })).addresses.find((a) => a.kind === 'BILLING')!;
    await expect(api.customers.removeAddress({ id: billing.id })).rejects.toThrow(/at least one billing/);
  });

  it('creates an OTP login for the customer that cannot reach staff data, and deactivation blocks it', async () => {
    const { api } = await callerFor(owner.id);
    const c = await api.customers.create({ type: 'DOCTOR', name: `Dr. Login ${tag()}`, stateCode: '24', billingAddress: addr() });
    const mobile = randomMobile();
    const login = await api.customers.createLogin({ customerId: c.id, name: 'Dr. Login', mobile });
    await api.customers.sendLoginInvite({ userId: login.id });
    expect(outbox.at(-1)?.to).toBe(mobile);

    const a = await anon();
    await a.api.auth.requestOtp({ mobile });
    const code = /^(\d{6})/.exec([...outbox].reverse().find((o) => o.to === mobile && /^\d{6}/.test(o.message))!.message)![1]!;
    const r = await a.api.auth.verifyOtp({ mobile, code, client: 'mobile' });
    expect(r.user.role).toBe('CUSTOMER');
    const cust = await callerFor(login.id);
    await expect(cust.api.products.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(cust.api.pricing.customerSheet({ customerId: c.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await api.customers.setActive({ id: c.id, isActive: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: login.id } })).isActive).toBe(false);
  });
});

describe('pricing: override → price list → default', () => {
  it('resolves precedence and validity, logs history, and enforces who may change prices', async () => {
    const { api } = await callerFor(owner.id);
    const p = await api.products.create({ ...lensInput(`P${tag()}`), purchaseCost: 1800 });
    const c = await api.customers.create({ type: 'HOSPITAL', name: `Govt ${tag()}`, stateCode: '24', billingAddress: addr() });
    const row = async () => (await api.pricing.customerSheet({ customerId: c.id, q: (await api.products.get({ id: p.id })).code })).rows[0]!;

    expect((await row()).effective).toMatchObject({ rate: 3250, source: 'DEFAULT' });

    const list = await api.priceLists.create({ name: `Govt hospitals ${tag()}` });
    await api.priceLists.setItems({ priceListId: list.id, rows: [{ productId: p.id, rate: 2900, validFrom: null, validTo: null }] });
    await api.customers.setPriceList({ customerId: c.id, priceListId: list.id });
    expect((await row()).effective).toMatchObject({ rate: 2900, source: 'PRICE_LIST', diff: 350 });

    await api.pricing.setCustomerPrices({ customerId: c.id, rows: [{ productId: p.id, rate: 2750, validFrom: null, validTo: null, note: 'Annual contract' }] });
    const r = await row();
    expect(r.effective).toMatchObject({ rate: 2750, source: 'CUSTOMER' });
    expect(r.marginPct).toBe(34.5);

    // An expired special price falls back to the list; an inactive list falls back to default.
    await api.pricing.setCustomerPrices({ customerId: c.id, rows: [{ productId: p.id, rate: 2750, validFrom: '2020-01-01', validTo: '2020-12-31' }] });
    expect((await row()).effective.source).toBe('PRICE_LIST');
    await api.priceLists.update({ id: list.id, name: list.name, description: null, isActive: false });
    expect((await row()).effective.source).toBe('DEFAULT');

    await expect(api.pricing.setCustomerPrices({ customerId: c.id, rows: [{ productId: p.id, rate: 9999, validFrom: null, validTo: null }] })).rejects.toThrow(/above MRP/);
    expect(await prisma.priceChangeLog.count({ where: { productId: p.id, scope: 'CUSTOMER', scopeRefId: c.id } })).toBe(2);

    const viewer = await makeUser('EMPLOYEE', { permissions: ['VIEW_PRICES_MARGINS'] });
    const v = await callerFor(viewer.id);
    expect((await v.api.pricing.customerSheet({ customerId: c.id })).rows.length).toBeGreaterThan(0);
    await expect(v.api.pricing.setCustomerPrices({ customerId: c.id, rows: [{ productId: p.id, rate: 100, validFrom: null, validTo: null }] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const noPerm = await makeUser('EMPLOYEE', { permissions: ['MANAGE_CUSTOMERS'] });
    await expect((await callerFor(noPerm.id)).api.pricing.customerSheet({ customerId: c.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect((await callerFor(noPerm.id)).api.customers.setPriceList({ customerId: c.id, priceListId: null })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('bulk-adjusts by percent off default and clears', async () => {
    const { api } = await callerFor(owner.id);
    const a = await api.products.create({ ...lensInput(`BA${tag()}`), defaultRate: 1000, mrp: 1200 });
    const b = await api.products.create({ ...lensInput(`BB${tag()}`), defaultRate: 2500, mrp: 3000 });
    const c = await api.customers.create({ type: 'CLINIC', name: `Tier A ${tag()}`, stateCode: '24', billingAddress: addr() });
    expect(await api.pricing.bulkAdjust({ customerId: c.id, productIds: [a.id, b.id], mode: 'PERCENT_OFF_DEFAULT', value: 12.5 })).toMatchObject({ set: 2 });
    const rates = (await prisma.customerPrice.findMany({ where: { customerId: c.id }, orderBy: { rate: 'asc' } })).map((x) => Number(x.rate));
    expect(rates).toEqual([875, 2188]);
    expect(await api.pricing.bulkAdjust({ customerId: c.id, productIds: [a.id, b.id], mode: 'CLEAR' })).toMatchObject({ removed: 2 });
  });

  it('round-trips special prices through Excel with a preview before saving', async () => {
    const { api } = await callerFor(owner.id);
    const p1 = await api.products.create({ ...lensInput(`XA${tag()}`), defaultRate: 1000, mrp: 1500 });
    const p2 = await api.products.create({ ...lensInput(`XB${tag()}`), defaultRate: 2000, mrp: 2500 });
    const c = await api.customers.create({ type: 'DOCTOR', name: `Dr. Excel ${tag()}`, stateCode: '24', billingAddress: addr() });
    await api.pricing.setCustomerPrices({ customerId: c.id, rows: [{ productId: p2.id, rate: 1900, validFrom: null, validTo: null }] });
    const code1 = (await api.products.get({ id: p1.id })).code;
    const code2 = (await api.products.get({ id: p2.id })).code;

    const { body } = await exportPriceSheet(prisma, { customerId: c.id });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(body as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Prices')!;
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const code = String(row.getCell(1).value);
      if (code === code1) { row.getCell(9).value = 950; row.getCell(10).value = '01-04-2026'; row.getCell(11).value = new Date('2027-03-31T00:00:00Z'); }
      if (code === code2) row.getCell(9).value = null; // remove special price
    });
    ws.addRow(['NOPE-123', 'x', 'x', '', 'pcs', 1, 1, null, 5]);
    const edited = Buffer.from(await wb.xlsx.writeBuffer());

    const preview = await previewPriceImport(prisma, { customerId: c.id }, edited);
    const ch1 = preview.changes.find((x) => x.code === code1)!;
    expect(ch1).toMatchObject({ oldRate: null, newRate: 950, validFrom: '2026-04-01', validTo: '2027-03-31' });
    expect(preview.changes.find((x) => x.code === code2)).toMatchObject({ oldRate: 1900, newRate: null });
    expect(preview.errors.map((e) => e.message)).toContain('NOPE-123: no product with this code');
    expect(await prisma.customerPrice.count({ where: { customerId: c.id, productId: p1.id } })).toBe(0); // nothing saved yet

    const applied = await api.pricing.setCustomerPrices({
      customerId: c.id, source: 'excel-import',
      rows: preview.changes.map((x) => ({ productId: x.productId, rate: x.newRate, validFrom: x.validFrom, validTo: x.validTo, note: x.note })),
    });
    expect(applied).toMatchObject({ set: 1, removed: 1 });
  });
});

describe('suppliers', () => {
  it('creates suppliers with codes and redacts purchase rates from store staff', async () => {
    const buyer = await makeUser('EMPLOYEE', { permissions: ['CREATE_PURCHASE_ORDERS'] });
    const { api } = await callerFor(buyer.id);
    const s = await api.suppliers.create({ name: `Visiona Medical ${tag()}`, addressLine1: 'Plot 4', city: 'Mumbai', stateCode: '27', paymentTermsDays: 30, gstin: gstin('27') });
    expect(s.code).toMatch(/^SUP-\d{3}$/);
    const { api: ownerApi } = await callerFor(owner.id);
    const p = await ownerApi.products.create(lensInput(`SP${tag()}`));
    await api.suppliers.setProducts({ supplierId: s.id, rows: [{ productId: p.id, supplierSku: 'V-600', lastPurchaseRate: 1750 }] });
    expect((await api.suppliers.get({ id: s.id })).products[0]!.lastPurchaseRate).toBe(1750);

    const store = await makeUser('EMPLOYEE', { permissions: ['MANAGE_STOCK'] });
    const storeView = await (await callerFor(store.id)).api.suppliers.get({ id: s.id });
    expect(storeView.products[0]!.lastPurchaseRate).toBeUndefined();
    await expect((await callerFor(store.id)).api.suppliers.update({ ...s, id: s.id } as never)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

import { productCreateInput, priceRowInput, customerCreateInput } from '../src/schemas';
describe('schema edge cases', () => {
  it('keeps null / blank as "no value" instead of coercing to 0', () => {
    expect(priceRowInput.parse({ productId: 'x', rate: null }).rate).toBeNull();
    const base = { code: 'AB1', name: 'Thing', categoryId: 'c', hsnCode: '9018', gstRate: 5, unit: 'pcs', defaultRate: 1, mrp: 2 };
    expect(productCreateInput.parse({ ...base, purchaseCost: '' }).purchaseCost).toBeNull();
    expect(productCreateInput.parse({ ...base, purchaseCost: null }).purchaseCost).toBeNull();
    expect(productCreateInput.parse({ ...base, reorderLevel: '' }).reorderLevel).toBeNull();
    expect(productCreateInput.parse({ ...base, purchaseCost: '0' }).purchaseCost).toBe(0);
    const c = customerCreateInput.parse({ type: 'DOCTOR', name: 'Dr X', stateCode: '24', creditLimit: '', mobile: '', email: '', billingAddress: { line1: 'a', city: 'b', pincode: '380001', stateCode: '24' } });
    expect(c.creditLimit).toBeNull();
    expect(c.mobile).toBeNull();
    expect(c.email).toBeNull();
  });
});
