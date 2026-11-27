'use client';
import { useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { addDays, financialYear, istDateString } from '@kush/core';
import { Alert, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { EmptyRow, LoadingRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { BarList, bucketSales, dayLabel, LineChart } from './charts';

type Range = { from: string; to: string };
function presets(today: string): [string, Range][] {
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const fy = financialYear(today).slice(0, 4);
  return [
    ['This month', { from: monthStart, to: today }],
    ['Last month', { from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd }],
    ['Last 30 days', { from: addDays(today, -29), to: today }],
    ['This financial year', { from: `${fy}-04-01`, to: today }],
  ];
}

function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const today = istDateString();
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {presets(today).map(([label, r]) => (
        <button key={label} onClick={() => onChange(r)} className={cn('h-9 rounded-lg border px-3 text-sm', value.from === r.from && value.to === r.to ? 'border-teal bg-aqua-100 font-semibold text-navy' : 'border-line bg-white text-muted hover:text-ink')}>{label}</button>
      ))}
      <input aria-label="From date" type="date" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} className="h-9 rounded-lg border border-line bg-white px-2 text-sm" />
      <span className="text-sm text-muted">to</span>
      <input aria-label="To date" type="date" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} className="h-9 rounded-lg border border-line bg-white px-2 text-sm" />
    </div>
  );
}

const xlsx = (name: string, r?: Range) => `/api/reports/${name}.xlsx${r ? `?from=${r.from}&to=${r.to}` : ''}`;
function Download({ name, r, label = 'Excel' }: { name: string; r?: Range; label?: string }) {
  return <a href={xlsx(name, r)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-aqua-50"><FileSpreadsheet className="size-4 text-ok" aria-hidden /> {label}</a>;
}

export function Analytics() {
  const { can } = useMe();
  const today = istDateString();
  const [range, setRange] = useState<Range>(presets(today)[0]![1]);
  const [tab, setTab] = useState<'sales' | 'margin' | 'gst' | 'reports'>('sales');
  const tabs: [typeof tab, string][] = [['sales', 'Sales'], ...(can('VIEW_PRICES_MARGINS') ? [['margin', 'Margins'] as [typeof tab, string]] : []), ['gst', 'GST'], ['reports', 'Reports & Excel']];
  return (
    <>
      <PageHeader title="Analytics" description="Sales are before GST, net of returns; cancelled invoices are left out." />
      <div role="tablist" className="mb-4 flex w-fit flex-wrap rounded-lg bg-white p-0.5 ring-1 ring-line">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('h-9 rounded-md px-3 text-sm', tab === k ? 'bg-aqua-100 font-semibold text-navy' : 'text-muted')}>{l}</button>)}
      </div>
      <RangePicker value={range} onChange={setRange} />
      {tab === 'sales' && <SalesTab r={range} />}
      {tab === 'margin' && <MarginTab r={range} />}
      {tab === 'gst' && <GstTab r={range} />}
      {tab === 'reports' && <ReportsTab r={range} />}
    </>
  );
}

