import { prisma } from '@kush/db';
import { beforeAll, describe, expect, it } from 'vitest';
import { anon, callerFor, callerWithHeaders, makeUser, randomMobile, tag } from './helpers';

let owner: Awaited<ReturnType<typeof makeUser>>;
let sales: Awaited<ReturnType<typeof makeUser>>; // MANAGE_CUSTOMERS
let store: Awaited<ReturnType<typeof makeUser>>;
let shownCode: string;
let hiddenCode: string;
const api = async (u = owner) => (await callerFor(u.id)).api;
const visitor = (ip: string) => callerWithHeaders({ 'x-forwarded-for': ip, 'user-agent': 'browser' });

beforeAll(async () => {
  await prisma.state.upsert({ where: { code: '24' }, create: { code: '24', name: 'Gujarat', shortCode: 'GJ' }, update: {} });
  owner = await makeUser('OWNER');
  sales = await makeUser('EMPLOYEE', { permissions: ['MANAGE_CUSTOMERS'] });
  store = await makeUser('EMPLOYEE', { permissions: ['MANAGE_STOCK'] });
  const a = await api();
  const categoryId = (await a.settings.createCategory({ name: `Web ${tag()}` })).id;
  shownCode = `WS${tag()}`.toUpperCase();
  hiddenCode = `WH${tag()}`.toUpperCase();
  await a.products.create({ code: shownCode, name: `Website Lens ${shownCode}`, categoryId, hsnCode: '90213900', gstRate: 5, unit: 'pcs', defaultRate: 3000, mrp: 4500, purchaseCost: 1200, isLens: true, lensType: 'TORIC', trackSerial: true, powerRange: { from: 20, to: 21, step: 0.5, cylinders: [1.5, 2.25] } });
  const h = await a.products.create({ code: hiddenCode, name: 'Hidden', categoryId, hsnCode: '90213900', gstRate: 5, unit: 'pcs', defaultRate: 10, mrp: 20 });
  await prisma.product.update({ where: { id: h.id }, data: { showOnWebsite: false } });
});

describe('public website', () => {
  it('shows the catalogue without prices, costs or stock, and hides products not marked for the website', async () => {
    const v = (await anon()).api;
    const rows = await v.website.catalogue({ q: shownCode });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/rate|price|cost|mrp|qty|stock/i);
    expect(await v.website.catalogue({ q: hiddenCode })).toHaveLength(0);
    const p = await v.website.product({ code: shownCode });
    expect(p.powers).toEqual([20, 20.5, 21]);
    expect(p.cylinders).toEqual([1.5, 2.25]);
    expect(JSON.stringify(p)).not.toMatch(/defaultRate|purchaseCost|mrp/);
    await expect(v.website.product({ code: hiddenCode })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const c = await v.website.company();
    expect(c.gstin === null || !/^\[/.test(c.gstin)).toBe(true); // placeholders never shown
  });

  it('turns an enquiry into a lead and alerts the team; bots and floods are stopped', async () => {
    const ip = `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const v = (await visitor(ip)).api;
    const mobile = randomMobile();
    const p = await prisma.product.findFirstOrThrow({ where: { code: shownCode } });
    await v.website.enquire({ name: 'Dr. Web', organisation: `Web Eye Clinic ${tag()}`, type: 'CLINIC', mobile, city: 'Rajkot', message: 'Need toric lenses for next week', productIds: [p.id], sourcePath: `/products/${shownCode}` });
    const lead = await prisma.lead.findFirstOrThrow({ where: { mobile } });
    expect(lead.productIds).toEqual([p.id]);
    expect(await prisma.notification.count({ where: { userId: sales.id, title: { startsWith: 'Website enquiry' }, channel: 'IN_APP' } })).toBeGreaterThan(0);
    expect(await prisma.notification.count({ where: { userId: store.id, title: { startsWith: 'Website enquiry' } } })).toBe(0);

    const bot = randomMobile();
    await v.website.enquire({ name: 'Bot', mobile: bot, message: 'buy cheap', website: 'http://spam.example' });
    expect(await prisma.lead.count({ where: { mobile: bot } })).toBe(0);
    for (let i = 0; i < 4; i++) await v.website.enquire({ name: `N ${i}`, mobile: randomMobile(), message: 'Hello there' });
    await expect(v.website.enquire({ name: 'Sixth', mobile: randomMobile(), message: 'Hello there' })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    await expect(v.website.enquire({ name: 'X', mobile: '12345', message: 'Hello there' })).rejects.toThrow();
  });

  it('leads: only customer managers see them; status, notes and conversion to a customer', async () => {
    await expect((await api(store)).leads.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const s = await api(sales);
    const lead = (await s.leads.list({ status: 'NEW' }))[0]!;
    expect(lead).not.toHaveProperty('ip');
    await s.leads.update({ id: lead.id, status: 'CONTACTED', notes: 'Called, sending catalogue' });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).handledById).toBe(sales.id);
    const c = await s.customers.create({ type: 'CLINIC', name: `Converted ${tag()}`, stateCode: '24', paymentTermsDays: 15, billingAddress: { line1: 'x', city: 'Rajkot', pincode: '360001', stateCode: '24' }, fromLeadId: lead.id });
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.status).toBe('CONVERTED');
    expect(after.convertedCustomerId).toBe(c.id);
    await expect(s.leads.update({ id: lead.id, status: 'CLOSED' })).rejects.toThrow(/Already converted/);
  });
});
