import { addDays, istDateString } from '@kush/core';
import { prisma } from '@kush/db';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSession } from '../src/auth/session';
import { deliverQueued, deliveryLog } from '../src/notify';
import { createCaller } from '../src/root';
import { renderStatement } from '../src/services/sales/documents';
import { createContext } from '../src/trpc';
import { callerFor, makeUser, randomMobile, tag } from './helpers';

const today = istDateString();
let owner: Awaited<ReturnType<typeof makeUser>>;
let customerUser: Awaited<ReturnType<typeof makeUser>>;
let otherUser: Awaited<ReturnType<typeof makeUser>>;
let custId: string;
let otherCustId: string;
let lens: { productId: string; v20: string; v21: string; v22: string };

const api = async (u = owner) => (await callerFor(u.id)).api;
async function mobileApi(userId: string) {
  const { token } = await createSession(prisma, userId, { client: 'mobile' });
  return createCaller(await createContext({ headers: new Headers({ authorization: `Bearer ${token}`, 'user-agent': 'KushApp/1.0' }) }));
}

beforeAll(async () => {
  await prisma.state.upsert({ where: { code: '24' }, create: { code: '24', name: 'Gujarat', shortCode: 'GJ' }, update: {} });
  owner = await makeUser('OWNER');
  const a = await api();
  const s = await a.settings.get();
  await a.settings.updateCompany({ legalName: s.legalName, addressLine1: '1 Test Rd', addressLine2: '', city: 'Ahmedabad', pincode: '380001', stateCode: '24', phone: '', email: '', gstin: '[GSTIN]', pan: '[PAN]', drugLicenceNo: 'DL-1', jurisdictionCity: 'Ahmedabad' });
  await a.settings.updateNotifications({ ...s.notificationConfig, channels: { ...s.notificationConfig.channels, sms: true }, orderStatusToCustomer: true });
  const categoryId = (await a.settings.createCategory({ name: `Portal ${tag()}` })).id;
  const p = await a.products.create({ code: `PT${tag()}`.toUpperCase(), name: `Portal Lens ${tag()}`, categoryId, hsnCode: '90213900', gstRate: 5, unit: 'pcs', defaultRate: 3000, mrp: 4500, purchaseCost: 1200, isLens: true, lensType: 'MONOFOCAL', trackSerial: true, powerRange: { from: 20, to: 22, step: 1 } });
  const vs = (await a.products.get({ id: p.id })).variants;
  lens = { productId: p.id, v20: vs[0]!.id, v21: vs[1]!.id, v22: vs[2]!.id };
  for (const v of vs) await a.products.updateVariant({ id: v.id, isActive: true, reorderLevel: 2 });
  const sup = (await a.suppliers.create({ name: `PS ${tag()}`, addressLine1: 'x', city: 'Ahmedabad', stateCode: '24', paymentTermsDays: 30 })).id;
  const sn = (n: number) => Array.from({ length: n }, () => `PT${tag()}`.toUpperCase());
  // +20: 5 in stock (Available), +21: 1 (Limited), +22: none (On request)
  await a.inventory.createGrn({ supplierId: sup, date: today, lines: [
    { variantId: lens.v20, batchNo: `PB${tag()}`, expiryDate: addDays(today, 700), serialNos: sn(5), qty: 5 },
    { variantId: lens.v21, batchNo: `PB${tag()}`, expiryDate: addDays(today, 700), serialNos: sn(1), qty: 1 },
  ] });
  const c = await a.customers.create({ type: 'HOSPITAL', name: `Portal Hospital ${tag()}`, stateCode: '24', paymentTermsDays: 30, billingAddress: { line1: 'Ring Road', city: 'Surat', pincode: '395001', stateCode: '24' } });
  custId = c.id;
  await a.pricing.setCustomerPrices({ customerId: custId, rows: [{ productId: lens.productId, rate: 2750, validFrom: null, validTo: null }] });
  otherCustId = (await a.customers.create({ type: 'CLINIC', name: `Other Clinic ${tag()}`, stateCode: '24', paymentTermsDays: 15, billingAddress: { line1: 'y', city: 'Surat', pincode: '395001', stateCode: '24' } })).id;
  customerUser = await makeUser('CUSTOMER', { customerId: custId, mobile: randomMobile() });
  otherUser = await makeUser('CUSTOMER', { customerId: otherCustId, mobile: randomMobile() });
});

