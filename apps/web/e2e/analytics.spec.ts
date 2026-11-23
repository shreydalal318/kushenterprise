import { expect, test } from '@playwright/test';
import { login, snap } from './helpers';
import { run } from './run';

test.describe.serial('Phase 7 analytics & reports', () => {
  test('owner dashboard shows sales tiles, the 30-day trend, orders waiting, stock and ageing', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await expect(page.getByText('Sales today (before GST)')).toBeVisible();
    await expect(page.getByRole('img', { name: /Daily sales, last 30 days/ })).toBeVisible();
    await expect(page.getByText('Orders waiting')).toBeVisible();
    await expect(page.getByText('Receivables ageing')).toBeVisible();
    await snap(page, '60-owner-dashboard');
  });

  test('analytics tabs and Excel exports', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.getByRole('link', { name: 'Analytics & reports' }).click();
    await expect(page.getByText('Top products')).toBeVisible();
    await snap(page, '61-analytics-sales');
    await page.getByRole('tab', { name: 'Margins' }).click();
    await expect(page.getByText(/Gross margin ₹/)).toBeVisible();
    await page.getByRole('tab', { name: 'GST' }).click();
    await expect(page.getByText('GSTR-1 summary')).toBeVisible();
    await expect(page.getByText('HSN summary')).toBeVisible();
    await snap(page, '62-analytics-gst');
    await page.getByRole('tab', { name: 'Reports & Excel' }).click();
    for (const name of ['sales-register', 'gst', 'sales', 'stock-summary', 'outstanding', 'expiry', 'low-stock', 'stock-valuation']) {
      const res = await page.request.get(`/api/reports/${name}.xlsx`);
      expect(res.status(), name).toBe(200);
      expect(res.headers()['content-type']).toContain('spreadsheetml');
      expect((await res.body()).subarray(0, 2).toString()).toBe('PK');
    }
    await snap(page, '63-reports');
  });

  test('reports are refused without the analytics permission', async ({ page }) => {
    const res = await page.request.get('/api/reports/sales-register.xlsx');
    expect(res.status()).toBe(401);
  });
});
