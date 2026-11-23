'use client';
import Link from 'next/link';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, Clock, PackageCheck, Truck } from 'lucide-react';
import { formatDate, ORDER_STATUS_LABEL, type OrderStatus } from '@kush/core';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/card';
import { OrderBadge } from '@/components/sales/status';
import { cn } from '@/lib/cn';
import { rupees } from '@/lib/format';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { AgeingBar, dayLabel, LineChart } from './charts';

type Home = RouterOutputs['analytics']['home'];

function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return null;
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  const up = pct >= 0;
  return <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', up ? 'text-ok' : 'text-danger')}>{up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}{Math.abs(pct)}% vs last month (same days)</span>;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return <Card className="px-4 py-3"><p className="text-xs text-muted">{label}</p><p className="text-2xl font-semibold tabular-nums text-navy">{value}</p>{sub && <div className="mt-0.5">{sub}</div>}</Card>;
}

function OwnerView({ d }: { d: NonNullable<Home['owner']> }) {
  const t = d.tiles;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Sales today (before GST)" value={rupees(t.today.sales)} sub={<span className="text-xs text-muted">{t.today.invoices} invoice(s) · {t.today.orders} order(s)</span>} />
        <Tile label="This week" value={rupees(t.week.sales)} sub={<span className="text-xs text-muted">{t.week.invoices} invoice(s) · received {rupees(t.week.received)}</span>} />
        <Tile label="This month" value={rupees(t.month.sales)} sub={<Delta now={t.month.sales} before={t.prevMonthToDate.sales} />} />
        <Tile label="Outstanding" value={rupees(d.outstanding)} sub={d.overdue > 0 ? <span className="text-xs text-danger">{rupees(d.overdue)} overdue</span> : <span className="text-xs text-muted">Nothing overdue</span>} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="Sales, last 30 days" description="Daily sales before GST, net of returns; compared with the 30 days before." actions={<Link href="/app/analytics" className="text-sm text-teal-700 hover:underline">Analytics →</Link>} />
          <CardBody>
            <LineChart title="Daily sales, last 30 days compared with the previous 30 days" series={[
              { name: 'Last 30 days', points: d.trend.current.map((p) => ({ label: dayLabel(p.date), value: p.sales })) },
              { name: 'Previous 30 days', points: d.trend.previous.map((p, i) => ({ label: dayLabel(d.trend.current[i]?.date ?? p.date), value: p.sales })) },
            ]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Orders waiting" />
          <ul className="divide-y divide-line">
            {(['PLACED', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'ON_HOLD'] as OrderStatus[]).map((s) => (
              <li key={s}><Link href={`/app/orders?status=${s}`} className="flex items-center justify-between px-5 py-2.5 hover:bg-aqua-50"><OrderBadge status={s} /><span className="text-lg font-semibold tabular-nums">{d.pendingOrders[s] ?? 0}</span></Link></li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Stock" actions={<Link href="/app/stock" className="text-sm text-teal-700 hover:underline">Open →</Link>} />
          <CardBody className="flex flex-col gap-2 text-sm">
            {d.stock.value != null && <p className="flex justify-between"><span className="text-muted">Value at cost</span><strong className="tabular-nums">{rupees(d.stock.value)}</strong></p>}
            <Link href="/app/stock/low" className="flex justify-between hover:underline"><span className="text-muted">Low stock</span><strong className={cn('tabular-nums', d.stock.lowCount && 'text-warn')}>{d.stock.lowCount} item(s)</strong></Link>
            <Link href="/app/stock/low" className="flex justify-between hover:underline"><span className="text-muted">Out of stock</span><strong className={cn('tabular-nums', d.stock.outCount && 'text-danger')}>{d.stock.outCount} item(s)</strong></Link>
            <Link href="/app/stock/expiring" className="flex justify-between hover:underline"><span className="text-muted">Expiring within {d.stock.expiryWindowDays} days</span><strong className="tabular-nums">{d.stock.expiringUnits} unit(s){d.stock.expiringValue != null ? ` · ${rupees(d.stock.expiringValue)}` : ''}</strong></Link>
            {d.stock.expiredUnits > 0 && <p className="flex items-center gap-1.5 text-danger"><AlertTriangle className="size-4" aria-hidden /> {d.stock.expiredUnits} expired unit(s) still on the shelf</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Receivables ageing" actions={<Link href="/app/payments" className="text-sm text-teal-700 hover:underline">Outstanding →</Link>} />
          <CardBody><AgeingBar ageing={d.ageing} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Top overdue" />
          <ul className="divide-y divide-line">
            {d.topOverdue.length === 0 && <li className="px-5 py-6 text-center text-sm text-muted">Nobody is overdue.</li>}
            {d.topOverdue.map((c) => <li key={c.customerId}><Link href={`/app/ledger/${c.customerId}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-aqua-50"><span className="truncate">{c.name}</span><span className="shrink-0 font-semibold tabular-nums text-danger">{rupees(c.overdue)}</span></Link></li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function StaffView({ s }: { s: Home['staff'] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader title="My orders" description="Orders assigned to you that still need work." />
        <ul className="divide-y divide-line">
          {s.myOrders.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">Nothing assigned to you right now.</li>}
          {s.myOrders.map((o) => (
            <li key={o.id}><Link href={`/app/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-aqua-50">
              <div><span className="font-mono text-sm font-medium text-navy">{o.number}</span><div className="text-xs text-muted">{o.customer} · {o.units} unit(s)</div></div>
              <div className="flex items-center gap-2">{o.surgeryDate && <Badge tone="warn">Surgery {formatDate(o.surgeryDate)}</Badge>}<OrderBadge status={o.status} /></div>
            </Link></li>
          ))}
        </ul>
      </Card>
      <div className="flex flex-col gap-3">
        <Card className="flex items-center gap-3 px-4 py-3"><Truck className="size-6 text-teal-700" aria-hidden /><div><p className="text-xs text-muted">To pack / dispatch</p><p className="text-xl font-semibold">{s.toDispatch}</p></div></Card>
        <Card className="flex items-center gap-3 px-4 py-3"><Boxes className="size-6 text-warn" aria-hidden /><div><p className="text-xs text-muted">Low / out of stock</p><p className="text-xl font-semibold">{s.lowCount} / {s.outCount}</p></div></Card>
        <Card className="flex items-center gap-3 px-4 py-3"><Clock className="size-6 text-danger" aria-hidden /><div><p className="text-xs text-muted">Expiring within {s.expiryWindowDays} days</p><p className="text-xl font-semibold">{s.expiringUnits} unit(s)</p>{s.expiredUnits > 0 && <p className="text-xs text-danger">{s.expiredUnits} already expired</p>}</div></Card>
        <Card className="flex items-center gap-3 px-4 py-3"><PackageCheck className="size-6 text-ok" aria-hidden /><Link href="/app/scan" className="text-sm font-semibold text-teal-700 hover:underline">Scan to look up an item →</Link></Card>
      </div>
    </div>
  );
}

export function Dashboard() {
  const q = trpc.analytics.home.useQuery(undefined, { refetchInterval: 5 * 60_000 });
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  return q.data.kind === 'owner' && q.data.owner ? (
    <div className="flex flex-col gap-8"><OwnerView d={q.data.owner} />{q.data.staff.myOrders.length > 0 && <StaffView s={q.data.staff} />}</div>
  ) : <StaffView s={q.data.staff} />;
}
export { ORDER_STATUS_LABEL };