function SalesTab({ r }: { r: Range }) {
  const q = trpc.analytics.sales.useQuery(r);
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const d = q.data;
  const rows = (xs: { name: string; sales: number; code?: string }[]) => xs.map((x) => ({ label: x.name, sub: x.code, value: x.sales }));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="px-4 py-3"><p className="text-xs text-muted">Sales</p><p className="text-2xl font-semibold tabular-nums text-navy">{rupees(d.total)}</p></Card>
        <Card className="px-4 py-3"><p className="text-xs text-muted">Units</p><p className="text-2xl font-semibold tabular-nums text-navy">{d.units.toLocaleString('en-IN')}</p></Card>
        <Card className="px-4 py-3"><p className="text-xs text-muted">Customers</p><p className="text-2xl font-semibold tabular-nums text-navy">{d.customers.length}</p></Card>
        {d.margin ? <Card className="px-4 py-3"><p className="text-xs text-muted">Gross margin</p><p className="text-2xl font-semibold tabular-nums text-navy">{rupees(d.margin.margin)}</p><p className="text-xs text-muted">{d.margin.pct}% of sales</p></Card> : <Card className="px-4 py-3"><p className="text-xs text-muted">Products sold</p><p className="text-2xl font-semibold tabular-nums text-navy">{d.products.length}</p></Card>}
      </div>
      {(() => { const b = bucketSales(d.daily); const t = b.unit === 'day' ? 'Daily sales' : b.unit === 'week' ? 'Weekly sales' : 'Monthly sales'; return (
        <Card><CardHeader title={t} actions={<Download name="sales" r={r} />} /><CardBody><LineChart title={`${t} in the chosen period`} series={[{ name: 'Sales', points: b.points }]} /></CardBody></Card>
      ); })()}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader title="Top products" /><CardBody><BarList title="Top products by sales" rows={rows(d.products as never)} /></CardBody></Card>
        <Card><CardHeader title="Top customers" /><CardBody><BarList title="Top customers by sales" rows={rows(d.customers as never)} /></CardBody></Card>
        <Card><CardHeader title="By category" /><CardBody><BarList title="Sales by category" rows={rows(d.categories as never)} /></CardBody></Card>
        <Card><CardHeader title="By brand" /><CardBody><BarList title="Sales by brand" rows={rows(d.brands as never)} /></CardBody></Card>
        <Card><CardHeader title="By employee (billed by)" /><CardBody><BarList title="Sales by employee" rows={rows(d.employees as never)} /></CardBody></Card>
      </div>
    </div>
  );
}

function MarginTab({ r }: { r: Range }) {
  const q = trpc.analytics.sales.useQuery(r);
  const [by, setBy] = useState<'products' | 'customers'>('products');
  const rows = useMemo(() => ((q.data?.[by] ?? []) as { id: string; name: string; code?: string; qty: number; sales: number; cost?: number; margin?: number; marginPct?: number }[]), [q.data, by]);
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  if (!q.data.margin) return <Alert tone="info">Margins need the "see prices and margins" permission.</Alert>;
  return (
    <Card className="overflow-hidden">
      <CardHeader title={`Gross margin ${rupees(q.data.margin.margin)} (${q.data.margin.pct}%)`} description="Selling price before GST minus the purchase cost of the batch that was sold."
        actions={<div className="flex gap-2"><div role="tablist" className="flex rounded-lg bg-canvas p-0.5">{(['products', 'customers'] as const).map((k) => <button key={k} role="tab" aria-selected={by === k} onClick={() => setBy(k)} className={cn('h-8 rounded-md px-3 text-sm', by === k ? 'bg-white font-semibold text-navy shadow-sm' : 'text-muted')}>{k === 'products' ? 'By product' : 'By customer'}</button>)}</div><Download name="sales" r={r} /></div>} />
      <Table minWidth={720}>
        <THead><tr><Th>{by === 'products' ? 'Product' : 'Customer'}</Th><Th className="text-right">Qty</Th><Th className="text-right">Sales</Th><Th className="text-right">Cost</Th><Th className="text-right">Margin</Th><Th className="text-right">Margin %</Th></tr></THead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={6}>No sales in this period.</EmptyRow>}
          {rows.map((x) => <Tr key={x.id}><Td><div className="font-medium">{x.name}</div>{x.code && <div className="text-xs text-muted">{x.code}</div>}</Td><Td className="num">{x.qty}</Td><Td className="num">{rupees(x.sales)}</Td><Td className="num text-muted">{rupees(x.cost)}</Td><Td className={cn('num font-semibold', (x.margin ?? 0) < 0 && 'text-danger')}>{rupees(x.margin)}</Td><Td className={cn('num', (x.marginPct ?? 0) < 10 && 'text-warn')}>{x.marginPct}%</Td></Tr>)}
        </tbody>
      </Table>
    </Card>
  );
}

