import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AGEING_BUCKETS, formatDate } from '@kush/core';
import { Alert, Card, H2, LinkButton } from '@/components/ui';
import { useAuth, useCan } from '@/lib/auth';
import { errorText, rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';
import { Bars, Columns, Grid, Line, Note, Pills, SmallButton, Stat, Tag, Waiting, type Icon } from './bits';
import { shareFile, type FileKind } from './files';
import { pct } from './labels';
import { rangeText, type Range } from './range';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (iso: string) => formatDate(iso).slice(0, 5);
/** Daily bars for up to about a month, weekly up to a quarter, monthly beyond (as the website's chart). */
function bucketSales(daily: { date: string; sales: number }[]) {
  if (daily.length <= 35) return { unit: 'day' as const, points: daily.map((p) => ({ label: dayLabel(p.date), value: p.sales })) };
  const monthly = daily.length > 100;
  const m = new Map<string, number>();
  daily.forEach((p, i) => { const key = monthly ? p.date.slice(0, 7) : daily[i - (i % 7)]!.date; m.set(key, (m.get(key) ?? 0) + p.sales); });
  return {
    unit: monthly ? ('month' as const) : ('week' as const),
    points: [...m.entries()].map(([k, v]) => ({ label: monthly ? `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}` : `week of ${dayLabel(k)}`, value: Math.round(v * 100) / 100 })),
  };
}

/** The first rows, with "Show all" for the rest. */
function TopBars({ rows, first = 8 }: { rows: { key: string; label: string; sub?: string; value: number }[]; first?: number }) {
  const [all, setAll] = useState(false);
  return (
    <>
      <Bars rows={all ? rows : rows.slice(0, first)} />
      {rows.length > first && <LinkButton title={all ? 'Show fewer' : `Show all ${rows.length}`} onPress={() => setAll(!all)} />}
    </>
  );
}

const WAITING: { label: string; statuses: string[]; icon: Icon }[] = [
  { label: 'New (to invoice)', statuses: ['PLACED', 'CONFIRMED'], icon: 'receipt-outline' },
  { label: 'Invoiced (to dispatch)', statuses: ['PACKED'], icon: 'cube-outline' },
  { label: 'Dispatched', statuses: ['DISPATCHED'], icon: 'bicycle-outline' },
  { label: 'On hold', statuses: ['ON_HOLD'], icon: 'pause-circle-outline' },
];

function CountRow({ icon, label, count, warn, onPress }: { icon: Icon; label: string; count: number | string; warn?: boolean; onPress?: () => void }) {
  const inner = (pressed: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, opacity: pressed ? 0.6 : 1 }}>
      <Ionicons name={icon} size={20} color={warn ? C.warn : C.teal700} />
      <Text style={{ flex: 1, fontSize: 16, color: C.ink }}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: warn ? C.warn : C.navy }}>{count}</Text>
      {onPress && <Ionicons name="chevron-forward" size={16} color={C.muted} />}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${count}`} onPress={onPress}>{({ pressed }) => inner(pressed)}</Pressable> : inner(false);
}

/** The website's dashboard: sales today / this week / this month, money owed, orders waiting, stock, overdue. */
export function TodayTab() {
  const can = useCan();
  const q = trpc.analytics.home.useQuery(undefined, { refetchInterval: 5 * 60_000 });
  // The dashboard has no "not assigned" count, so count the open ones from the order list (as the website does).
  const unassigned = trpc.orders.list.useQuery({ unassigned: true, limit: 500 }, { enabled: can('VIEW_ORDERS'), refetchInterval: 5 * 60_000 });
  const notAssigned = unassigned.data?.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length;
  if (!q.data) return <Waiting q={q} />;
  const d = q.data.owner;
  if (!d) return <Alert tone="warn">The business numbers need the “View analytics” permission.</Alert>;
  const t = d.tiles;
  const change = t.prevMonthToDate.sales ? Math.round(((t.month.sales - t.prevMonthToDate.sales) / Math.abs(t.prevMonthToDate.sales)) * 100) : null;
  const cur = d.trend.current.reduce((s, p) => s + p.sales, 0);
  const prev = d.trend.previous.reduce((s, p) => s + p.sales, 0);
  const openOrders = can('VIEW_ORDERS') ? () => router.push('/staff') : undefined;
  const seeStatement = can('MANAGE_CUSTOMERS') || can('RECORD_PAYMENTS');
  return (
    <View style={{ gap: 12 }}>
      <Grid>
        <Stat label="Sales today" value={rupees(t.today.sales)} sub={`${t.today.invoices} invoice${t.today.invoices === 1 ? '' : 's'} · ${t.today.orders} order${t.today.orders === 1 ? '' : 's'}`} />
        <Stat label="This week" value={rupees(t.week.sales)} sub={`Received ${rupees(t.week.received)}`} />
        <Stat label="This month" value={rupees(t.month.sales)} sub={change == null ? undefined : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% vs last month (same days)`} subTone={change == null ? undefined : change >= 0 ? C.ok : C.danger} />
        <Stat label="Money owed to us" value={rupees(d.outstanding)} sub={d.overdue > 0 ? `${rupees(d.overdue)} overdue` : 'Nothing overdue'} subTone={d.overdue > 0 ? C.danger : undefined} />
      </Grid>
      <Note>Sales are before GST, less returns.</Note>

      <Card style={{ gap: 0 }}>
        <H2>Orders waiting</H2>
        {WAITING.map((w) => <CountRow key={w.label} icon={w.icon} label={w.label} count={w.statuses.reduce((s, x) => s + (d.pendingOrders[x] ?? 0), 0)} onPress={openOrders} />)}
        {notAssigned != null && <CountRow icon="person-add-outline" label="Not assigned" count={notAssigned} warn={notAssigned > 0} onPress={openOrders} />}
      </Card>

      <Card>
        <H2>Sales, last 30 days</H2>
        <Columns points={d.trend.current.map((p) => ({ label: dayLabel(p.date), value: p.sales }))} />
        <Line k="Last 30 days" v={rupees(cur)} strong />
        <Line k="The 30 days before" v={rupees(prev)} />
      </Card>

      <Card>
        <H2>Stock</H2>
        {d.stock.value != null && <Line k="Stock value at cost" v={rupees(d.stock.value)} strong />}
        <Line k="Low stock" v={`${d.stock.lowCount} item${d.stock.lowCount === 1 ? '' : 's'}`} tone={d.stock.lowCount ? C.warn : undefined} />
        <Line k="Out of stock" v={`${d.stock.outCount} item${d.stock.outCount === 1 ? '' : 's'}`} tone={d.stock.outCount ? C.danger : undefined} />
        <Line k={`Expiring within ${d.stock.expiryWindowDays} days`} v={`${d.stock.expiringUnits} unit${d.stock.expiringUnits === 1 ? '' : 's'}${d.stock.expiringValue != null ? ` · ${rupees(d.stock.expiringValue)}` : ''}`} />
        {d.stock.expiredUnits > 0 && <Alert tone="danger">{`${d.stock.expiredUnits} expired unit${d.stock.expiredUnits === 1 ? ' is' : 's are'} still on the shelf.`}</Alert>}
        <LinkButton title="Open stock reports" onPress={() => router.push('/staff/stock-reports')} />
      </Card>

      <Card>
        <H2>Money owed, by how old it is</H2>
        <Bars rows={AGEING_BUCKETS.map((b) => ({ key: b, label: `${b} days`, value: d.ageing[b] ?? 0 }))} empty="Nobody owes us anything." />
      </Card>

      <Card style={{ gap: 0 }}>
        <H2>Most overdue</H2>
        {!d.topOverdue.length && <Note>Nobody is overdue.</Note>}
        {d.topOverdue.map((c) => (
          <CountRow key={c.customerId} icon="alert-circle-outline" label={c.name} count={rupees(c.overdue)} warn
            onPress={seeStatement ? () => router.push(`/staff/customers/${c.customerId}/statement`) : undefined} />
        ))}
      </Card>
    </View>
  );
}

