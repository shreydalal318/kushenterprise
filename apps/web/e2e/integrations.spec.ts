import { expect, test } from '@playwright/test';
import { login, snap, trpc } from './helpers';
import { run } from './run';

test.describe.serial('Phase 9 Tally, e-filing and sharing', () => {
  test('Tally XML, e-invoice JSON, share link and the integrations settings', async ({ page, browser }) => {
    await login(page, run.owner.email, run.owner.password);
    const list = await trpc<{ id: string; number: string; status: string }[]>(page.request, 'invoices.list', undefined, 'GET');
    const inv = list.find((i) => i.status !== 'CANCELLED')!;

    for (const type of ['vouchers', 'masters']) {
      const res = await page.request.get(`/api/exports/tally?type=${type}`);
      expect(res.status(), type).toBe(200);
      const xml = await res.text();
      expect(xml).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
    }
    const ej = await page.request.get('/api/exports/einvoice');
    expect(ej.status()).toBe(200);
    expect(Array.isArray(await ej.json())).toBe(true);

    await page.goto(`/app/invoices/${inv.id}`);
    await expect(page.getByText('e-Invoice & e-way bill')).toBeVisible();
    await page.getByRole('button', { name: 'Share' }).click();
    const link = page.getByLabel('Share link');
    await expect(link).toHaveValue(/\/d\//);
    await expect(page.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', /wa\.me/);
    await snap(page, '80-share-dialog');
    // The link opens the PDF without signing in.
    const anon = await browser.newContext();
    const res = await anon.request.get(new URL(await link.inputValue()).pathname);
    expect(res.headers()['content-type']).toBe('application/pdf');
    expect((await anon.request.get('/d/not-a-real-token')).status()).toBe(410);
    await anon.close();

    await page.goto('/app/settings?tab=integrations');
    await expect(page.getByLabel('Sales ledger', { exact: true })).toHaveValue(/\{rate\}/);
    await snap(page, '81-settings-integrations');
  });
});
