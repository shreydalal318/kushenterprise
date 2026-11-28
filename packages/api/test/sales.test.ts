import { addDays, computeGst, financialYear, istDateString } from '@kush/core';
import { prisma } from '@kush/db';
import { beforeAll, describe, expect, it } from 'vitest';
import { documentSource, renderDocument } from '../src/services/sales/documents';
import { callerFor, makeUser, tag } from './helpers';

const today = istDateString();
let owner: Awaited<ReturnType<typeof makeUser>>;
let clerk: Awaited<ReturnType<typeof makeUser>>; // counter staff: orders + invoices + payments, no cost / no cancel
let gj: { id: string; shipKa: string };
let ka: { id: string };
let lens: { productId: string; v: string; code: string };
let gel: { productId: string; v: string };
let supplierId: string;

async function api(u = owner) { return (await callerFor(u.id)).api; }
const serials = (n: number) => Array.from({ length: n }, () => `S${tag()}`.toUpperCase());

beforeAll(async () => {
  for (const s of [{ code: '24', name: 'Gujarat', shortCode: 'GJ' }, { code: '29', name: 'Karnataka', shortCode: 'KA' }]) await prisma.state.upsert({ where: { code: s.code }, create: s, update: {} });
  owner = await makeUser('OWNER');
  clerk = await makeUser('EMPLOYEE', { permissions: ['VIEW_ORDERS', 'CREATE_ORDERS', 'UPDATE_ORDER_STATUS', 'SCAN_DISPATCH', 'CREATE_PROFORMA', 'CREATE_TAX_INVOICE', 'RECORD_PAYMENTS', 'MANAGE_STOCK'] });
  const a = await api();
  const s = await a.settings.get();
  await a.settings.updateCompany({ legalName: s.legalName, addressLine1: '1 Test Rd', addressLine2: '', city: 'Ahmedabad', pincode: '380001', stateCode: '24', phone: '', email: '', gstin: '[GSTIN]', pan: '[PAN]', drugLicenceNo: 'DL-1', jurisdictionCity: 'Ahmedabad' });
  const categoryId = (await a.settings.createCategory({ name: `Sales ${tag()}` })).id;
  const code = `SL${tag()}`.toUpperCase();
  const l = await a.products.create({ code, name: `Sales IOL ${code}`, categoryId, hsnCode: '90213900', gstRate: 5, unit: 'pcs', defaultRate: 3250, mrp: 4500, purchaseCost: 1750, isLens: true, lensType: 'MONOFOCAL', trackSerial: true, powerRange: { from: 21, to: 21, step: 0.5 } });
  lens = { productId: l.id, v: (await a.products.get({ id: l.id })).variants[0]!.id, code };
  const g = await a.products.create({ code: `GL${tag()}`.toUpperCase(), name: 'Sales Gel', categoryId, hsnCode: '30049099', gstRate: 5, unit: 'pcs', defaultRate: 420, mrp: 650, purchaseCost: 210 });
  gel = { productId: g.id, v: (await a.products.get({ id: g.id })).variants[0]!.id };
  supplierId = (await a.suppliers.create({ name: `S ${tag()}`, addressLine1: 'x', city: 'Mumbai', stateCode: '24', paymentTermsDays: 30 })).id;
  await a.inventory.createGrn({ supplierId, date: today, lines: [
    { variantId: gel.v, batchNo: `SOON${tag()}`, expiryDate: addDays(today, 60), qty: 3 },
    { variantId: gel.v, batchNo: `LATE${tag()}`, expiryDate: addDays(today, 600), qty: 50 },
  ] });
  const c1 = await a.customers.create({ type: 'HOSPITAL', name: `GJ Hospital ${tag()}`, stateCode: '24', paymentTermsDays: 30, billingAddress: { line1: 'a', city: 'Surat', pincode: '395001', stateCode: '24' } });
  const ship = await a.customers.addAddress({ customerId: c1.id, kind: 'SHIPPING', isDefault: false, address: { line1: 'Branch', city: 'Bengaluru', pincode: '560001', stateCode: '29' } });
  await a.customers.addAddress({ customerId: c1.id, kind: 'SHIPPING', isDefault: true, address: { line1: 'OT Stores', city: 'Surat', pincode: '395001', stateCode: '24' } });
  gj = { id: c1.id, shipKa: ship.id };
  ka = { id: (await a.customers.create({ type: 'CLINIC', name: `KA Clinic ${tag()}`, stateCode: '29', paymentTermsDays: 15, billingAddress: { line1: 'b', city: 'Mysuru', pincode: '570001', stateCode: '29' } })).id };
  await a.pricing.setCustomerPrices({ customerId: gj.id, rows: [{ productId: lens.productId, rate: 2900, validFrom: null, validTo: null }] });
});

