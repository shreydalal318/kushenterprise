import { expect, test, type Page } from '@playwright/test';
import { login, randomGtin, selectByText, snap, trpc } from './helpers';
import { run } from './run';

const T = run.tag.toUpperCase();
const yymmdd = (iso: string) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const ctx: { supplier: string; gelName: string; gtin: string; otherBarcode: string; poUrl: string } = {} as never;

async function scan(page: Page, code: string) {
  const f = page.getByLabel('Scan', { exact: true });
  await f.fill(code);
  await f.press('Enter');
}

test.describe.serial('Phase 5 purchase orders', () => {
  test('setup: company state, an out-of-state supplier, a low-stock gel and a lens with a GTIN', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    const r = page.request;
    const s = await trpc<{ legalName: string }>(r, 'settings.get', undefined, 'GET');
    await trpc(r, 'settings.updateCompany', { legalName: s.legalName, addressLine1: '12 Relief Road', addressLine2: '', city: 'Ahmedabad', pincode: '380001', stateCode: '24', phone: '', email: '', gstin: '[GSTIN]', pan: '[PAN]', drugLicenceNo: '[Drug Licence No.]', jurisdictionCity: 'Ahmedabad' });
    const cats = await trpc<{ id: string; name: string }[]>(r, 'settings.categories', undefined, 'GET');
    const categoryId = cats.find((c) => c.name === 'Consumable')!.id;
    ctx.supplier = `PO Supplier ${T}`;
    const sup = await trpc<{ id: string }>(r, 'suppliers.create', { name: ctx.supplier, addressLine1: 'MIDC', city: 'Mumbai', stateCode: '27', paymentTermsDays: 45 });
    ctx.gelName = `PO Gel ${T}`;
    const gel = await trpc<{ id: string }>(r, 'products.create', { code: `POG-${T}`, name: ctx.gelName, categoryId, hsnCode: '30049099', gstRate: 12, unit: 'pcs', defaultRate: 400, mrp: 650, purchaseCost: 210 });
    const gv = (await trpc<{ variants: { id: string }[] }>(r, 'products.get', { id: gel.id }, 'GET')).variants[0]!.id;
    await trpc(r, 'products.updateVariant', { id: gv, isActive: true, reorderLevel: 10 });
    // 2 on hand, bought at ₹190 last time from this supplier → reorder suggestion 18 @ ₹190
    await trpc(r, 'inventory.createGrn', { supplierId: sup.id, date: inDays(0), lines: [{ variantId: gv, batchNo: `OLD${T}`, expiryDate: inDays(300), qty: 2, rate: 190 }] });
    const iol = cats.find((c) => c.name === 'IOL / Lens')!.id;
    const lens = await trpc<{ id: string }>(r, 'products.create', { code: `POL-${T}`, name: `PO Lens ${T}`, categoryId: iol, hsnCode: '90213900', gstRate: 5, unit: 'pcs', defaultRate: 3000, mrp: 4000, purchaseCost: 1500, isLens: true, lensType: 'MONOFOCAL', trackSerial: true, powerRange: { from: 21, to: 21, step: 0.5 } });
    const lv = (await trpc<{ variants: { id: string }[] }>(r, 'products.get', { id: lens.id }, 'GET')).variants[0]!.id;
    ctx.gtin = randomGtin();
    await trpc(r, 'products.updateVariant', { id: lv, isActive: true, gtin: ctx.gtin });
    const other = await trpc<{ id: string }>(r, 'products.create', { code: `POX-${T}`, name: `Not Ordered ${T}`, categoryId, hsnCode: '90185090', gstRate: 12, unit: 'pcs', defaultRate: 100, mrp: 150, trackBatch: false, trackExpiry: false });
    ctx.otherBarcode = (await trpc<{ variants: { barcode: string }[] }>(r, 'products.get', { id: other.id }, 'GET')).variants[0]!.barcode;
  });

  test('create a PO from reorder suggestions and a scanned lens, then send it', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto('/app/purchase-orders/new');
    await selectByText(page, 'Supplier', ctx.supplier);
    await expect(page.getByText('IGST', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Items below reorder level' }).click();
    await page.getByLabel(`Order ${ctx.gelName}`).check();
    await expect(page.getByLabel(`Order quantity for ${ctx.gelName}`)).toHaveValue('18');
    await page.getByRole('button', { name: 'Add 1 item(s) to the PO' }).click();
    await scan(page, ctx.gtin);
    await scan(page, ctx.gtin);
    await expect(page.getByLabel('Quantity for line 1')).toHaveValue('18');
    await expect(page.getByLabel('Rate for line 1')).toHaveValue('190');
    await expect(page.getByText('Last paid')).toBeVisible();
    await expect(page.getByLabel('Quantity for line 2')).toHaveValue('2');
    await page.getByLabel('Rate for line 2').fill('1450');
    // 18 × 190 = 3420 @12% (410.40) + 2 × 1450 = 2900 @5% (145) → 6875.40 → 6875.00
    await snap(page, '40-po-editor');
    await page.getByRole('button', { name: /Save as draft · ₹\s?6,875\.00/ }).click();
    await page.waitForURL(/\/app\/purchase-orders\/[^/]+\?new=1/);
    ctx.poUrl = page.url().split('?')[0]!;
    const pdf = await page.request.get(`/api/documents/purchase-order/${ctx.poUrl.split('/').pop()}`);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    await page.getByRole('button', { name: 'Mark as sent' }).click();
    await expect(page.getByText('Sent', { exact: true })).toBeVisible();
  });

  test('receive part of it against the PO; items not on the PO are refused; then short-close', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto(ctx.poUrl);
    await page.getByRole('main').getByRole('link', { name: 'Receive goods' }).click();
    await expect(page.getByText(/Due on KE\/PO\//)).toBeVisible();
    await scan(page, ctx.otherBarcode);
    await expect(page.getByText(/is not on KE\/PO\//)).toBeVisible();
    const exp = yymmdd(inDays(800));
    await scan(page, `]d201${ctx.gtin}17${exp}10LB${T}\x1d21PS1${T}`);
    await scan(page, `]d201${ctx.gtin}17${exp}10LB${T}\x1d21PS2${T}`);
    await page.getByRole('button', { name: 'Add everything still due' }).click();
    await expect(page.getByLabel('Quantity for line 2')).toHaveValue('18');
    await page.getByLabel('Quantity for line 2').fill('12');
    await page.getByLabel('Batch for line 2').fill(`NEW${T}`);
    await page.getByLabel('Expiry for line 2').fill(inDays(500));
    await expect(page.getByText('12 / 18 due')).toBeVisible();
    await snap(page, '41-receive-against-po');
    await page.getByRole('button', { name: /Save goods receipt \(14 units\)/ }).click();
    await expect(page.getByText('Saved. Stock is updated.')).toBeVisible();
    await expect(page.getByRole('link', { name: /KE\/PO\// })).toBeVisible();

    await page.goto(ctx.poUrl);
    await expect(page.getByText('Partly received')).toBeVisible();
    await expect(page.getByText('6 unit(s) still to come')).toBeVisible();
    await page.getByRole('button', { name: 'Short-close' }).click();
    await page.getByLabel('Reason').fill('Balance not available with the supplier');
    await page.getByRole('dialog').getByRole('button', { name: 'Short-close' }).click();
    await expect(page.getByText(/Short-closed .*Balance not available/)).toBeVisible();
    await snap(page, '42-po-closed');
  });
});
