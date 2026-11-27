import { expect, test } from '@playwright/test';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@kush/db';
import { login, snap, trpc } from './helpers';
import { run } from './run';

const T = run.tag.toUpperCase();
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const ctx: { product: string; customer: string; mobile: string; password: string; orderNo: string } = {} as never;

test.describe.serial('Phase 6 customer portal', () => {
  test('setup: a lens with three powers (one in stock, one low, one none) and a customer login', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    const r = page.request;
    const s = await trpc<{ legalName: string }>(r, 'settings.get', undefined, 'GET');
    await trpc(r, 'settings.updateCompany', { legalName: s.legalName, addressLine1: '12 Relief Road', addressLine2: '', city: 'Ahmedabad', pincode: '380001', stateCode: '24', phone: '', email: '', gstin: '[GSTIN]', pan: '[PAN]', drugLicenceNo: '[Drug Licence No.]', jurisdictionCity: 'Ahmedabad' });
    const cats = await trpc<{ id: string; name: string }[]>(r, 'settings.categories', undefined, 'GET');
    ctx.product = `Portal Lens ${T}`;
    const p = await trpc<{ id: string }>(r, 'products.create', { code: `PRT-${T}`, name: ctx.product, categoryId: cats.find((c) => c.name === 'IOL / Lens')!.id, hsnCode: '90213900', gstRate: 5, unit: 'pcs', defaultRate: 3000, mrp: 4500, isLens: true, lensType: 'MONOFOCAL', trackSerial: true, powerRange: { from: 20, to: 21, step: 0.5 } });
    const vs = (await trpc<{ variants: { id: string }[] }>(r, 'products.get', { id: p.id }, 'GET')).variants;
    for (const v of vs) await trpc(r, 'products.updateVariant', { id: v.id, isActive: true, reorderLevel: 2 });
    const sup = await trpc<{ id: string }>(r, 'suppliers.create', { name: `Portal Supplier ${T}`, addressLine1: 'x', city: 'Ahmedabad', stateCode: '24', paymentTermsDays: 30 });
    await trpc(r, 'inventory.createGrn', { supplierId: sup.id, date: inDays(0), lines: [
      { variantId: vs[0]!.id, batchNo: `PA${T}`, expiryDate: inDays(700), serialNos: [1, 2, 3, 4].map((i) => `PA${i}${T}`), qty: 4 },
      { variantId: vs[1]!.id, batchNo: `PB${T}`, expiryDate: inDays(700), serialNos: [`PB1${T}`], qty: 1 },
    ] });
    ctx.customer = `Portal Eye Hospital ${T}`;
    const c = await trpc<{ id: string }>(r, 'customers.create', { type: 'HOSPITAL', name: ctx.customer, stateCode: '24', paymentTermsDays: 30, billingAddress: { line1: 'Ring Road', city: 'Surat', pincode: '395001', stateCode: '24' } });
    await trpc(r, 'pricing.setCustomerPrices', { customerId: c.id, rows: [{ productId: p.id, rate: 2750, validFrom: null, validTo: null }] });
    ctx.mobile = `9${String(Math.floor(1e8 + Math.random() * 9e8))}`;
    await trpc(r, 'customers.createLogin', { customerId: c.id, name: `Purchase ${T}`, mobile: ctx.mobile });
    // Customers sign in with an OTP; for the test, give this login a password instead of reading the SMS.
    ctx.password = `Portal${T}2026`;
    const prisma = new PrismaClient();
    await prisma.user.updateMany({ where: { customerId: c.id }, data: { passwordHash: await hash(ctx.password), mustChangePassword: false } });
    await prisma.$disconnect();
  });

  test('catalogue at own price with stock badges; power grid into the cart; place the order', async ({ page }) => {
    await login(page, ctx.mobile, ctx.password);
    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByRole('heading', { name: `Welcome, ${ctx.customer}` })).toBeVisible();
    await page.goto('/app');
    await expect(page).toHaveURL(/\/portal$/); // customers never reach the staff app

    await page.getByRole('link', { name: 'Catalogue' }).click();
    await page.getByLabel('Search products').fill(ctx.product);
    const card = page.getByRole('link', { name: new RegExp(ctx.product) });
    await expect(card).toContainText('₹2,750.00');
    await expect(card).toContainText('Available');
    await snap(page, '50-portal-catalogue');
    await card.click();
    await expect(page.getByText('Your agreed rate')).toBeVisible();
    await page.getByLabel(/Quantity for \+20\.00/).fill('2');
    await page.getByLabel(/Quantity for \+21\.00/).fill('1'); // on request: still orderable
    await snap(page, '51-portal-power-grid');
    await page.getByRole('button', { name: /Add 3 to cart · ₹\s?8,250\.00/ }).click();
    await expect(page.getByText('Added 3 unit(s) to your cart.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cart (3 items)' })).toBeVisible();

    await page.getByRole('link', { name: 'Go to cart' }).click();
    await page.getByLabel('Patient name (optional)').fill('Mrs. K. Mehta');
    await page.getByLabel('Surgery date (optional)').fill(inDays(3));
    await snap(page, '52-portal-checkout');
    await page.getByRole('button', { name: 'Place order' }).click();
    await page.waitForURL(/\/portal\/orders\/[^/]+\?new=1/);
    await expect(page.getByText('Thank you, your order is placed.')).toBeVisible();
    ctx.orderNo = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
    await expect(page.getByRole('link', { name: 'Cart (0 items)' })).toBeVisible();
  });

  test('staff see the new order; the customer is told when it is confirmed', async ({ page, browser }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto('/app/notifications');
    await page.getByRole('link', { name: `New order ${ctx.orderNo}` }).click();
    await page.getByRole('button', { name: 'Confirm only' }).click();
    await expect(page.getByText('Confirmed', { exact: true }).first()).toBeVisible();

    const cust = await browser.newPage();
    await login(cust, ctx.mobile, ctx.password);
    await expect(cust.getByRole('link', { name: /Notifications \(\d+ unread\)/ })).toBeVisible();
    await cust.goto('/portal/notifications');
    await expect(cust.getByRole('link', { name: `Order ${ctx.orderNo}: Confirmed` })).toBeVisible();
    await snap(cust, '53-portal-notifications');
    await cust.getByRole('link', { name: `Order ${ctx.orderNo}: Confirmed` }).click();
    await expect(cust.getByText('Mrs. K. Mehta')).toBeVisible();
    await snap(cust, '54-portal-order');

    await cust.goto('/portal/account');
    await expect(cust.getByRole('heading', { name: 'Account' })).toBeVisible();
    const pdf = await cust.request.get((await cust.getByRole('link', { name: 'Statement PDF' }).getAttribute('href'))!);
    expect(pdf.headers()['content-type']).toBe('application/pdf');

    await cust.goto('/portal/profile');
    await cust.getByLabel('What should change?').fill('Please add our new OT stores address at Adajan, Surat.');
    await cust.getByRole('button', { name: 'Send request' }).click();
    await expect(cust.getByText('Sent. We will update your account')).toBeVisible();
    await cust.close();
  });
});