type SalesRow = { id: string; name: string; code?: string; qty: number; sales: number; cost?: number; margin?: number; marginPct?: number };
const bars = (rows: SalesRow[]) => rows.map((x) => ({ key: x.id, label: x.name, sub: x.code || undefined, value: x.sales }));

/** Sales for the period: totals, the trend, and who / what sold most. */
export function SalesTab({ r }: { r: Range }) {
  const q = trpc.analytics.sales.useQuery(r, { placeholderData: (p) => p });
  if (!q.data) return <Waiting q={q} />;
  const d = q.data;
  const b = bucketSales(d.daily);
  return (
    <View style={{ gap: 12 }}>
      {q.isFetching && <Note>Updating…</Note>}
      <Grid>
        <Stat label="Sales" value={rupees(d.total)} />
        <Stat label="Units sold" value={d.units.toLocaleString('en-IN')} />
        <Stat label="Customers who bought" value={String(d.customers.length)} />
        {d.margin ? <Stat label="Gross margin" value={rupees(d.margin.margin)} sub={`${d.margin.pct}% of sales`} /> : <Stat label="Products sold" value={String(d.products.length)} />}
      </Grid>
      <Card>
        <H2>{b.unit === 'day' ? 'Sales per day' : b.unit === 'week' ? 'Sales per week' : 'Sales per month'}</H2>
        <Columns points={b.points} />
      </Card>
      <Card><H2>Top products</H2><TopBars rows={bars(d.products as SalesRow[])} /></Card>
      <Card><H2>Top customers</H2><TopBars rows={bars(d.customers as SalesRow[])} /></Card>
      <Card><H2>By category</H2><TopBars rows={bars(d.categories as SalesRow[])} /></Card>
      <Card><H2>By brand</H2><TopBars rows={bars(d.brands as SalesRow[])} /></Card>
      <Card><H2>By employee (who made the invoice)</H2><TopBars rows={bars(d.employees as SalesRow[])} /></Card>
    </View>
  );
}

