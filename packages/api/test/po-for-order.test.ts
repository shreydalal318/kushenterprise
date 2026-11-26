import { addDays, istDateString } from '@kush/core';
import { prisma } from '@kush/db';
import { beforeAll, describe, expect, it } from 'vitest';
import { callerFor, makeUser, randomMobile, tag } from './helpers';

const today = istDateString();
let owner: Awaited<ReturnType<typeof makeUser>>;
let clerk: Awaited<ReturnType<typeof makeUser>>;
let rep: Awaited<ReturnType<typeof makeUser>>;
let custUser: Awaited<ReturnType<typeof makeUser>>;
let lens: string; // 3 in stock
let kit: string; // none in stock
let usual: string;
let other: string;
let cust: string;
const api = async (u = owner) => (await callerFor(u.id)).api;

beforeAll(async () => {
  await prisma.state.upsert({ where: { code: '24' }, create: { code: '24', name: 'Gujarat', shortCode: 'GJ' }, update: {} });
  owner = await makeUser('OWNER');
  clerk = await makeUser('EMPLOYEE', { permissions: ['VIEW_ORDERS'] });
  rep = await makeUser('EMPLOYEE', { permissions: ['VIEW_ORDERS'] });
  const a = await api();
  const categoryId = (await a.settings.createCategory({ name: `Src ${tag()}` })).id;
  const mk = async (name: string) => {
    const p = await a.products.create({ code: `SO${tag()}`.toUpperCase(), name, categoryId, hsnCode: '90013000', gstRate: 12, unit: 'pcs', defaultRate: 900, mrp: 1500, purchaseCost: 500 });
    return (await a.products.get({ id: p.id })).variants[0]!.id;
  };
  lens = await mk('Sourcing Lens');
  kit = await mk('Sourcing Kit');
  usual = (await a.suppliers.create({ name: `Usual ${tag()}`, addressLine1: 'x', city: 'Mumbai', stateCode: '24', paymentTermsDays: 30 })).id;
  other = (await a.suppliers.create({ name: `Other ${tag()}`, addressLine1: 'x', city: 'Ahmedabad', stateCode: '24', paymentTermsDays: 30 })).id;
  // Buying the lens and kit from "usual" once makes it their usual supplier.
  await a.inventory.createGrn({ supplierId: usual, date: today, lines: [{ variantId: lens, batchNo: `L${tag()}`, expiryDate: addDays(today, 400), qty: 3 }] });
  await a.inventory.createGrn({ supplierId: usual, date: today, lines: [{ variantId: kit, batchNo: `K${tag()}`, expiryDate: addDays(today, 400), qty: 1, rate: 450 }] });
  // ...then the only kit goes out, so none is in stock.
  await prisma.stockBalance.updateMany({ where: { variantId: kit }, data: { qty: 0 } });
  cust = (await a.customers.create({ type: 'DOCTOR', name: `Dr Shah ${tag()}`, stateCode: '24', mobile: randomMobile(), paymentTermsDays: 30, billingAddress: { line1: 'Alkapuri', city: 'Vadodara', pincode: '390005', stateCode: '24' } })).id;
  custUser = await makeUser('CUSTOMER', { customerId: cust, mobile: randomMobile() });
});

describe('ordering out-of-stock items from the supplier for a customer order', () => {
  it('shows what is short, raises one PO per supplier linked to the order, and alerts the team when goods arrive', async () => {
    const a = await api();
    const o = await a.orders.create({ customerId: cust, lines: [{ variantId: lens, qty: 5 }, { variantId: kit, qty: 2 }] });
    await a.orders.assign({ id: o.id, assignedToId: rep.id });

    const s = await (await api(clerk)).orders.shortfall({ id: o.id });
    const l = s.lines.find((x) => x.variantId === lens)!;
    const k = s.lines.find((x) => x.variantId === kit)!;
    expect(l).toMatchObject({ backorder: 5, available: 3, short: 2, onOrder: 0, toOrder: 2 });
    expect(l.usualSupplier?.id).toBe(usual);
    expect(k).toMatchObject({ backorder: 2, available: 0, short: 2, toOrder: 2 });
    expect(k.usualSupplier?.id).toBe(usual); // from the supplier link recorded with the purchase rate

    await expect((await api(clerk)).purchaseOrders.createForOrder({ orderId: o.id, items: [{ variantId: lens, qty: 2, supplierId: usual }] })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const expected = addDays(today, 3);
    const r = await a.purchaseOrders.createForOrder({ orderId: o.id, items: [{ variantId: lens, qty: 2, supplierId: usual }, { variantId: kit, qty: 2, supplierId: other }], expectedDate: expected, send: true, tellCustomer: true });
    expect(r.purchaseOrders).toHaveLength(2);
    const po = await a.purchaseOrders.get({ id: r.purchaseOrders.find((p) => p.supplierId === usual)!.id });
    expect(po).toMatchObject({ status: 'SENT', expectedDate: expected });
    expect(po.note).toContain(o.number);
    expect(po.lines[0]).toMatchObject({ variantId: lens, qtyOrdered: 2, rate: 500, salesOrder: { id: o.id, number: o.number } });

    const after = await a.orders.shortfall({ id: o.id });
    expect(after.lines.find((x) => x.variantId === lens)).toMatchObject({ onOrder: 2, toOrder: 0 });
    expect(after.lines.find((x) => x.variantId === lens)!.purchaseOrders[0]).toMatchObject({ number: po.number, status: 'SENT', expectedDate: expected });
    expect((await a.orders.get({ id: o.id })).events.some((e) => e.note?.includes(po.number))).toBe(true);
    const told = await prisma.notification.findFirstOrThrow({ where: { userId: custUser.id, channel: 'IN_APP', title: { contains: 'being sourced' } } });
    expect(told.body).toContain('expected by');

    // Goods arrive against the PO: the assigned employee is told the order can go out.
    await a.inventory.createGrn({ supplierId: usual, poId: po.id, date: today, lines: [{ variantId: lens, batchNo: `L${tag()}`, expiryDate: addDays(today, 400), qty: 2 }] });
    const alert = await prisma.notification.findFirstOrThrow({ where: { userId: rep.id, title: `Stock arrived for ${o.number}`, channel: 'IN_APP' } });
    expect(alert.link).toBe(`/app/orders/${o.id}`);
    const done = await a.orders.shortfall({ id: o.id });
    expect(done.lines.find((x) => x.variantId === lens)).toMatchObject({ available: 5, short: 0, onOrder: 0 });
  });

  it('keeps the order link when a draft is edited, and refuses cancelled orders', async () => {
    const a = await api();
    const o = await a.orders.create({ customerId: cust, lines: [{ variantId: kit, qty: 1 }] });
    const r = await a.purchaseOrders.createForOrder({ orderId: o.id, items: [{ variantId: kit, qty: 1, supplierId: usual }] });
    const id = r.purchaseOrders[0]!.id;
    expect((await a.purchaseOrders.get({ id })).status).toBe('DRAFT');
    await a.purchaseOrders.update({ id, supplierId: usual, date: today, lines: [{ variantId: kit, qty: 4 }] });
    expect((await a.purchaseOrders.get({ id })).lines[0]).toMatchObject({ qtyOrdered: 4, salesOrder: { id: o.id } });

    await a.orders.setStatus({ id: o.id, status: 'CANCELLED', note: 'Doctor changed mind' });
    await expect(a.purchaseOrders.createForOrder({ orderId: o.id, items: [{ variantId: kit, qty: 1, supplierId: usual }] })).rejects.toThrow(/cancelled/);
  });
});