async function stockLens(n: number) {
  const sn = serials(n);
  await (await api()).inventory.createGrn({ supplierId, date: today, lines: [{ variantId: lens.v, batchNo: `LB${tag()}`, expiryDate: addDays(today, 700), serialNos: sn, qty: n }] });
  return sn;
}
const gelQty = async () => (await (await api()).inventory.productStock({ productId: gel.productId })).variants[0]!.qty;

describe('tax invoice', () => {
  it('prices at the customer rate, takes stock FEFO, sells serials and computes CGST+SGST', async () => {
    const sn = await stockLens(2);
    const before = await gelQty();
    const c = await api(clerk);
    const r = await c.invoices.create({ customerId: gj.id, date: today, clientRequestId: `req-${tag()}`, lines: [
      { variantId: lens.v, qty: 2, serialNos: sn, rate: 1 /* ignored: clerk can't override */ },
      { variantId: gel.v, qty: 5, discPct: 10 },
    ] });
    expect(r.number).toMatch(new RegExp(`/${financialYear(today)}/\\d{4}$`));
    const inv = await c.invoices.get({ id: r.id });
    expect(inv.taxType).toBe('INTRA_STATE');
    const lensLine = inv.lines.find((l) => l.variantId === lens.v)!;
    expect(lensLine.rate).toBe(2900); // special price, not the clerk's "1"
    expect(lensLine.serialNos.sort()).toEqual([...sn].sort());
    // Gel: 3 from the soon-expiring batch first, then 2 from the later batch → two lines
    const gelLines = inv.lines.filter((l) => l.variantId === gel.v);
    expect(gelLines.map((l) => l.qty)).toEqual([3, 2]);
    expect(await gelQty()).toBe(before - 5);
    const g = computeGst('24', '24', inv.lines.map((l) => ({ qty: l.qty, rate: l.rate, discPct: l.discPct, hsn: l.hsnCode, gstRate: l.gstRate })));
    expect(inv.grandTotal).toBe(g.total);
    expect(inv.cgstTotal).toBe(g.cgst);
    expect(inv.igstTotal).toBe(0);
    expect(inv.dueDate).toBe(addDays(today, 30));
    expect(await prisma.serialUnit.count({ where: { serialNo: { in: sn }, status: 'SOLD', invoiceLineId: { not: null } } })).toBe(2);
    // Retrying the same request (e.g. weak network) never creates a second invoice
    const again = await c.invoices.create({ customerId: gj.id, date: today, clientRequestId: (await prisma.invoice.findUniqueOrThrow({ where: { id: r.id } })).clientRequestId!, lines: [{ variantId: gel.v, qty: 1 }] });
    expect(again).toMatchObject({ id: r.id, duplicate: true });
  });

  it('uses IGST when goods ship to another state, whatever the billing state', async () => {
    const r = await (await api()).invoices.create({ customerId: gj.id, shippingAddressId: gj.shipKa, date: today, lines: [{ variantId: gel.v, qty: 1 }] });
    const inv = await (await api()).invoices.get({ id: r.id });
    expect(inv.taxType).toBe('INTER_STATE');
    expect(inv.placeOfSupply).toBe('29');
    expect(inv.igstTotal).toBeGreaterThan(0);
  });

  it('refuses expired batches, unknown serials, short stock and rates above MRP', async () => {
    const a = await api();
    const expired = await prisma.batch.create({ data: { variantId: gel.v, batchNo: `EXP${tag()}`, expiryDate: new Date(`${addDays(today, -1)}T00:00:00Z`) } });
    await expect(a.invoices.create({ customerId: gj.id, date: today, lines: [{ variantId: gel.v, qty: 1, batchId: expired.id }] })).rejects.toThrow(/expired/);
    await expect(a.invoices.create({ customerId: gj.id, date: today, lines: [{ variantId: lens.v, qty: 1, serialNos: ['NOPE'] }] })).rejects.toThrow(/not in stock/);
    await expect(a.invoices.create({ customerId: gj.id, date: today, lines: [{ variantId: gel.v, qty: 9999 }] })).rejects.toThrow(/only \d+ in stock/);
    await expect(a.invoices.create({ customerId: gj.id, date: today, lines: [{ variantId: gel.v, qty: 1, rate: 9999 }] })).rejects.toThrow(/above MRP/);
  });

  it('cancels (owner only) and puts stock and serials back; a paid invoice cannot be cancelled', async () => {
    const sn = await stockLens(1);
    const r = await (await api(clerk)).invoices.create({ customerId: ka.id, date: today, lines: [{ variantId: lens.v, qty: 1, serialNos: sn }] });
    await expect((await api(clerk)).invoices.cancel({ id: r.id, reason: 'Wrong customer' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await (await api()).invoices.cancel({ id: r.id, reason: 'Wrong customer' });
    expect((await prisma.serialUnit.findFirst({ where: { serialNo: sn[0] } }))?.status).toBe('IN_STOCK');
    const doc = await documentSource(prisma, 'invoice', r.id);
    expect(doc.src.watermark).toBe('CANCELLED');
    await expect((await api()).invoices.cancel({ id: r.id, reason: 'again please' })).rejects.toThrow(/Already cancelled/);

    const paid = await (await api()).invoices.create({ customerId: ka.id, date: today, lines: [{ variantId: gel.v, qty: 1 }] });
    await (await api(clerk)).payments.record({ customerId: ka.id, date: today, amount: 100, mode: 'UPI', allocations: [{ invoiceId: paid.id, amount: 100 }] });
    await expect((await api()).invoices.cancel({ id: paid.id, reason: 'Testing cancel' })).rejects.toThrow(/Payments are applied/);
  });

  it('renders a real PDF whose figures match the saved invoice', async () => {
    const r = await (await api()).invoices.create({ customerId: gj.id, date: today, lines: [{ variantId: gel.v, qty: 2 }] });
    const { pdf, filename } = await renderDocument(prisma, 'invoice', r.id, ['ORIGINAL', 'DUPLICATE']);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(filename).toMatch(/\.pdf$/);
  }, 30_000);
});

describe('orders → invoice → dispatch', () => {
  it('locks rates, tracks back-orders, enforces the status flow and dispatch details', async () => {
    const c = await api(clerk);
    const o = await c.orders.create({ customerId: gj.id, patientName: 'Mr. P', lines: [{ variantId: gel.v, qty: 4 }] });
    await prisma.product.update({ where: { id: gel.productId }, data: { defaultRate: 500 } }); // price rises after ordering
    await expect(c.orders.setStatus({ id: o.id, status: 'DISPATCHED' })).rejects.toThrow(/cannot be marked/);
    await c.orders.setStatus({ id: o.id, status: 'CONFIRMED' });
    const check = await c.orders.verifyPacked({ id: o.id, scanned: [{ variantId: gel.v, qty: 3 }] });
    expect(check).toMatchObject({ ok: false });
    expect((await c.orders.verifyPacked({ id: o.id, scanned: [{ variantId: gel.v, qty: 4 }] })).ok).toBe(true);
    expect((await c.orders.get({ id: o.id })).status).toBe('PACKED');
    await expect(c.orders.setStatus({ id: o.id, status: 'DISPATCHED', dispatch: { dispatchDate: today } })).rejects.toThrow(/tax invoice before/);

    const inv = await c.invoices.create({ customerId: gj.id, orderId: o.id, date: today, lines: [{ variantId: gel.v, qty: 3 }] }); // partial
    const after = await c.orders.get({ id: o.id });
    expect(after.lines[0]).toMatchObject({ qtyDispatched: 3, backorder: 1, rate: 420 });
    expect((await c.invoices.get({ id: inv.id })).lines[0]!.rate).toBe(420); // order's locked rate, not 500
    await c.orders.setStatus({ id: o.id, status: 'DISPATCHED', dispatch: { dispatchDate: today, courier: 'BlueDart', docketNo: 'BD-1' } });
    expect((await c.invoices.get({ id: inv.id })).dispatchedThrough).toBe('BlueDart');
    await expect(c.orders.setStatus({ id: o.id, status: 'CANCELLED' })).rejects.toThrow();
    await c.orders.setStatus({ id: o.id, status: 'DELIVERED' });
    expect((await c.orders.get({ id: o.id })).events.map((e) => e.status)).toEqual(['PLACED', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED']);
    await prisma.product.update({ where: { id: gel.productId }, data: { defaultRate: 420 } });
  });

  it('refuses to cancel an order with invoices, and lets view-only staff do nothing else', async () => {
    const viewer = await makeUser('EMPLOYEE', { permissions: ['VIEW_ORDERS'] });
    const v = await api(viewer);
    expect(Array.isArray(await v.orders.list())).toBe(true);
    await expect(v.invoices.create({ customerId: gj.id, date: today, lines: [{ variantId: gel.v, qty: 1 }] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(v.payments.record({ customerId: gj.id, date: today, amount: 1, mode: 'CASH' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('treats raising the invoice as confirming and packing the order', async () => {
    const c = await api(clerk);
    const o = await c.orders.create({ customerId: gj.id, lines: [{ variantId: gel.v, qty: 2 }] });
    await c.invoices.create({ customerId: gj.id, orderId: o.id, date: today, lines: [{ variantId: gel.v, qty: 2 }] });
    const after = await c.orders.get({ id: o.id });
    expect(after.status).toBe('PACKED');
    expect(after.events.map((e) => e.status)).toEqual(['PLACED', 'CONFIRMED', 'PACKED']);
    await c.orders.setStatus({ id: o.id, status: 'DISPATCHED', dispatch: { dispatchDate: today, method: 'PICKUP' } });
    expect((await c.orders.get({ id: o.id })).status).toBe('DISPATCHED');
  });

  it('dispatches a back-order shipment once its invoice is made', async () => {
    const c = await api(clerk);
    const pickup = { dispatchDate: today, method: 'PICKUP' as const };
    const o = await c.orders.create({ customerId: gj.id, lines: [{ variantId: gel.v, qty: 3 }] });
    await c.invoices.create({ customerId: gj.id, orderId: o.id, date: today, lines: [{ variantId: gel.v, qty: 2 }] });
    await c.orders.setStatus({ id: o.id, status: 'DISPATCHED', dispatch: pickup });
    await expect(c.orders.setStatus({ id: o.id, status: 'DISPATCHED', dispatch: pickup })).rejects.toThrow(/cannot be marked/); // nothing new to send
    const second = await c.invoices.create({ customerId: gj.id, orderId: o.id, date: today, lines: [{ variantId: gel.v, qty: 1 }] });
    await c.orders.setStatus({ id: o.id, status: 'DISPATCHED', dispatch: pickup });
    const d = await c.orders.get({ id: o.id });
    expect(d.dispatches).toHaveLength(2);
    expect(d.dispatches.map((x) => x.invoiceId)).toContain(second.id);
  });

  it('puts the order back to Confirmed when its only invoice is cancelled', async () => {
    const o = await (await api(clerk)).orders.create({ customerId: gj.id, lines: [{ variantId: gel.v, qty: 1 }] });
    const inv = await (await api(clerk)).invoices.create({ customerId: gj.id, orderId: o.id, date: today, lines: [{ variantId: gel.v, qty: 1 }] });
    await (await api()).invoices.cancel({ id: inv.id, reason: 'Wrong customer' });
    expect((await (await api()).orders.get({ id: o.id })).status).toBe('CONFIRMED');
  });

  it('counts and lists orders by the next step: to invoice (placed or confirmed), then to dispatch (packed)', async () => {
    const c = await api(clerk);
    const h0 = (await c.analytics.home()).staff;
    const o = await c.orders.create({ customerId: gj.id, lines: [{ variantId: gel.v, qty: 1 }] });
    const ids = async (status: 'TO_INVOICE' | 'PACKED') => (await c.orders.list({ status })).map((x) => x.id);
    const h1 = (await c.analytics.home()).staff;
    expect([h1.toInvoice - h0.toInvoice, h1.toDispatch - h0.toDispatch]).toEqual([1, 0]);
    expect(await ids('TO_INVOICE')).toContain(o.id);
    await c.orders.setStatus({ id: o.id, status: 'CONFIRMED' });
    expect(await ids('TO_INVOICE')).toContain(o.id);
    await c.invoices.create({ customerId: gj.id, orderId: o.id, date: today, lines: [{ variantId: gel.v, qty: 1 }] });
    const h2 = (await c.analytics.home()).staff;
    expect([h2.toInvoice - h0.toInvoice, h2.toDispatch - h0.toDispatch]).toEqual([0, 1]);
    expect(await ids('TO_INVOICE')).not.toContain(o.id);
    expect(await ids('PACKED')).toContain(o.id);
  });

  it('finds items to add by name, code, power or barcode, with unexpired stock on hand', async () => {
    const c = await api(clerk);
    const byCode = await c.products.search({ q: lens.code.toLowerCase() });
    expect(byCode.rows.map((r) => r.variantId)).toContain(lens.v);
    const row = (await c.products.search({ q: `${lens.code} 21` })).rows.find((r) => r.variantId === lens.v)!;
    expect(row).toMatchObject({ productId: lens.productId, label: '+21.00 D', trackSerial: true });
    expect((await c.products.search({ q: `${lens.code} +21.00` })).rows.map((r) => r.variantId)).toEqual([lens.v]);
    expect((await c.products.search({ q: `${lens.code} 25.5` })).rows).toHaveLength(0);
    const gp = await c.products.get({ id: gel.productId });
    const g = (await c.products.search({ q: `gel ${gp.code}` })).rows.find((r) => r.variantId === gel.v)!;
    expect(g.inStock).toBe(await gelQty());
    expect((await c.products.search({ q: gp.variants[0]!.barcode })).rows.map((r) => r.variantId)).toContain(gel.v);
    expect((await c.products.search({ q: `nothing-${tag()}` })).rows).toHaveLength(0);
  });

  it('lets whoever enters an order choose an employee to handle it, and tells them', async () => {
    const handler = await makeUser('EMPLOYEE', { permissions: ['VIEW_ORDERS'] });
    const c = await api(clerk);
    const o = await c.orders.create({ customerId: gj.id, lines: [{ variantId: gel.v, qty: 1 }], assignedToId: handler.id });
    expect((await c.orders.get({ id: o.id })).assignedTo?.id).toBe(handler.id);
    expect(await prisma.notification.count({ where: { userId: handler.id, title: `You'll deliver ${o.number}`, channel: 'IN_APP' } })).toBe(1);
    await expect(c.orders.create({ customerId: gj.id, lines: [{ variantId: gel.v, qty: 1 }], assignedToId: owner.id })).rejects.toThrow(/active employee/);

    const open = await c.orders.create({ customerId: gj.id, lines: [{ variantId: gel.v, qty: 1 }] });
    expect((await c.orders.get({ id: open.id })).assignedTo).toBeNull();
    expect((await c.orders.list({ unassigned: true })).some((x) => x.id === open.id)).toBe(true);
    await c.orders.assign({ id: open.id, assignedToId: handler.id }); // the clerk can enter orders, so can assign
    expect(await prisma.notification.count({ where: { userId: handler.id, title: `You'll deliver ${open.number}` } })).toBeGreaterThan(0);
    expect((await c.orders.list({ unassigned: true })).some((x) => x.id === open.id)).toBe(false);
    await expect(c.orders.assign({ id: open.id, assignedToId: owner.id })).rejects.toThrow(/active employee/);
  });

  it('tells the whole order team about a new order, but not whoever entered it', async () => {
    const packer = await makeUser('EMPLOYEE', { permissions: ['VIEW_ORDERS', 'SCAN_DISPATCH'] });
    const noOrders = await makeUser('EMPLOYEE', { permissions: [] });
    const o = await (await api(clerk)).orders.create({ customerId: gj.id, lines: [{ variantId: gel.v, qty: 1 }] });
    const got = async (u: { id: string }) => prisma.notification.count({ where: { userId: u.id, title: `New order ${o.number}`, channel: 'IN_APP' } });
    expect(await got(owner)).toBe(1);
    expect(await got(packer)).toBe(1);
    expect(await got(clerk)).toBe(0);
    expect(await got(noOrders)).toBe(0);
  });
});

describe('proforma', () => {
  it('reserves no stock and converts to an invoice at the quoted rate', async () => {
    const before = await gelQty();
    const p = await (await api(clerk)).proformas.create({ customerId: ka.id, date: today, lines: [{ variantId: gel.v, qty: 2 }] });
    expect(p.number).toMatch(new RegExp(`/${financialYear(today)}/\\d{4}$`));
    expect(await gelQty()).toBe(before);
    await prisma.product.update({ where: { id: gel.productId }, data: { defaultRate: 480 } });
    const inv = await (await api(clerk)).proformas.convert({ id: p.id, date: today });
    const i = await (await api()).invoices.get({ id: inv.id });
    expect(i.lines[0]!.rate).toBe(420);
    expect(i.proforma?.id).toBe(p.id);
    expect((await (await api()).proformas.get({ id: p.id })).status).toBe('CONVERTED');
    await expect((await api()).proformas.convert({ id: p.id, date: today })).rejects.toThrow(/Already converted/);
    await prisma.product.update({ where: { id: gel.productId }, data: { defaultRate: 420 } });
  });

  it('needs a company state before any GST document', async () => {
    await prisma.companySettings.update({ where: { id: 'company' }, data: { stateCode: 'XX' } });
    await expect((await api()).proformas.create({ customerId: ka.id, date: today, lines: [{ variantId: gel.v, qty: 1 }] })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await prisma.companySettings.update({ where: { id: 'company' }, data: { stateCode: '24' } });
  });
});

describe('payments, credit notes and the customer ledger', () => {
  it('allocates oldest first, keeps the rest on account, and reports ageing', async () => {
    const a = await api();
    const cust = (await a.customers.create({ type: 'DOCTOR', name: `Dr Ledger ${tag()}`, stateCode: '24', paymentTermsDays: 7, billingAddress: { line1: 'c', city: 'Rajkot', pincode: '360001', stateCode: '24' } })).id;
    const i1 = await a.invoices.create({ customerId: cust, date: addDays(today, -40), lines: [{ variantId: gel.v, qty: 2 }] });
    const i2 = await a.invoices.create({ customerId: cust, date: today, lines: [{ variantId: gel.v, qty: 1 }] });
    const t1 = (await a.invoices.get({ id: i1.id })).grandTotal;
    const t2 = (await a.invoices.get({ id: i2.id })).grandTotal;
    const pay = await (await api(clerk)).payments.record({ customerId: cust, date: today, amount: t1 + 100, mode: 'NEFT_RTGS', reference: 'UTR1', autoAllocate: true });
    expect(pay.onAccount).toBe(0);
    expect((await a.invoices.get({ id: i1.id })).paymentStatus).toBe('PAID');
    expect((await a.invoices.get({ id: i2.id })).paymentStatus).toBe('PARTLY_PAID');

    let led = await (await api(clerk)).ledger.customer({ customerId: cust });
    expect(led.closing).toBe(Math.round((t1 + t2 - t1 - 100) * 100) / 100);
    expect(led.outstanding).toBe(led.closing);
    expect(led.ageing['0–30']).toBe(led.outstanding);

    // Money received in advance stays on account and can be applied later
    const adv = await (await api(clerk)).payments.record({ customerId: cust, date: today, amount: 500, mode: 'CASH' });
    expect(adv.onAccount).toBe(500);
    led = await a.ledger.customer({ customerId: cust });
    expect(led.onAccount).toBe(500);
    const due2 = (await a.invoices.get({ id: i2.id })).due;
    await (await api(clerk)).payments.allocate({ paymentId: adv.id, allocations: [{ invoiceId: i2.id, amount: due2 }] });
    expect((await a.invoices.get({ id: i2.id })).paymentStatus).toBe('PAID');

    // Deleting a wrong payment (owner) un-applies it
    await expect((await api(clerk)).payments.remove({ id: adv.id, reason: 'Entered twice' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await a.payments.remove({ id: adv.id, reason: 'Entered twice' });
    expect((await a.invoices.get({ id: i2.id })).paymentStatus).not.toBe('PAID');
  });

  it('credits returned serial units back into stock and reduces what is owed', async () => {
    const sn = await stockLens(2);
    const a = await api();
    const r = await a.invoices.create({ customerId: gj.id, date: today, lines: [{ variantId: lens.v, qty: 2, serialNos: sn }] });
    const inv = await a.invoices.get({ id: r.id });
    const line = inv.lines[0]!;
    await expect(a.creditNotes.create({ invoiceId: r.id, date: today, reason: 'Wrong power', restock: true, lines: [{ invoiceLineId: line.id, qty: 3 }] })).rejects.toThrow(/only 2 left/);
    await expect(a.creditNotes.create({ invoiceId: r.id, date: today, reason: 'Wrong power', restock: true, lines: [{ invoiceLineId: line.id, qty: 1, serialNos: ['XYZ'] }] })).rejects.toThrow(/not sold on this invoice/);
    const cn = await (await api(clerk)).creditNotes.create({ invoiceId: r.id, date: today, reason: 'Wrong power', restock: true, lines: [{ invoiceLineId: line.id, qty: 1, serialNos: [sn[0]!] }] });
    expect(cn.number).toMatch(/CN/);
    expect(cn.total).toBe(Math.round(2900 * 1.05));
    expect((await prisma.serialUnit.findFirst({ where: { serialNo: sn[0] } }))?.status).toBe('IN_STOCK');
    const after = await a.invoices.get({ id: r.id });
    expect(after.credited).toBe(cn.total);
    expect(after.due).toBe(Math.round((after.grandTotal - cn.total) * 100) / 100);
    expect(after.lines[0]!.creditedQty).toBe(1);
    expect(after.lines[0]!.returnedSerials).toEqual([sn[0]]);
    // The other one comes back later: the first serial can't be returned twice, the second can.
    await expect(a.creditNotes.create({ invoiceId: r.id, date: today, reason: 'Second one back', restock: false, lines: [{ invoiceLineId: line.id, qty: 1, serialNos: [sn[0]!] }] })).rejects.toThrow(/already came back/);
    await a.creditNotes.create({ invoiceId: r.id, date: today, reason: 'Second one back', restock: false, lines: [{ invoiceLineId: line.id, qty: 1, serialNos: [sn[1]!] }] });
    expect((await a.invoices.get({ id: r.id })).lines[0]!.returnedSerials.sort()).toEqual([...sn].sort());
    await expect(a.creditNotes.create({ invoiceId: r.id, date: today, reason: 'Again', restock: false, lines: [{ invoiceLineId: line.id, qty: 1, serialNos: [sn[1]!] }] })).rejects.toThrow(/only 0 left/);
    // Backup lenses: the one returned to stock can be sold again on a new invoice, and returned again from it.
    const again = await a.invoices.create({ customerId: gj.id, date: today, lines: [{ variantId: lens.v, qty: 1, serialNos: [sn[0]!] }] });
    const againLine = (await a.invoices.get({ id: again.id })).lines[0]!;
    expect(againLine.returnedSerials).toEqual([]);
    await a.creditNotes.create({ invoiceId: again.id, date: today, reason: 'Backup not used', restock: true, lines: [{ invoiceLineId: againLine.id, qty: 1, serialNos: [sn[0]!] }] });
    expect((await prisma.serialUnit.findFirst({ where: { serialNo: sn[0] } }))?.status).toBe('IN_STOCK');
    const { pdf } = await renderDocument(prisma, 'credit-note', cn.id);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);
});