/** Margin = selling price before GST minus the purchase cost of the batch sold (needs "View prices / margins"). */
export function MarginTab({ r }: { r: Range }) {
  const q = trpc.analytics.sales.useQuery(r, { placeholderData: (p) => p });
  const [by, setBy] = useState<'products' | 'customers'>('products');
  const [all, setAll] = useState(false);
  if (!q.data) return <Waiting q={q} />;
  if (!q.data.margin) return <Alert tone="info">Margins need the “View prices / margins” permission.</Alert>;
  const m = q.data.margin;
  const rows = q.data[by] as SalesRow[];
  const shown = all ? rows : rows.slice(0, 30);
  return (
    <View style={{ gap: 12 }}>
      {q.isFetching && <Note>Updating…</Note>}
      <Grid>
        <Stat label="Gross margin" value={rupees(m.margin)} sub={`${m.pct}% of sales`} subTone={m.pct < 10 ? C.warn : C.ok} />
        <Stat label="Sales" value={rupees(q.data.total)} sub={`Cost ${rupees(m.cost)}`} />
      </Grid>
      <Note>Selling price before GST, minus the purchase cost of the batch that was sold.</Note>
      <Pills value={by} onChange={(v) => { setBy(v); setAll(false); }} options={[['products', 'By product'], ['customers', 'By customer']]} />
      {!rows.length && <Card><Note>No sales in this period.</Note></Card>}
      {shown.map((x) => (
        <Card key={x.id}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>{x.name}</Text>
          {x.code ? <Note>{x.code}</Note> : null}
          <Line k="Quantity" v={String(x.qty)} />
          <Line k="Sales" v={rupees(x.sales)} />
          <Line k="Cost" v={rupees(x.cost)} />
          <Line k="Margin" v={rupees(x.margin)} strong tone={(x.margin ?? 0) < 0 ? C.danger : undefined} />
          <Line k="Margin %" v={pct(x.marginPct)} tone={(x.marginPct ?? 0) < 10 ? C.warn : undefined} />
        </Card>
      ))}
      {rows.length > shown.length && <LinkButton title={`Show all ${rows.length}`} onPress={() => setAll(true)} />}
    </View>
  );
}

type Tax = { taxable: number; cgst: number; sgst: number; igst: number };
function TaxLines({ t }: { t: Tax }) {
  return (
    <>
      <Line k="Taxable value" v={rupees(t.taxable)} strong />
      {t.igst !== 0 && <Line k="IGST" v={rupees(t.igst)} />}
      <Line k="CGST" v={rupees(t.cgst)} />
      <Line k="SGST" v={rupees(t.sgst)} />
    </>
  );
}