describe('customer portal', () => {
  it('shows the catalogue at the customer’s own price with stock badges, never quantities or cost', async () => {
    const c = await api(customerUser);
    const row = (await c.portal.catalogue({ q: 'Portal Lens' })).find((r) => r.id === lens.productId)!;
    expect(row.price).toBe(2750);
    expect(row.stock).toBe('AVAILABLE');
    expect(JSON.stringify(row)).not.toMatch(/purchaseCost|defaultRate|"qty"/);
    expect((await (await api(otherUser)).portal.catalogue({ q: 'Portal Lens' })).find((r) => r.id === lens.productId)!.price).toBe(3000);
    const detail = await c.portal.product({ id: lens.productId });
    expect(detail.variants.map((v) => v.stock)).toEqual(['AVAILABLE', 'LIMITED', 'ON_REQUEST']);
    expect((await c.portal.catalogue({ power: 21 })).some((r) => r.id === lens.productId)).toBe(true);
  });

  it('keeps staff screens and other customers’ data out of reach', async () => {
    const c = await api(customerUser);
    await expect(c.invoices.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect((await api()).portal.home()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const o = await (await api(otherUser)).portal.placeOrder({ clientRequestId: `cr-${tag()}`, lines: [{ variantId: lens.v20, qty: 1 }] });
    await expect(c.portal.order({ id: o.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('places an order (portal and app), idempotently, and tells staff and the customer', async () => {
    const c = await api(customerUser);
    const req = `cr-${tag()}`;
    const o = await c.portal.placeOrder({ clientRequestId: req, patientName: 'Mr. A', surgeryDate: addDays(today, 2), lines: [{ variantId: lens.v20, qty: 2 }, { variantId: lens.v22, qty: 1 }] });
    const again = await c.portal.placeOrder({ clientRequestId: req, lines: [{ variantId: lens.v20, qty: 9 }] });
    expect(again.id).toBe(o.id);
    const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id: o.id }, include: { lines: true } });
    expect(order.source).toBe('PORTAL');
    expect(order.lines.find((l) => l.variantId === lens.v20)!.rate.toNumber()).toBe(2750);
    expect(await prisma.notification.count({ where: { userId: owner.id, title: `New order ${o.number}`, channel: 'IN_APP' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: owner.id, title: `New order ${o.number}`, channel: 'PUSH' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: customerUser.id, title: `Order ${o.number} received`, channel: 'IN_APP' } })).toBe(1);

    const m = await mobileApi(customerUser.id);
    const mo = await m.portal.placeOrder({ clientRequestId: `cr-${tag()}`, lines: [{ variantId: lens.v21, qty: 1 }] });
    expect((await prisma.salesOrder.findUniqueOrThrow({ where: { id: mo.id } })).source).toBe('MOBILE_APP');

    const view = await c.portal.order({ id: o.id });
    expect(view.lines).toHaveLength(2);
    expect(view.events[0]!.status).toBe('PLACED');
    expect((await c.portal.orders()).some((x) => x.id === o.id)).toBe(true);
  });

  it('sends order updates through the channels the customer chose', async () => {
    const c = await api(customerUser);
    await c.portal.setNotifyChannels({ channels: ['SMS'] });
    const o = await c.portal.placeOrder({ clientRequestId: `cr-${tag()}`, lines: [{ variantId: lens.v20, qty: 1 }] });
    await (await api()).orders.setStatus({ id: o.id, status: 'CONFIRMED' });
    const title = `Order ${o.number}: Confirmed`;
    expect(await prisma.notification.count({ where: { userId: customerUser.id, title, channel: 'IN_APP' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: customerUser.id, title, channel: 'SMS' } })).toBe(1);
    await deliverQueued(prisma, 100, { userId: customerUser.id });
    await new Promise((r) => setTimeout(r, 500));
    expect((await prisma.notification.findFirstOrThrow({ where: { userId: customerUser.id, title, channel: 'SMS' } })).status).toBe('sent');
    expect(deliveryLog.some((d) => d.title === title) || (await import('../src/notify/sms')).outbox.some((m) => m.message.startsWith(title))).toBe(true);
    const inbox = await c.notifications.list();
    expect(inbox.some((n) => n.title === title)).toBe(true);
    const unread = await c.notifications.unreadCount();
    await c.notifications.markRead({});
    expect(await c.notifications.unreadCount()).toBe(0);
    expect(unread).toBeGreaterThan(0);
  });

  it('shows the customer’s own invoices, ledger and statement; profile changes are requests to staff', async () => {
    const a = await api();
    const unit = await prisma.serialUnit.findFirstOrThrow({ where: { status: 'IN_STOCK', batch: { variantId: lens.v20 } } });
    const inv = await a.invoices.create({ customerId: custId, date: today, lines: [{ variantId: lens.v20, qty: 1, serialNos: [unit.serialNo] }] });
    const c = await api(customerUser);
    const docs = await c.portal.documents();
    expect(docs.invoices.map((i) => i.id)).toContain(inv.id);
    expect((await (await api(otherUser)).portal.documents()).invoices.map((i) => i.id)).not.toContain(inv.id);
    const led = await c.portal.ledger();
    expect(led.outstanding).toBeGreaterThan(0);
    const { pdf } = await renderStatement(prisma, custId);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');

    await expect(c.portal.requestChange({ message: 'short' })).rejects.toThrow(/at least 10/);
    await c.portal.requestChange({ message: 'Please add our new OT stores address at Adajan.' });
    expect(await prisma.notification.count({ where: { userId: owner.id, title: { startsWith: 'Profile change request' } } })).toBeGreaterThan(0);
  }, 30_000);
});