function GstTab({ r }: { r: Range }) {
  const q = trpc.analytics.gst.useQuery(r);
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const g = q.data;
  const T = ({ t }: { t: { taxable: number; cgst: number; sgst: number; igst: number } }) => <><Td className="num">{rupees(t.taxable)}</Td><Td className="num">{rupees(t.igst)}</Td><Td className="num">{rupees(t.cgst)}</Td><Td className="num">{rupees(t.sgst)}</Td></>;
  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden">
        <CardHeader title="GSTR-1 summary" description="From the tax stored on each invoice and credit note, so it always matches the documents." actions={<Download name="gst" r={r} label="Excel (B2B, B2C, credit notes, HSN)" />} />
        <Table minWidth={680}>
          <THead><tr><Th>Section</Th><Th className="text-right">Taxable value</Th><Th className="text-right">IGST</Th><Th className="text-right">CGST</Th><Th className="text-right">SGST</Th></tr></THead>
          <tbody>
            <Tr><Td>B2B: {g.b2b.invoices} invoice(s) to registered buyers</Td><T t={g.b2b.totals} /></Tr>
            <Tr><Td>B2C: unregistered buyers</Td><T t={g.b2c.totals} /></Tr>
            <Tr><Td>Less: credit notes ({g.creditNotes.rows.length})</Td><T t={g.creditNotes.totals} /></Tr>
            <Tr className="bg-canvas font-semibold"><Td>Net</Td><T t={g.net} /></Tr>
          </tbody>
        </Table>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="HSN summary" />
        <Table minWidth={760}>
          <THead><tr><Th>HSN</Th><Th>UQC</Th><Th className="text-right">Qty</Th><Th className="text-right">Rate</Th><Th className="text-right">Taxable</Th><Th className="text-right">IGST</Th><Th className="text-right">CGST</Th><Th className="text-right">SGST</Th></tr></THead>
          <tbody>
            {g.hsn.rows.length === 0 && <EmptyRow cols={8}>No sales in this period.</EmptyRow>}
            {g.hsn.rows.map((h) => <Tr key={`${h.hsn}-${h.rate}-${h.uqc}`}><Td className="font-mono text-sm">{h.hsn}</Td><Td className="text-sm">{h.uqc}</Td><Td className="num">{h.qty}</Td><Td className="num">{h.rate}%</Td><T t={h} /></Tr>)}
            {g.hsn.rows.length > 0 && <Tr className="bg-canvas font-semibold"><Td colSpan={4}>Total</Td><T t={g.hsn.totals} /></Tr>}
          </tbody>
        </Table>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="B2C by place of supply" />
        <Table minWidth={560}>
          <THead><tr><Th>Place of supply</Th><Th className="text-right">Rate</Th><Th className="text-right">Taxable</Th><Th className="text-right">IGST</Th><Th className="text-right">CGST</Th><Th className="text-right">SGST</Th></tr></THead>
          <tbody>{g.b2c.rows.length === 0 && <EmptyRow cols={6}>None.</EmptyRow>}{g.b2c.rows.map((b) => <Tr key={`${b.placeOfSupply}-${b.rate}`}><Td>{b.placeOfSupply}</Td><Td className="num">{b.rate}%</Td><T t={b} /></Tr>)}</tbody>
        </Table>
      </Card>
    </div>
  );
}

