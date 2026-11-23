import { TRPCError } from '@trpc/server';
import { AGEING_BUCKETS, istDateString } from '@kush/core';
import { buildReportWorkbook, type SheetSpec } from '@kush/api/server';
import { getSessionUser, serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const iso = (v: string | null, d: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d);
type Api = Awaited<ReturnType<typeof serverApi>>;
const money = (header: string, key: string) => ({ header, key, type: 'money' as const });
const salesCols = (withMargin: boolean) => [
  { header: 'Qty', key: 'qty', type: 'int' as const }, money('Sales (before GST)', 'sales'),
  ...(withMargin ? [money('Cost', 'cost'), money('Gross margin', 'margin'), { header: 'Margin %', key: 'marginPct', type: 'pct' as const }] : []),
];

/**
 * Excel exports for the accountant and owner. Every report is built from the same API call as its
 * screen, so the same permission checks apply (cost columns only for users who may see costs).
 */
const REPORTS: Record<string, (api: Api, from: string, to: string) => Promise<{ title: string; sheets: SheetSpec[] }>> = {
  'sales-register': async (api, from, to) => {
    const r = await api.analytics.salesRegister({ from, to });
    return { title: `Sales register ${from} to ${to}`, sheets: [{ name: 'Sales register', columns: [
      { header: 'Date', key: 'date', type: 'date' }, { header: 'Type', key: 'kind', width: 12 }, { header: 'Number', key: 'number', width: 20 }, { header: 'Customer', key: 'customer', width: 32 },
      { header: 'GSTIN', key: 'gstin', width: 18 }, { header: 'Place of supply', key: 'placeOfSupply', width: 18 }, money('Taxable', 'taxable'), money('CGST', 'cgst'), money('SGST', 'sgst'), money('IGST', 'igst'),
      money('Round off', 'roundOff'), money('Total', 'total'), { header: 'Against invoice', key: 'against', width: 18 }, { header: 'Status / reason', key: 'status', width: 28 },
    ], rows: r.rows, totals: { customer: 'Total', ...r.totals } }] };
  },
  gst: async (api, from, to) => {
    const g = await api.analytics.gst({ from, to });
    const tax = [money('Taxable value', 'taxable'), money('IGST', 'igst'), money('CGST', 'cgst'), money('SGST', 'sgst')];
    return { title: `GST summary ${from} to ${to}`, sheets: [
      { name: 'B2B', title: `B2B invoices (registered buyers) ${from} to ${to}`, columns: [{ header: 'GSTIN of recipient', key: 'gstin', width: 18 }, { header: 'Receiver name', key: 'receiver', width: 30 }, { header: 'Invoice number', key: 'number', width: 18 }, { header: 'Invoice date', key: 'date', type: 'date' }, money('Invoice value', 'invoiceValue'), { header: 'Place of supply', key: 'placeOfSupply', width: 18 }, { header: 'Rate %', key: 'rate', type: 'num' }, ...tax], rows: g.b2b.rows, totals: { gstin: 'Total', ...g.b2b.totals } },
      { name: 'B2C', title: `B2C summary (unregistered buyers) by place of supply and rate ${from} to ${to}`, columns: [{ header: 'Place of supply', key: 'placeOfSupply', width: 20 }, { header: 'Rate %', key: 'rate', type: 'num' }, ...tax], rows: g.b2c.rows, totals: { placeOfSupply: 'Total', ...g.b2c.totals } },
      { name: 'Credit notes', columns: [{ header: 'GSTIN', key: 'gstin', width: 18 }, { header: 'Receiver', key: 'receiver', width: 30 }, { header: 'Note number', key: 'number', width: 18 }, { header: 'Note date', key: 'date', type: 'date' }, { header: 'Against invoice', key: 'against', width: 18 }, { header: 'Invoice date', key: 'againstDate', type: 'date' }, money('Note value', 'noteValue'), { header: 'Place of supply', key: 'placeOfSupply', width: 18 }, { header: 'Rate %', key: 'rate', type: 'num' }, ...tax], rows: g.creditNotes.rows, totals: { gstin: 'Total', ...g.creditNotes.totals } },
      { name: 'HSN', title: `HSN-wise summary ${from} to ${to}`, columns: [{ header: 'HSN', key: 'hsn', width: 12 }, { header: 'Description', key: 'description', width: 36 }, { header: 'UQC', key: 'uqc', width: 12 }, { header: 'Total quantity', key: 'qty', type: 'int' }, money('Total value', 'totalValue'), { header: 'Rate %', key: 'rate', type: 'num' }, ...tax], rows: g.hsn.rows, totals: { hsn: 'Total', ...g.hsn.totals } },
    ] };
  },
  sales: async (api, from, to) => {
    const s = await api.analytics.sales({ from, to });
    const m = !!s.margin;
    return { title: `Sales analytics ${from} to ${to}`, sheets: [
      { name: 'Products', columns: [{ header: 'Code', key: 'code', width: 14 }, { header: 'Product', key: 'name', width: 40 }, ...salesCols(m)], rows: s.products as never },
      { name: 'Customers', columns: [{ header: 'Code', key: 'code', width: 12 }, { header: 'Customer', key: 'name', width: 36 }, { header: 'Type', key: 'type', width: 12 }, ...salesCols(m)], rows: s.customers as never },
      { name: 'Categories', columns: [{ header: 'Category', key: 'name', width: 28 }, ...salesCols(m)], rows: s.categories as never },
      { name: 'Brands', columns: [{ header: 'Brand', key: 'name', width: 28 }, ...salesCols(m)], rows: s.brands as never },
      { name: 'Billed by', columns: [{ header: 'Employee', key: 'name', width: 28 }, ...salesCols(m)], rows: s.employees as never },
      { name: 'Daily', columns: [{ header: 'Date', key: 'date', type: 'date' }, money('Sales (before GST)', 'sales')], rows: s.daily, totals: { date: 'Total', sales: s.total } },
    ] };
  },
  outstanding: async (api) => {
    const r = await api.ledger.receivables();
    return { title: `Outstanding as on ${istDateString()}`, sheets: [{ name: 'Outstanding', columns: [
      { header: 'Code', key: 'code', width: 12 }, { header: 'Customer', key: 'name', width: 36 }, money('Credit limit', 'creditLimit'), money('Outstanding', 'outstanding'), money('Overdue', 'overdue'),
      ...AGEING_BUCKETS.map((b) => money(`${b} days`, `age_${b}`)), money('On account', 'onAccount'),
    ], rows: r.map((x) => ({ ...x, ...Object.fromEntries(AGEING_BUCKETS.map((b) => [`age_${b}`, x.ageing[b]])) })) }] };
  },
  'stock-valuation': async (api) => {
    const v = await api.inventory.valuation();
    return { title: `Stock valuation at cost as on ${v.asOn}`, sheets: [
      { name: 'By product', columns: [{ header: 'Code', key: 'code', width: 14 }, { header: 'Product', key: 'name', width: 40 }, { header: 'Category', key: 'category', width: 20 }, { header: 'Qty', key: 'qty', type: 'int' }, money('Value at cost', 'value'), money('At default selling rate', 'atDefaultRate')], rows: v.products, totals: { name: 'Total', value: v.total } },
      { name: 'By category', columns: [{ header: 'Category', key: 'category', width: 24 }, { header: 'Qty', key: 'qty', type: 'int' }, money('Value at cost', 'value')], rows: v.categories, totals: { category: 'Total', value: v.total } },
    ] };
  },
  'stock-summary': async (api, from, to) => {
    const rows = await api.analytics.stockSummary({ from, to });
    return { title: `Stock summary ${from} to ${to}`, sheets: [{ name: 'Stock summary', columns: [
      { header: 'Category', key: 'category', width: 18 }, { header: 'Code', key: 'code', width: 14 }, { header: 'Product', key: 'name', width: 36 }, { header: 'Power / variant', key: 'variant', width: 16 }, { header: 'Unit', key: 'unit', width: 8 },
      { header: 'Opening', key: 'opening', type: 'int' }, { header: 'Received', key: 'purchases', type: 'int' }, { header: 'Sold (net)', key: 'sales', type: 'int' }, { header: 'Customer returns', key: 'returns', type: 'int' }, { header: 'Adjustments', key: 'adjustments', type: 'int' }, { header: 'Closing', key: 'closing', type: 'int' },
    ], rows }] };
  },
  expiry: async (api) => {
    const e = await api.inventory.expiring();
    const withValue = e.rows.some((r) => r.value !== undefined);
    return { title: `Expiry report as on ${e.today}`, sheets: [{ name: 'Expiring', columns: [
      { header: 'Code', key: 'code', width: 14 }, { header: 'Product', key: 'productName', width: 36 }, { header: 'Power / variant', key: 'label', width: 16 }, { header: 'Batch', key: 'batchNo', width: 14 },
      { header: 'Expiry', key: 'expiryDate', type: 'date' }, { header: 'Window', key: 'bucket', width: 14 }, { header: 'Qty', key: 'qty', type: 'int' }, { header: 'Location', key: 'location', width: 14 }, ...(withValue ? [money('Value at cost', 'value')] : []),
    ], rows: e.rows }] };
  },
  'low-stock': async (api) => {
    const rows = await api.inventory.lowStock();
    return { title: `Low stock as on ${istDateString()}`, sheets: [{ name: 'Low stock', columns: [
      { header: 'Code', key: 'code', width: 14 }, { header: 'Product', key: 'productName', width: 36 }, { header: 'Power / variant', key: 'label', width: 16 }, { header: 'On hand', key: 'qty', type: 'int' }, { header: 'Reorder level', key: 'reorderLevel', type: 'int' }, { header: 'Suggested order', key: 'suggestedOrder', type: 'int' }, { header: 'Usual supplier', key: 'supplierName', width: 28 },
    ], rows: rows.map((r) => ({ ...r, supplierName: r.supplier?.name ?? '' })) }] };
  },
};

/** GET /api/reports/<name>.xlsx?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  const name = (await params).report.replace(/\.xlsx$/, '');
  const build = REPORTS[name];
  if (!build) return new Response('Not found', { status: 404 });
  const user = await getSessionUser();
  if (!user || user.mustChangePassword || user.role === 'CUSTOMER') return new Response('Sign in required', { status: 401 });
  const url = new URL(req.url);
  const today = istDateString();
  const to = iso(url.searchParams.get('to'), today);
  const from = iso(url.searchParams.get('from'), `${to.slice(0, 8)}01`);
  try {
    const { title, sheets } = await build(await serverApi(), from, to);
    const body = await buildReportWorkbook(title, sheets);
    return new Response(new Uint8Array(body), { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}-${from}-to-${to}.xlsx"`, 'Cache-Control': 'private, no-store',
    } });
  } catch (e) {
    if (e instanceof TRPCError) return new Response(e.message, { status: e.code === 'FORBIDDEN' ? 403 : e.code === 'UNAUTHORIZED' ? 401 : 400 });
    throw e;
  }
}
