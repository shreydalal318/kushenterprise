import { expect, test, type Page } from '@playwright/test';
import { login, randomGtin, selectByText, snap, trpc } from './helpers';
import { run } from './run';

const T = run.tag.toUpperCase();
const yymmdd = (iso: string) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const ctx: { gtin: string; lensBatch: string; serials: string[]; gelBarcode: string; customer: string; invoiceId: string; invoiceNo: string } = {} as never;

async function scan(page: Page, code: string) {
  const f = page.getByLabel('Scan', { exact: true });
  await f.fill(code);
  await f.press('Enter');
}

test.describe.serial('Phase 4 sales', () => {
  test('setup: company state, a serial-tracked lens, a gel, stock and a customer with a special price', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    const r = page.request;
    const s = await trpc<{ legalName: string }>(r, 'settings.get', undefined, 'GET');
    await trpc(r, 'settings.updateCompany', { legalName: s.legalName, addressLine1: '12 Relief Road', addressLine2: '', city: 'Ahmedabad', pincode: '380001', stateCode: '24', phone: '', email: '', gstin: '[GSTIN]', pan: '[PAN]', drugLicenceNo: '[Drug Licence No.]', jurisdictionCity: 'Ahmedabad' });
    const cats = await trpc<{ id: string; name: string }[]>(r, 'settings.categories', undefined, 'GET');
    const iol = cats.find((c) => c.name === 'IOL / Lens')!.id;
    const lens = await trpc<{ id: string }>(r, 'products.create', { code: `SAL-${T}`, name: `Sales Lens ${T}`, categoryId: iol, hsnCode: '90213900', gstRate: 5, unit: 'pcs', defaultRate: 3250, mrp: 4500, isLens: true, lensType: 'MONOFOCAL', trackSerial: true, powerRange: { from: 22, to: 22, step: 0.5 } });
    const lv = (await trpc<{ variants: { id: string }[] }>(r, 'products.get', { id: lens.id }, 'GET')).variants[0]!.id;
    ctx.gtin = randomGtin();
    await trpc(r, 'products.updateVariant', { id: lv, isActive: true, gtin: ctx.gtin });
    const gel = await trpc<{ id: string }>(r, 'products.create', { code: `GEL-${T}`, name: `Sales Gel ${T}`, categoryId: iol, hsnCode: '30049099', gstRate: 5, unit: 'pcs', defaultRate: 400, mrp: 650 });
    const gp = await trpc<{ variants: { id: string; barcode: string }[] }>(r, 'products.get', { id: gel.id }, 'GET');
    ctx.gelBarcode = gp.variants[0]!.barcode;
    const sup = await trpc<{ id: string }>(r, 'suppliers.create', { name: `Sales Supplier ${T}`, addressLine1: 'Plot 2', city: 'Mumbai', stateCode: '27', paymentTermsDays: 30 });
    ctx.lensBatch = `SB${T}`;
    ctx.serials = [1, 2, 3].map((i) => `SS${i}${T}`);
    await trpc(r, 'inventory.createGrn', { supplierId: sup.id, date: inDays(0), lines: [
      { variantId: lv, batchNo: ctx.lensBatch, expiryDate: inDays(700), serialNos: ctx.serials, qty: 3 },
      { variantId: gp.variants[0]!.id, batchNo: `GB${T}`, expiryDate: inDays(400), qty: 40 },
    ] });
    ctx.customer = `Sales Clinic ${T}`;
    const c = await trpc<{ id: string }>(r, 'customers.create', { type: 'CLINIC', name: ctx.customer, stateCode: '24', paymentTermsDays: 15, billingAddress: { line1: '4 CG Road', city: 'Ahmedabad', pincode: '380009', stateCode: '24' } });
    await trpc(r, 'pricing.setCustomerPrices', { customerId: c.id, rows: [{ productId: lens.id, rate: 2900, validFrom: null, validTo: null }] });
  });

  test('scan-to-invoice: GS1 serials and repeat scans, customer price, CGST+SGST, real PDF', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto('/app/invoices/new');
    await scan(page, ctx.gelBarcode);
    await expect(page.getByText('Choose the customer first')).toBeVisible();
    await selectByText(page, 'Customer', ctx.customer);
    const exp = yymmdd(inDays(700));
    await scan(page, `]d201${ctx.gtin}17${exp}10${ctx.lensBatch}\x1d21${ctx.serials[0]}`);
    await scan(page, `]d201${ctx.gtin}17${exp}10${ctx.lensBatch}\x1d21${ctx.serials[1]}`);
    await scan(page, `]d201${ctx.gtin}17${exp}10${ctx.lensBatch}\x1d21${ctx.serials[1]}`);
    await expect(page.getByText(`Serial ${ctx.serials[1]} is already on this bill`)).toBeVisible();
    for (let i = 0; i < 3; i++) await scan(page, ctx.gelBarcode);
    await scan(page, 'NO-SUCH-CODE-1');
    await expect(page.getByText('Unknown barcode NO-SUCH-CODE-1')).toBeVisible();
    await expect(page.getByLabel('Quantity for line 1')).toHaveValue('2');
    await expect(page.getByLabel('Quantity for line 2')).toHaveValue('3');
    await expect(page.getByText('Special price')).toBeVisible();
    // 2 × 2900 + 3 × 400 = 7000 taxable; 5% GST split 175 + 175 → 7350
    await expect(page.getByText('CGST @ 2.5%')).toBeVisible();
    await snap(page, '30-scan-to-invoice');
    await page.getByRole('button', { name: /Save tax invoice · ₹\s?7,350\.00/ }).click();
    await page.waitForURL(/\/app\/invoices\/[^/]+\?new=1/);
    await expect(page.getByText('Invoice saved and stock updated.')).toBeVisible();
    ctx.invoiceId = page.url().split('/app/invoices/')[1]!.split('?')[0]!;
    ctx.invoiceNo = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
    expect(ctx.invoiceNo).toMatch(/\/\d{4}-\d{2}\/\d{4}$/);
    const pdf = await page.request.get(`/api/documents/invoice/${ctx.invoiceId}?copies=ORIGINAL,DUPLICATE`);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
    await page.waitForTimeout(1500); // let the PDF preview paint for the screenshot
    await snap(page, '31-invoice-detail');
  });

  test('order: place, invoice from the order (confirms and packs it), dispatch, deliver', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto('/app/orders/new');
    await selectByText(page, 'Customer', ctx.customer);
    await scan(page, ctx.gelBarcode);
    await scan(page, ctx.gelBarcode);
    await page.getByRole('button', { name: 'Patient / surgery details' }).click();
    await page.getByLabel('Patient name (optional)').fill('Mr. R. Shah');
    // The handler must be chosen on purpose (the owner is never one); Place order stays off until then.
    await expect(page.getByRole('button', { name: /Place order/ })).toBeDisabled();
    await selectByText(page, 'Who will deliver it', 'Not assigned yet');
    await page.getByRole('button', { name: /Place order/ }).click();
    await page.waitForURL(/\/app\/orders\/[^/]+\?new=1/);
    const orderPath = new URL(page.url()).pathname;

    // Making the invoice confirms and packs the order, then comes straight back with Dispatch open.
    await page.getByRole('link', { name: /Make tax invoice/ }).click();
    await expect(page.getByLabel('Quantity for line 1')).toHaveValue('2');
    await page.getByRole('button', { name: /Save tax invoice/ }).click();
    await page.waitForURL((u) => u.pathname === orderPath);
    await expect(page.getByText('Invoiced', { exact: true }).first()).toBeVisible();
    const dlg2 = page.getByRole('dialog');
    await expect(dlg2).toBeVisible();
    // Same city as us → our own delivery staff is suggested; this one goes by courier instead.
    await expect(dlg2.getByRole('radio', { name: /Our delivery staff \(suggested\)/ })).toHaveAttribute('aria-checked', 'true');
    await dlg2.getByRole('radio', { name: /^Courier/ }).click();
    await dlg2.getByLabel('Courier company').fill('DTDC');
    await dlg2.getByLabel('Docket no.').fill(`D${T}`);
    await dlg2.getByRole('button', { name: 'Mark dispatched' }).click();
    await expect(page.getByText(`D${T}`)).toBeVisible();
    await page.getByRole('button', { name: 'Mark delivered' }).click();
    await page.getByLabel('Received by').fill('Sister Mary, OT store');
    await page.getByRole('dialog').getByRole('button', { name: 'Mark delivered' }).click();
    await expect(page.getByText(/received by Sister Mary, OT store/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Mark / })).toHaveCount(0);
    await snap(page, '32-order-delivered');
  });

  test('proforma: save without touching stock, then convert to a tax invoice', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto('/app/proforma/new');
    await selectByText(page, 'Customer', ctx.customer);
    await scan(page, ctx.gelBarcode);
    await page.getByLabel('Quantity for line 1').fill('5');
    await page.getByRole('button', { name: /Save proforma/ }).click();
    await page.waitForURL(/\/app\/proforma\/[^/]+\?new=1/);
    await page.getByRole('button', { name: 'Mark as sent' }).click();
    await page.getByRole('button', { name: 'Convert to tax invoice' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Create tax invoice' }).click();
    await page.waitForURL(/\/app\/invoices\//);
    await page.goBack();
    await expect(page.getByText('Converted to tax invoice')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Convert to tax invoice' })).toHaveCount(0);
  });

  test('payment against the invoice, then the ledger shows what is left', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto(`/app/invoices/${ctx.invoiceId}`);
    await page.getByRole('link', { name: 'Record payment' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByLabel(`Apply to ${ctx.invoiceNo}`)).toHaveValue('7350');
    await dlg.getByLabel('Amount (₹)').fill('5000');
    await dlg.getByLabel(`Apply to ${ctx.invoiceNo}`).fill('5000');
    await dlg.getByLabel('UTR / cheque no.').fill(`UTR${T}`);
    await snap(page, '33-record-payment');
    await dlg.getByRole('button', { name: 'Save receipt' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('cell', { name: ctx.customer })).toBeVisible();

    await page.getByRole('link', { name: ctx.customer }).first().click();
    await expect(page.getByRole('heading', { name: 'Ledger Account' })).toBeVisible();
    await expect(page.getByRole('link', { name: ctx.invoiceNo })).toHaveCount(2); // pending bills + ledger
    await expect(page.getByRole('row').filter({ hasText: ctx.invoiceNo }).first()).toContainText('2,350.00');
    await snap(page, '34-customer-ledger');
  });

  test('owner cancels an unpaid invoice with a reason; stock and serial go back', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    await page.goto('/app/invoices/new');
    await selectByText(page, 'Customer', ctx.customer);
    await scan(page, `01${ctx.gtin}17${yymmdd(inDays(700))}10${ctx.lensBatch}\x1d21${ctx.serials[2]}`);
    await page.getByRole('button', { name: /Save tax invoice/ }).click();
    await page.waitForURL(/\/app\/invoices\/[^/]+\?new=1/);
    await page.getByRole('button', { name: 'Cancel invoice' }).click();
    await page.getByLabel('Reason (kept for audit)').fill('Wrong power billed');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel invoice' }).click();
    await expect(page.getByText(/Cancelled by .*Wrong power billed/)).toBeVisible();
    const look = await trpc<{ found: boolean; serial?: { status: string } }>(page.request, 'scan.resolve', { code: ctx.serials[2] }, 'GET');
    expect(look.serial?.status).toBe('IN_STOCK');
  });

  test('hand an order to a delivery boy; he marks it delivered from Deliveries', async ({ page }) => {
    await login(page, run.owner.email, run.owner.password);
    const r = page.request;
    const customers = await trpc<{ id: string; name: string }[]>(r, 'sales.customers', undefined, 'GET');
    const c = customers.find((x) => x.name === ctx.customer)!;
    const gel = await trpc<{ variant: { id: string } }>(r, 'scan.resolve', { code: ctx.gelBarcode }, 'GET');
    const o = await trpc<{ id: string; number: string }>(r, 'orders.create', { customerId: c.id, lines: [{ variantId: gel.variant.id, qty: 1 }] });
    await trpc(r, 'invoices.create', { customerId: c.id, orderId: o.id, date: new Date().toISOString().slice(0, 10), lines: [{ variantId: gel.variant.id, qty: 1 }] });
    await page.goto(`/app/orders/${o.id}`); // the invoice already packed it
    await page.getByRole('button', { name: 'Dispatch', exact: true }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Delivered by').selectOption({ label: new RegExp(run.owner.name) as unknown as string }).catch(async () => {
      const value = await dlg.getByLabel('Delivered by').locator('option', { hasText: run.owner.name }).first().getAttribute('value');
      await dlg.getByLabel('Delivered by').selectOption(value!);
    });
    await dlg.getByLabel('Vehicle no. (optional)').fill('GJ06AB1234');
    await snap(page, '35-own-delivery');
    await dlg.getByRole('button', { name: 'Mark dispatched' }).click();
    await expect(page.getByText('Our delivery staff', { exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Deliveries' }).click();
    const row = page.getByRole('listitem').filter({ hasText: o.number }).first();
    await expect(row).toBeVisible();
    await snap(page, '36-deliveries');
    await row.getByRole('button', { name: 'Mark delivered' }).click();
    await page.getByLabel('Received by').fill('Reception desk');
    await page.getByRole('dialog').getByRole('button', { name: 'Mark delivered' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: o.number })).toHaveCount(0);
    await page.goto(`/app/orders/${o.id}`);
    await expect(page.getByText(/received by Reception desk/)).toBeVisible();
  });
});
