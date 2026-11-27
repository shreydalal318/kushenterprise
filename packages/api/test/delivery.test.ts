import { addDays, istDateString } from '@kush/core';
import { prisma } from '@kush/db';
import { beforeAll, describe, expect, it } from 'vitest';
import { callerFor, makeUser, randomMobile, tag } from './helpers';

const today = istDateString();
let owner: Awaited<ReturnType<typeof makeUser>>;
let rider: Awaited<ReturnType<typeof makeUser>>; // delivery boy: a staff login with no permissions
let clerk: Awaited<ReturnType<typeof makeUser>>;
let gel: string;
let cust: string;
let custUser: Awaited<ReturnType<typeof makeUser>>;
const api = async (u = owner) => (await callerFor(u.id)).api;

async function invoicedOrder(qty = 2) {
  const a = await api();
  const o = await a.orders.create({ customerId: cust, lines: [{ variantId: gel, qty }] });
  await a.orders.setStatus({ id: o.id, status: 'CONFIRMED' });
  await a.invoices.create({ customerId: cust, orderId: o.id, date: today, lines: [{ variantId: gel, qty }] });
  return o.id;
}

beforeAll(async () => {
  await prisma.state.upsert({ where: { code: '24' }, create: { code: '24', name: 'Gujarat', shortCode: 'GJ' }, update: {} });
  owner = await makeUser('OWNER');
  rider = await makeUser('EMPLOYEE', { mobile: randomMobile() });
  clerk = await makeUser('EMPLOYEE', { permissions: ['VIEW_ORDERS'] });
  const a = await api();
  const s = await a.settings.get();
  await a.settings.updateCompany({ legalName: s.legalName, addressLine1: 'Race Course Road', addressLine2: '', city: 'Vadodara', pincode: '390007', stateCode: '24', phone: '', email: '', gstin: s.gstin, pan: s.pan, drugLicenceNo: 'DL-1', jurisdictionCity: 'Vadodara' });
  const categoryId = (await a.settings.createCategory({ name: `Del ${tag()}` })).id;
  const p = await a.products.create({ code: `DL${tag()}`.toUpperCase(), name: 'Delivery Gel', categoryId, hsnCode: '30049099', gstRate: 12, unit: 'pcs', defaultRate: 400, mrp: 600, purchaseCost: 200 });
  gel = (await a.products.get({ id: p.id })).variants[0]!.id;
  const sup = (await a.suppliers.create({ name: `DS ${tag()}`, addressLine1: 'x', city: 'Vadodara', stateCode: '24', paymentTermsDays: 30 })).id;
  await a.inventory.createGrn({ supplierId: sup, date: today, lines: [{ variantId: gel, batchNo: `D${tag()}`, expiryDate: addDays(today, 400), qty: 100 }] });
  cust = (await a.customers.create({ type: 'HOSPITAL', name: `Vadodara Eye ${tag()}`, stateCode: '24', mobile: randomMobile(), paymentTermsDays: 30, billingAddress: { line1: 'Alkapuri', city: 'Vadodara', pincode: '390005', stateCode: '24' } })).id;
  custUser = await makeUser('CUSTOMER', { customerId: cust, mobile: randomMobile() });
});

describe('local delivery by our own staff', () => {
  it('suggests own delivery in the same city, hands the order to a delivery boy who marks it delivered with proof', async () => {
    const id = await invoicedOrder();
    const a = await api();
    expect((await a.orders.get({ id })).suggestedDispatch).toBe('OWN_DELIVERY');
    await expect(a.orders.setStatus({ id, status: 'DISPATCHED', dispatch: { method: 'OWN_DELIVERY', dispatchDate: today } })).rejects.toThrow(/who is delivering/);
    await a.orders.setStatus({ id, status: 'DISPATCHED', dispatch: { method: 'OWN_DELIVERY', dispatchDate: today, deliveryPersonId: rider.id, vehicleNo: 'GJ06AB1234' } });
    const inv = (await a.orders.get({ id })).invoices[0]!;
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).dispatchedThrough).toBe(`By hand (${rider.name}), GJ06AB1234`);
    expect(await prisma.notification.count({ where: { userId: rider.id, title: { startsWith: 'Delivery:' }, channel: 'IN_APP' } })).toBe(1);
    const told = await prisma.notification.findFirstOrThrow({ where: { userId: custUser.id, title: { endsWith: 'Dispatched' }, channel: 'IN_APP' }, orderBy: { createdAt: 'desc' } });
    expect(told.body).toContain(`Out for delivery today with ${rider.name}`);

    const r = await api(rider);
    const mine = await r.deliveries.mine();
    expect(mine.map((d) => d.orderId)).toContain(id);
    expect(mine.find((d) => d.orderId === id)!.address).toContain('Alkapuri');
    await expect((await api(clerk)).orders.markDelivered({ id, receivedBy: 'Someone' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(r.orders.markDelivered({ id, receivedBy: 'x' })).rejects.toThrow(/Who received/);
    await r.orders.markDelivered({ id, receivedBy: 'Sister Mary (OT store)' });
    const o = await a.orders.get({ id });
    expect(o.status).toBe('DELIVERED');
    expect(o.dispatches[0]).toMatchObject({ receivedBy: 'Sister Mary (OT store)' });
    expect(o.dispatches[0]!.deliveredAt).toBeTruthy();
    expect((await r.deliveries.mine()).map((d) => d.orderId)).not.toContain(id);
    const portal = await (await api(custUser)).portal.order({ id });
    expect(portal.dispatches[0]).toMatchObject({ method: 'OWN_DELIVERY', person: rider.name, receivedBy: 'Sister Mary (OT store)' });
  });

  it('supports someone outside the system, courier (company required), transport and customer pickup', async () => {
    const a = await api();
    const own = await invoicedOrder(1);
    await a.orders.setStatus({ id: own, status: 'DISPATCHED', dispatch: { method: 'OWN_DELIVERY', dispatchDate: today, deliveryPersonName: 'Raju (auto)', deliveryPersonMobile: '98250 11111' } });
    expect((await a.deliveries.board()).find((d) => d.orderId === own)).toMatchObject({ person: 'Raju (auto)', mobile: '98250 11111' });

    const courier = await invoicedOrder(1);
    await expect(a.orders.setStatus({ id: courier, status: 'DISPATCHED', dispatch: { method: 'COURIER', dispatchDate: today } })).rejects.toThrow(/courier company/);
    await a.orders.setStatus({ id: courier, status: 'DISPATCHED', dispatch: { method: 'COURIER', courier: 'DTDC', docketNo: 'D123', dispatchDate: today } });
    const ci = (await a.orders.get({ id: courier })).invoices[0]!;
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: ci.id } })).toMatchObject({ dispatchedThrough: 'DTDC', dispatchDocNo: 'D123' });

    const pickup = await invoicedOrder(1);
    await a.orders.setStatus({ id: pickup, status: 'DISPATCHED', dispatch: { method: 'PICKUP', dispatchDate: today } });
    const pi = (await a.orders.get({ id: pickup })).invoices[0]!;
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: pi.id } })).dispatchedThrough).toBe('Customer pickup');
    expect((await a.deliveries.board()).find((d) => d.orderId === pickup)?.method).toBe('PICKUP');
    await a.orders.markDelivered({ id: pickup, receivedBy: 'Collected by Mr. Patel' });
    expect((await a.orders.get({ id: pickup })).status).toBe('DELIVERED');
  });
});
