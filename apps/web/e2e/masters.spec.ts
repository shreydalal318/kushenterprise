import { expect, test } from '@playwright/test';
import { login, selectByText, snap } from './helpers';
import { run } from './run';

const T = run.tag.toUpperCase();
const lens = { name: `E2E Foldable IOL ${T}`, code: `E2E-${T}` };
const hospital = `E2E Eye Hospital ${T}`;
const clerk = { email: `clerk-${run.tag}@e2e.local`, temp: `Clerk${run.tag}Temp1`, final: `Clerk${run.tag}Final1` };

test.describe.serial('Phase 2 masters & pricing', () => {
  test('owner creates a lens model with its power range', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto('/app/products/new');
    await page.getByLabel('Product name').fill(lens.name);
    await page.getByLabel('Product code / SKU').fill(lens.code);
    await selectByText(page, 'Category', 'IOL / Lens'); // auto-ticks "This is a lens", HSN 90213900
    await expect(page.getByLabel('This is a lens')).toBeChecked();
    await page.getByLabel('Default selling rate (₹)').fill('3250');
    await page.getByLabel('MRP (₹)').fill('4500');
    await page.getByLabel('Purchase cost (₹)').fill('1800');
    await expect(page.getByText('Margin at default rate: 44.6%')).toBeVisible();
    await page.getByLabel('From (D)').fill('20');
    await page.getByLabel('To (D)').fill('22');
    await expect(page.getByRole('status').filter({ hasText: 'Will create' })).toContainText('5 variants');
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page.getByText('Product created with 5 power variants.')).toBeVisible();
    await expect(page.getByRole('cell', { name: '+21.50 D' })).toBeVisible();
    await expect(page.getByRole('cell', { name: `${lens.code}-+21.50`, exact: true })).toBeVisible();
    await snap(page, '10-product-detail');

    await page.goto('/app/products');
    await page.getByPlaceholder('Power, e.g. 21.5').fill('21.5');
    await page.getByPlaceholder('Name, code, SKU or barcode').fill(lens.code);
    await expect(page.getByRole('link', { name: lens.name })).toBeVisible();
    await page.getByPlaceholder('Power, e.g. 21.5').fill('25');
    await expect(page.getByText('No products match.')).toBeVisible();
  });

  test('owner adds a hospital and gives it a special price', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto('/app/customers/new');
    await page.getByLabel('Hospital / clinic name').fill(hospital);
    await selectByText(page, 'State', 'Gujarat');
    await page.getByLabel('Address line 1').fill('14 Lake View Road');
    await page.getByLabel('City', { exact: true }).fill('Ahmedabad');
    await page.getByLabel('PIN code').fill('38000'); // invalid on purpose
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByText('Enter a 6-digit PIN code')).toBeVisible();
    await page.getByLabel('PIN code').fill('380009');
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByRole('heading', { name: hospital })).toBeVisible();
    await snap(page, '11-customer-detail');

    await page.getByRole('link', { name: 'Open in pricing workbench' }).click();
    await page.getByPlaceholder('Search products').fill(lens.code);
    const row = page.getByRole('row', { name: new RegExp(lens.code) });
    await expect(row).toContainText('₹3,250.00');
    await expect(row).toContainText('Default');
    await row.getByLabel(`Special price for ${lens.code}`).fill('2900');
    await page.getByRole('button', { name: 'Save 1 change' }).click();
    await expect(row.getByText('Special', { exact: true })).toBeVisible();
    await expect(row).toContainText('₹2,900.00');
    await expect(row).toContainText('−10.8%');
    await snap(page, '12-pricing-workbench');

    const href = await page.getByRole('link', { name: 'Export Excel' }).getAttribute('href');
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('spreadsheetml');

    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByRole('cell', { name: '₹2,900.00' })).toBeVisible();
  });

  test('staff without cost permission never see costs or pricing', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto('/app/employees/new');
    await page.getByLabel('Full name').fill(`Clerk ${T}`);
    await page.getByLabel('Email').fill(clerk.email);
    await page.getByLabel('Temporary password').fill(clerk.temp);
    await page.getByLabel('Manage products & barcodes').check();
    await page.getByRole('button', { name: 'Create employee' }).click();
    await expect(page.getByText('Employee created.')).toBeVisible();
    await page.context().clearCookies();

    await login(page, clerk.email, clerk.temp);
    await page.getByLabel('Current password').fill(clerk.temp);
    await page.getByLabel('New password', { exact: true }).fill(clerk.final);
    await page.getByLabel('Confirm new password').fill(clerk.final);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page).toHaveURL(/\/app$/);

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Products' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Pricing' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Customers' })).toHaveCount(0);

    await page.goto('/app/products');
    await page.getByPlaceholder('Name, code, SKU or barcode').fill(lens.code);
    await expect(page.getByRole('link', { name: lens.name })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Cost' })).toHaveCount(0);
    await page.getByRole('link', { name: lens.name }).click();
    await expect(page.getByLabel('Purchase cost (₹)')).toHaveCount(0);
    await expect(page.getByText('Price history')).toHaveCount(0);

    await page.goto('/app/pricing');
    await expect(page).toHaveURL(/\/app\?denied=1/);
    const exp = await page.request.get('/api/pricing/export?customerId=anything');
    expect(exp.status()).toBe(403);
  });
});