/** GSTR-1 in short: B2B, B2C, credit notes and the net; the HSN summary; B2C by place of supply. */
export function GstTab({ r }: { r: Range }) {
  const q = trpc.analytics.gst.useQuery(r, { placeholderData: (p) => p });
  const [allHsn, setAllHsn] = useState(false);
  if (!q.data) return <Waiting q={q} />;
  const g = q.data;
  const sep = { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line } as const;
  const hsn = allHsn ? g.hsn.rows : g.hsn.rows.slice(0, 15);
  return (
    <View style={{ gap: 12 }}>
      {q.isFetching && <Note>Updating…</Note>}
      <Card>
        <H2>GSTR-1 summary</H2>
        <Note>From the tax saved on each invoice and credit note, so it always matches the documents.</Note>
        <View style={sep}><Text style={{ fontSize: 15, fontWeight: '700' }}>{`B2B: ${g.b2b.invoices} invoice${g.b2b.invoices === 1 ? '' : 's'} to buyers with a GSTIN`}</Text><TaxLines t={g.b2b.totals} /></View>
        <View style={sep}><Text style={{ fontSize: 15, fontWeight: '700' }}>B2C: buyers without a GSTIN</Text><TaxLines t={g.b2c.totals} /></View>
        <View style={sep}><Text style={{ fontSize: 15, fontWeight: '700' }}>{`Less: credit notes (${g.creditNotes.rows.length})`}</Text><TaxLines t={g.creditNotes.totals} /></View>
        <View style={sep}><Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>Net</Text><TaxLines t={g.net} /></View>
      </Card>
      <Card>
        <H2>HSN summary</H2>
        {!g.hsn.rows.length && <Note>No sales in this period.</Note>}
        {hsn.map((h) => (
          <View key={`${h.hsn}-${h.rate}-${h.uqc}`} style={sep}>
            <Text style={{ fontSize: 15, fontWeight: '700' }}>{`HSN ${h.hsn} · ${h.rate}% · ${h.qty} ${h.uqc}`}</Text>
            <TaxLines t={h} />
          </View>
        ))}
        {g.hsn.rows.length > hsn.length && <LinkButton title={`Show all ${g.hsn.rows.length}`} onPress={() => setAllHsn(true)} />}
        {g.hsn.rows.length > 0 && <View style={sep}><Text style={{ fontSize: 15, fontWeight: '700' }}>Total</Text><TaxLines t={g.hsn.totals} /></View>}
      </Card>
      <Card>
        <H2>B2C by place of supply</H2>
        {!g.b2c.rows.length && <Note>None.</Note>}
        {g.b2c.rows.map((b) => <View key={`${b.placeOfSupply}-${b.rate}`} style={sep}><Text style={{ fontSize: 15, fontWeight: '700' }}>{`${b.placeOfSupply} · ${b.rate}%`}</Text><TaxLines t={b} /></View>)}
      </Card>
      <Note>The GST Excel (B2B, B2C, credit notes, HSN) is under Downloads.</Note>
    </View>
  );
}

interface Download { key: string; title: string; desc: string; path: string; filename: string; kind: FileKind }

