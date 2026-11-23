import { expect, test } from '@playwright/test';
import { login, selectByText, snap, trpc } from './helpers';
import { run } from './run';

const T = run.tag.toUpperCase();
const ctx: { code: string; org: string } = {} as never;

test.describe.serial('Phase 8 public website & leads', () => {
  // Enquiries are rate-limited per client address; give each run its own so re-runs never hit the limit.
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });

  test('setup: a lens shown on the website', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    const cats = await trpc<{ id: string; name: string }[]>(page.request, 'settings.categories', undefined, 'GET');
    ctx.code = `WEB-${T}`;
    await trpc(page.request, 'products.create', { code: ctx.code, name: `Website Toric IOL ${T}`, categoryId: cats.find((c) => c.name === 'IOL / Lens')!.id, hsnCode: '90213900', gstRate: 5, unit: 'pcs', defaultRate: 9000, mrp: 12000, isLens: true, lensType: 'TORIC', material: 'Hydrophobic acrylic', trackSerial: true, powerRange: { from: 18, to: 24, step: 0.5, cylinders: [1.5, 2.25] } });
  });

  test('visitor: home, catalogue without prices, product page, and an enquiry', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Lenses, instruments and consumables');
    await snap(page, '70-website-home');
    await page.getByRole('navigation', { name: 'Website' }).getByRole('link', { name: 'Products' }).click();
    await page.getByLabel('Search products').fill(ctx.code);
    await page.getByRole('button', { name: 'Search' }).click();
    const card = page.getByRole('link', { name: new RegExp(`Website Toric IOL ${T}`) });
    await expect(card).toContainText('Login to see your price');
    await expect(card).not.toContainText('₹');
    await snap(page, '71-website-catalogue');
    await card.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Website Toric IOL ${T}`);
    await expect(page.getByText('+18.00 to +24.00 D in 0.50 D steps')).toBeVisible();
    await expect(page.getByText('1.50 D, 2.25 D')).toBeVisible();
    expect(await page.locator('script[type="application/ld+json"]').textContent()).toContain(ctx.code);
    await snap(page, '72-website-product');
    await page.getByRole('link', { name: 'Enquire' }).click();
    await expect(page.getByLabel('What do you need?')).toHaveValue(new RegExp(ctx.code));
    ctx.org = `Website Eye Care ${T}`;
    await page.getByLabel('Your name').fill('Dr. Asha Mehta');
    await page.getByLabel('Mobile number').fill(`9${String(Math.floor(1e8 + Math.random() * 9e8))}`);
    await page.getByLabel('Hospital / clinic (optional)').fill(ctx.org);
    await page.getByLabel('You are a…').selectOption('CLINIC');
    await page.getByLabel('City (optional)').fill('Rajkot');
    await snap(page, '73-website-enquiry');
    await page.getByRole('button', { name: 'Send enquiry' }).click();
    await expect(page.getByText(/Thank you, Dr\./)).toBeVisible();
    for (const u of ['/robots.txt', '/sitemap.xml']) expect((await page.request.get(u)).status()).toBe(200);
    expect(await (await page.request.get('/sitemap.xml')).text()).toContain(encodeURIComponent(ctx.code));
  });

  test('staff: the enquiry is a lead; convert it into a customer', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto('/app/leads');
    await page.getByRole('button', { name: new RegExp(ctx.org) }).click();
    await expect(page.getByRole('link', { name: `Website Toric IOL ${T}` })).toBeVisible();
    await page.getByLabel('Notes (internal)').fill('Called back, wants toric 2.25 for next week');
    await page.getByRole('button', { name: 'Mark contacted' }).click();
    await snap(page, '74-leads');
    await page.getByRole('link', { name: 'Convert to customer' }).click();
    await expect(page.getByLabel('Hospital / clinic name')).toHaveValue(ctx.org);
    await expect(page.getByLabel('Contact person')).toHaveValue('Dr. Asha Mehta');
    await expect(page.getByLabel('City')).toHaveValue('Rajkot');
    await selectByText(page, /State/, 'Gujarat');
    await page.getByLabel('Address line 1').fill('Kalawad Road');
    await page.getByLabel('PIN code').fill('360005');
    await page.getByRole('button', { name: 'Create customer' }).click();
    await page.waitForURL(/\/app\/customers\/[^/]+$/);
    await page.goto('/app/leads');
    await page.getByRole('tab', { name: /Customers/ }).click();
    await expect(page.getByRole('button', { name: new RegExp(ctx.org) })).toBeVisible();
  });
});
