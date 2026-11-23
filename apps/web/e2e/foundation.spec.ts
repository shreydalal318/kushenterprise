import { expect, test } from '@playwright/test';
import { login, snap } from './helpers';
import { run } from './run';

const employee = {
  name: `Asha Counter ${run.tag}`,
  email: `asha-${run.tag}@e2e.local`,
  temp: `Temp${run.tag}Pass1`,
  final: `Asha${run.tag}Final9`,
};

test.describe.serial('Phase 1 foundation', () => {
  test('signed-out visitors are sent to login', async ({ page }) => {
    await page.goto('/app/settings');
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fsettings/);
    await snap(page, '01-login');
  });

  test('wrong password shows a generic error', async ({ page }) => {
    await login(page, run.owner.email, 'not-the-password', { expectFail: true });
    await expect(page.getByRole('alert').filter({ hasText: 'Incorrect' })).toHaveText('Incorrect email/mobile or password');
  });

  test('owner signs in, edits settings and numbering', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();
    await snap(page, '02-owner-dashboard');

    await nav.getByRole('link', { name: 'Settings' }).click();
    await page.getByLabel('City', { exact: true }).fill(`Ahmedabad ${run.tag}`);
    await page.getByLabel('GSTIN').fill('24ABCDE1234F1Z0'); // wrong check digit
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(/check digit/)).toBeVisible();
    await page.getByLabel('GSTIN').fill('[GSTIN]');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await snap(page, '03-settings-company');

    await page.getByRole('button', { name: 'Document numbering' }).click();
    const prefix = page.getByLabel('Proforma invoice prefix');
    const newPrefix = `KE/P${run.tag.toUpperCase()}/`;
    await prefix.fill(newPrefix);
    await expect(page.getByRole('row', { name: /Proforma invoice/ })).toContainText(new RegExp(`${newPrefix}\\d{4}-\\d{2}/\\d{4}`));
    await page.getByRole('row', { name: /Proforma invoice/ }).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('row', { name: /Proforma invoice/ }).getByLabel('Saved')).toBeVisible();
    await snap(page, '04-settings-numbering');
  });

  test('owner adds an employee with limited permissions', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto('/app/employees/new');
    await page.getByLabel('Full name').fill(employee.name);
    await page.getByLabel('Email').fill(employee.email);
    await page.getByLabel('Temporary password').fill(employee.temp);
    await page.getByLabel('View orders').check();
    await page.getByLabel('Create tax invoices').check();
    await snap(page, '05-employee-new');
    await page.getByRole('button', { name: 'Create employee' }).click();
    await expect(page.getByText('Employee created.')).toBeVisible();
    await expect(page.getByRole('heading', { name: employee.name })).toBeVisible();

    await page.goto('/app/activity');
    await expect(page.getByText(`Added employee ${employee.name}`)).toBeVisible();
    await snap(page, '06-activity-log');
  });

  test('employee must change password and only sees permitted screens', async ({ page }) => {
    await login(page, employee.email, employee.temp);
    await expect(page).toHaveURL(/\/change-password$/);
    await page.getByLabel('Current password').fill(employee.temp);
    await page.getByLabel('New password', { exact: true }).fill(employee.final);
    await page.getByLabel('Confirm new password').fill(employee.final);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page).toHaveURL(/\/app$/);

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: /Orders/ })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Tax invoices/ })).toBeVisible();
    for (const hidden of ['Settings', 'Employees', 'Activity log', 'Analytics', 'Pricing', 'Customers']) {
      await expect(nav.getByRole('link', { name: hidden })).toHaveCount(0);
    }
    await snap(page, '07-employee-dashboard');

    await page.goto('/app/settings');
    await expect(page).toHaveURL(/\/app\?denied=1/);
    await expect(page.getByText("You don't have access to that page.", { exact: false })).toBeVisible();

    const res = await page.goto('/app/analytics');
    expect(res?.status()).toBe(404);

    await page.goto('/app/orders');
    await expect(page.getByRole('heading', { name: 'Orders', level: 1 })).toBeVisible();
  });

  test('the API itself refuses an employee, not just the menu', async ({ page }) => {
    await login(page, employee.email, employee.final);
    await expect(page).toHaveURL(/\/app$/);
    const res = await page.request.post('/api/trpc/employees.setPermissions', {
      data: { json: { id: 'anything', permissions: ['VIEW_ANALYTICS'] } },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(403);
    const cross = await page.request.post('/api/trpc/auth.logout', {
      data: { json: null }, headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    });
    expect(cross.status()).toBe(403);
  });

  test('owner deactivation signs the employee out immediately', async ({ browser }) => {
    const empCtx = await browser.newContext();
    const emp = await empCtx.newPage();
    await login(emp, employee.email, employee.final);
    await expect(emp).toHaveURL(/\/app$/);

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    await login(owner, run.owner.email, run.owner.password);
    await owner.goto('/app/employees');
    await owner.getByRole('link', { name: employee.name }).click();
    owner.once('dialog', (d) => d.accept());
    await owner.getByRole('button', { name: 'Deactivate' }).click();
    await expect(owner.getByText('Deactivated', { exact: true })).toBeVisible();

    await emp.goto('/app/account');
    await expect(emp).toHaveURL(/\/login/);
    await empCtx.close();
    await ownerCtx.close();
  });
});