/** Excel, Tally and e-invoice files, downloaded with the app's sign-in and shared from the phone; plus the sales register. */
export function FilesTab({ r }: { r: Range }) {
  const can = useCan();
  const { me } = useAuth();
  const owner = me?.role === 'OWNER';
  const reg = trpc.analytics.salesRegister.useQuery(r, { placeholderData: (p) => p });
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allRows, setAllRows] = useState(false);
  const dates = `from=${r.from}&to=${r.to}`;
  const span = `${r.from}-to-${r.to}`;
  const xlsx = (key: string, title: string, desc: string, dated: boolean): Download =>
    ({ key, title, desc, path: `/api/reports/${key}.xlsx${dated ? `?${dates}` : ''}`, filename: `${key}-${dated ? span : 'today'}.xlsx`, kind: 'xlsx' });
  const excel: Download[] = [
    xlsx('sales-register', 'Sales register', 'Every invoice and credit note with taxable value, CGST, SGST, IGST and total.', true),
    xlsx('gst', 'GST summary (GSTR-1)', 'B2B invoice by invoice, B2C by place of supply and rate, credit notes, HSN summary.', true),
    xlsx('sales', 'Sales analytics', 'By product, customer, category, brand and employee, plus sales per day (and margins if you can see costs).', true),
    xlsx('stock-summary', 'Stock summary', 'Per item: opening, received, sold, returns, adjustments and closing for the period.', true),
    xlsx('outstanding', 'Outstanding and ageing', 'What each customer owes today, split 0–30 / 31–60 / 61–90 / 90+ days. As on today.', false),
    ...(can('MANAGE_STOCK') ? [xlsx('expiry', 'Expiry report', 'Batches expiring within the alert window. As on today.', false), xlsx('low-stock', 'Low stock', 'Items at or below their reorder level, with the usual supplier. As on today.', false)] : []),
    ...(owner ? [xlsx('stock-valuation', 'Stock valuation at cost', 'Today’s stock value by product and category.', false)] : []),
  ];
  const tally: Download[] = [
    { key: 'tally-vouchers', title: 'Tally vouchers (XML)', desc: 'Sales invoices, credit notes and receipts. In Tally: Gateway → Import → Vouchers. Importing the same period again updates instead of duplicating.', path: `/api/exports/tally?type=vouchers&${dates}`, filename: `tally-vouchers-${span}.xml`, kind: 'xml' },
    { key: 'tally-masters', title: 'Tally masters (XML)', desc: 'Customer ledgers with GSTIN and state, and the sales and tax ledgers used. Import these first.', path: `/api/exports/tally?type=masters&${dates}`, filename: `tally-masters-${span}.xml`, kind: 'xml' },
    { key: 'einvoice', title: 'e-Invoice file (JSON)', desc: 'Every B2B invoice and credit note in the period without an IRN, ready to upload on the IRP.', path: `/api/exports/einvoice?${dates}`, filename: `einvoice-${span}.json`, kind: 'json' },
  ];
  async function get(x: Download) {
    setBusy(x.key); setDone(null); setError(null);
    try { await shareFile(x.path, x.filename, x.kind); setDone(`${x.title} for ${x.path.includes('from=') ? rangeText(r) : 'today'} is ready ✓`); }
    catch (e) { setError(`Could not get ${x.title}. ${errorText(e)}`); }
    finally { setBusy(null); }
  }
  const item = (x: Download) => (
    <View key={x.key} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>{x.title}</Text>
      <Note>{x.desc}</Note>
      <SmallButton icon="share-outline" title={x.kind === 'xlsx' ? 'Get Excel' : x.kind === 'xml' ? 'Get XML' : 'Get JSON'} label={`Get ${x.title}`} busy={busy === x.key} disabled={!!busy && busy !== x.key} onPress={() => void get(x)} />
    </View>
  );
  const rows = reg.data ? (allRows ? reg.data.rows : reg.data.rows.slice(0, 30)) : [];
  return (
    <View style={{ gap: 12 }}>
      {!!done && <Alert tone="ok">{done}</Alert>}
      {!!error && <Alert>{error}</Alert>}
      <Card><H2>Excel reports</H2><Note>Dated reports use the period chosen above. The file opens your share menu: WhatsApp, email, Drive or Files.</Note>{excel.map(item)}</Card>
      <Card><H2>Tally and GST e-filing</H2><Note>For the period chosen above. Ledger names are set in Settings → Tally and e-filing.</Note>{tally.map(item)}</Card>
      <Card>
        <H2>Sales register</H2>
        {!reg.data ? <Waiting q={reg} /> : (
          <>
            <Note>{`${reg.data.rows.length} document${reg.data.rows.length === 1 ? '' : 's'} · total ${rupees(reg.data.totals.total)} · taxable ${rupees(reg.data.totals.taxable)}`}</Note>
            {rows.map((x, i) => (
              <View key={`${x.number}-${i}`} style={[{ gap: 2, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }, x.status.startsWith('Cancelled') ? { opacity: 0.55 } : null]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: C.ink }}>{`${x.number} · ${dayLabel(x.date)}`}</Text>
                  <Tag label={x.kind} tone={x.kind.toLowerCase().includes('credit') ? 'warn' : 'teal'} />
                </View>
                <Note>{`${x.customer}${x.gstin ? ` · ${x.gstin}` : ''}`}</Note>
                <Line k="Taxable" v={rupees(x.taxable)} />
                <Line k="Total" v={rupees(x.total)} strong />
                {!!(x.status && x.status !== 'Issued') && <Note>{x.status}</Note>}
              </View>
            ))}
            {reg.data.rows.length > rows.length && <LinkButton title={`Show all ${reg.data.rows.length}`} onPress={() => setAllRows(true)} />}
          </>
        )}
      </Card>
    </View>
  );
}
