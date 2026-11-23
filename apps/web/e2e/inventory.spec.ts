import { expect, test, type Page } from '@playwright/test';
import { login, randomGtin, selectByText, snap, trpc } from './helpers';
import { run } from './run';

const T = run.tag.toUpperCase();

const yymmdd = (iso: string) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const ctx: { lensId: string; lensVariant: string; gtin: string; knifeId: string; knifeBarcode: string; supplier: string } = {} as never;
const batch = `E2EB${T}`;

async function scan(page: Page, code: string) {
  const f = page.getByLabel('Scan', { exact: true });
  await f.fill(code);
  await f.press('Enter');
}

test.describe.serial('Phase 3 inventory & barcodes', () => {
  test('setup: lens with a manufacturer GTIN, a knife and a supplier', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    const cats = await trpc<{ id: string; name: string }[]>(page.request, 'settings.categories', undefined, 'GET');
    const iol = cats.find((c) => c.name === 'IOL / Lens')!.id;
    const lens = await trpc<{ id: string }>(page.request, 'products.create', { code: `INV-${T}`, name: `Inventory Lens ${T}`, categoryId: iol, hsnCode: '90213900', gstRate: 5, unit: 'pcs', defaultRate: 3000, mrp: 4000, isLens: true, lensType: 'MONOFOCAL', trackSerial: true, powerRange: { from: 21, to: 21.5, step: 0.5 } });
    const lp = await trpc<{ variants: { id: string }[] }>(page.request, 'products.get', { id: lens.id }, 'GET');
    ctx.lensId = lens.id; ctx.lensVariant = lp.variants[0]!.id; ctx.gtin = randomGtin();
    await trpc(page.request, 'products.updateVariant', { id: ctx.lensVariant, isActive: true, gtin: ctx.gtin });
    const knife = await trpc<{ id: string }>(page.request, 'products.create', { code: `KNF-${T}`, name: `Inventory Knife ${T}`, categoryId: iol, hsnCode: '90185090', gstRate: 5, unit: 'pcs', defaultRate: 180, mrp: 250, trackBatch: false, trackExpiry: false });
    const kp = await trpc<{ variants: { barcode: string }[] }>(page.request, 'products.get', { id: knife.id }, 'GET');
    ctx.knifeId = knife.id; ctx.knifeBarcode = kp.variants[0]!.barcode;
    ctx.supplier = `E2E Supplier ${T}`;
    await trpc(page.request, 'suppliers.create', { name: ctx.supplier, addressLine1: 'Plot 1', city: 'Mumbai', stateCode: '27', paymentTermsDays: 30 });
  });

  test('scan-to-receive fills batch, expiry and serials from GS1 codes', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto('/app/stock/receive');
    await selectByText(page, 'Supplier', ctx.supplier);
    const exp = inDays(500);
    // Expired box is refused at the door
    await scan(page, `(01)${ctx.gtin}(17)${yymmdd(inDays(-3))}(10)OLD${T}(21)X1`);
    await expect(page.getByText(/expired on/)).toBeVisible();
    // Two lens boxes (GS1 DataMatrix as a scanner sends it, with ]d2 prefix and GS separators)
    await scan(page, `]d201${ctx.gtin}17${yymmdd(exp)}10${batch}\x1d21SN1${T}`);
    await scan(page, `]d201${ctx.gtin}17${yymmdd(exp)}10${batch}\x1d21SN2${T}`);
    await scan(page, `]d201${ctx.gtin}17${yymmdd(exp)}10${batch}\x1d21SN2${T}`); // duplicate serial
    await expect(page.getByText(`Serial SN2${T} already scanned`)).toBeVisible();
    // Three knives by our own barcode
    for (let i = 0; i < 3; i++) await scan(page, ctx.knifeBarcode);
    await expect(page.getByLabel('Batch for line 1')).toHaveValue(batch);
    await expect(page.getByLabel('Expiry for line 1')).toHaveValue(exp);
    await expect(page.getByLabel('Quantity for line 1')).toHaveValue('2');
    await expect(page.getByLabel('Serial numbers for line 1')).toHaveValue(`SN1${T}\nSN2${T}`);
    await expect(page.getByLabel('Quantity for line 2')).toHaveValue('3');
    await snap(page, '20-receive-goods');
    await page.getByRole('button', { name: /Save goods receipt \(5 units\)/ }).click();
    await expect(page.getByText('Saved. Stock is updated.')).toBeVisible();

    // No stickers: items without a linked manufacturer barcode are flagged (the knife), the lens is not.
    const warn = page.getByRole('status').filter({ hasText: 'no manufacturer barcode linked' });
    await expect(warn).toContainText(`Inventory Knife ${T}`);
    await expect(warn).not.toContainText(`Inventory Lens ${T}`);
    await snap(page, '21-receipt');
  });

  test('stock shows on hand with status, and scan lookup finds items', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto('/app/stock');
    await page.getByPlaceholder('Product name or code').fill(`INV-${T}`);
    const row = page.getByRole('row', { name: new RegExp(`Inventory Lens ${T}`) });
    await expect(row).toContainText('2');
    await expect(row).toContainText('1 of 2 powers in stock');

    await page.goto('/app/scan');
    await scan(page, ctx.knifeBarcode);
    await expect(page.getByText(`Inventory Knife ${T}`, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('read via Internal code', { exact: false })).toBeVisible();
    await scan(page, `SN1${T}`);
    await expect(page.getByText('read via Serial number', { exact: false })).toBeVisible();
    await snap(page, '22-scan-lookup');
    // An unknown maker's code is linked once, then recognised.
    const maker = `MAKER-${T}`;
    await scan(page, maker);
    await expect(page.getByText('Unknown barcode', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Link to a product…' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByPlaceholder('Find a product by name or code').fill(`KNF-${T}`);
    await dlg.getByPlaceholder('Find a product by name or code').fill(`KNF-${T} · Inventory Knife ${T}`);
    await dlg.getByRole('button', { name: 'Link barcode' }).click();
    await expect(page.getByText('read via Linked manufacturer code', { exact: false })).toBeVisible();
  });

  test('adjusting stock needs a reason and shows in the ledger', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto(`/app/stock/product/${ctx.knifeId}`);
    await page.getByRole('button', { name: 'Adjust', exact: true }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Quantity').fill('1');
    await expect(dlg.getByRole('button', { name: 'Remove 1' })).toBeDisabled(); // no reason yet
    await dlg.getByLabel('Reason').selectOption('DAMAGED');
    await dlg.getByLabel('Note').fill('Dropped on floor');
    await dlg.getByRole('button', { name: 'Remove 1' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('link', { name: 'Ledger' }).first().click();
    await expect(page.getByRole('row', { name: /Adjustment/ })).toContainText('Damaged');
    await expect(page.getByRole('row', { name: /Closing balance/ })).toContainText('2');
    await snap(page, '23-ledger');
  });
});