function ReportsTab({ r }: { r: Range }) {
  const { can, isOwner } = useMe();
  const reg = trpc.analytics.salesRegister.useQuery(r);
  const list: [string, string, string, boolean, boolean][] = [
    ['sales-register', 'Sales register', 'Every invoice and credit note with taxable value, CGST, SGST, IGST and total.', true, true],
    ['gst', 'GST summary (GSTR-1)', 'B2B invoice-wise, B2C by place of supply and rate, credit notes, HSN summary.', true, true],
    ['sales', 'Sales analytics', 'By product, customer, category, brand and employee, plus daily sales (and margins if you can see costs).', true, true],
    ['stock-summary', 'Stock summary', 'Per item: opening, received, sold, returns, adjustments, closing for the period.', true, true],
    ['outstanding', 'Outstanding & ageing', 'Customer balances today with 0–30 / 31–60 / 61–90 / 90+ day ageing.', false, true],
    ['expiry', 'Expiry report', 'Batches expiring within the alert window (value at cost if allowed).', false, can('MANAGE_STOCK')],
    ['low-stock', 'Low stock', 'Items at or below their reorder level with the usual supplier.', false, can('MANAGE_STOCK')],
    ['stock-valuation', 'Stock valuation at cost', 'Today’s stock value by product and category.', false, isOwner],
  ];
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Excel exports" description="Dated reports use the period chosen above; the others are as on today." />
        <ul className="divide-y divide-line">
          {list.filter(([, , , , ok]) => ok).map(([name, title, desc, dated]) => (
            <li key={name} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div><p className="font-medium text-navy">{title}</p><p className="text-sm text-muted">{desc}</p></div>
              <Download name={name} r={dated ? r : undefined} />
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Tally & GST e-filing" description="For the period chosen above. Ledger names are set in Settings → Tally & e-filing." />
        <ul className="divide-y divide-line">
          <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><p className="font-medium text-navy">Tally vouchers (XML)</p><p className="text-sm text-muted">Sales invoices, credit notes and receipts. Tally: Gateway → Import → Vouchers. Re-importing the same period updates instead of duplicating.</p></div><a href={`/api/exports/tally?type=vouchers&from=${r.from}&to=${r.to}`} className="inline-flex h-9 items-center rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:bg-aqua-50">Download XML</a></li>
          <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><p className="font-medium text-navy">Tally masters (XML)</p><p className="text-sm text-muted">Customer ledgers with GSTIN and state, and the sales / tax ledgers used. Import these first.</p></div><a href={`/api/exports/tally?type=masters&from=${r.from}&to=${r.to}`} className="inline-flex h-9 items-center rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:bg-aqua-50">Download XML</a></li>
          <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><p className="font-medium text-navy">e-Invoice JSON (bulk)</p><p className="text-sm text-muted">Every B2B invoice and credit note in the period without an IRN, in the IRP schema 1.1.</p></div><a href={`/api/exports/einvoice?from=${r.from}&to=${r.to}`} className="inline-flex h-9 items-center rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:bg-aqua-50">Download JSON</a></li>
        </ul>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Sales register" description={reg.data ? `${reg.data.rows.length} document(s)` : undefined} />
        <Table minWidth={980}>
          <THead><tr><Th>Date</Th><Th>Document</Th><Th>Customer</Th><Th>GSTIN</Th><Th className="text-right">Taxable</Th><Th className="text-right">CGST</Th><Th className="text-right">SGST</Th><Th className="text-right">IGST</Th><Th className="text-right">Total</Th></tr></THead>
          <tbody>
            {!reg.data && <LoadingRow cols={9} error={reg.error} />}{reg.data?.rows.length === 0 && <EmptyRow cols={9}>No documents in this period.</EmptyRow>}
            {reg.data?.rows.map((x) => <Tr key={x.number} className={x.status.startsWith('Cancelled') ? 'text-muted line-through' : ''}><Td>{dayLabel(x.date)}</Td><Td className="font-mono text-sm">{x.number}<div className="font-sans text-xs text-muted">{x.kind}</div></Td><Td className="text-sm">{x.customer}</Td><Td className="font-mono text-xs">{x.gstin}</Td><Td className="num">{rupees(x.taxable)}</Td><Td className="num">{rupees(x.cgst)}</Td><Td className="num">{rupees(x.sgst)}</Td><Td className="num">{rupees(x.igst)}</Td><Td className="num font-semibold">{rupees(x.total)}</Td></Tr>)}
            {reg.data && reg.data.rows.length > 0 && <Tr className="bg-canvas font-semibold"><Td colSpan={4}>Total</Td><Td className="num">{rupees(reg.data.totals.taxable)}</Td><Td className="num">{rupees(reg.data.totals.cgst)}</Td><Td className="num">{rupees(reg.data.totals.sgst)}</Td><Td className="num">{rupees(reg.data.totals.igst)}</Td><Td className="num">{rupees(reg.data.totals.total)}</Td></Tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
