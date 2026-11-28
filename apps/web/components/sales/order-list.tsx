'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { formatDate, formatDateTime, type OrderStatus } from '@kush/core';
import { Alert, Badge, Card, PageHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyRow, LoadingRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { errorMessage } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { OrderBadge } from './status';

const sel = 'h-10 rounded-lg border border-line bg-white px-3 text-sm';
/** Filter value (and ?assigned= link value) for orders nobody has been chosen to handle yet. */
const NOBODY = 'none';
/** The same four steps as everywhere else (New covers Placed and Confirmed), then the side states. */
const FILTERS: [OrderStatus | 'TO_INVOICE', string][] = [
  ['TO_INVOICE', 'New (to invoice)'], ['PACKED', 'Invoiced (to dispatch)'], ['DISPATCHED', 'Dispatched'], ['DELIVERED', 'Delivered'], ['ON_HOLD', 'On hold'], ['CANCELLED', 'Cancelled'],
];
const NotAssigned = ({ status }: { status: OrderStatus }) => <Badge tone={status === 'DELIVERED' || status === 'CANCELLED' ? 'neutral' : 'warn'}>Not assigned</Badge>;

export function OrderList() {
  const { can } = useMe();
  const [q, setQ] = useState('');
  const params = useSearchParams();
  const [status, setStatus] = useState(() => { const s = params.get('status') ?? ''; return s === 'PLACED' || s === 'CONFIRMED' ? 'TO_INVOICE' : s; });
  const [assigned, setAssigned] = useState(params.get('assigned') ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const staff = trpc.orders.staff.useQuery();
  const list = trpc.orders.list.useQuery({
    q: q || undefined, status: (status || undefined) as OrderStatus | 'TO_INVOICE' | undefined, from: from || undefined, to: to || undefined,
    ...(assigned === NOBODY ? { unassigned: true } : { assignedToId: assigned || undefined }),
  });
  return (
    <>
      <PageHeader title="Orders" description="Pending orders are listed first." actions={can('CREATE_ORDERS') && <LinkButton href="/app/orders/new"><Plus className="size-4" aria-hidden /> New order</LinkButton>} />
      <div className="mb-4 grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
        <label className="relative col-span-2"><span className="sr-only">Search</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order no. or customer" className={`${sel} w-full pl-9 lg:w-64`} /></label>
        <select aria-label="Status" className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select aria-label="Handled by" className={sel} value={assigned} onChange={(e) => setAssigned(e.target.value)}>
          <option value="">Anyone</option><option value={NOBODY}>Not assigned</option>
          {staff.data?.filter((s) => s.role === 'EMPLOYEE').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className="flex min-w-0 items-center gap-2 text-sm text-muted">From <input aria-label="From date" type="date" className={`${sel} min-w-0 flex-1`} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex min-w-0 items-center gap-2 text-sm text-muted">To <input aria-label="To date" type="date" className={`${sel} min-w-0 flex-1`} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      {/* Phones: one card per order. */}
      <ul className="flex flex-col gap-2 sm:hidden" aria-busy={!list.data}>
        {list.error ? <li><Alert>{errorMessage(list.error)}</Alert></li> : !list.data && Array.from({ length: 4 }, (_, i) => <li key={i} className="h-24 animate-pulse rounded-xl border border-line bg-white" aria-hidden />)}
        {list.data?.length === 0 && <li><Card className="py-10 text-center text-sm text-muted">No orders.</Card></li>}
        {list.data?.map((o) => (
          <li key={o.id}>
            <Link href={`/app/orders/${o.id}`} className="block rounded-xl border border-line bg-white px-4 py-3 active:bg-aqua-50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium text-navy">{o.number}</p>
                  <p className="truncate font-medium">{o.customer.name}</p>
                  {(o.forDoctor || o.surgeryDate) && <p className="truncate text-xs text-muted">{[o.forDoctor && `for ${o.forDoctor}`, o.surgeryDate && `Surgery ${formatDate(o.surgeryDate)}`].filter(Boolean).join(' · ')}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <OrderBadge status={o.status} />
                  {o.backorder > 0 && o.status !== 'PLACED' && o.status !== 'CANCELLED' && <Badge tone="warn">{o.backorder} to invoice</Badge>}
                </div>
              </div>
              <p className="mt-2 flex justify-between text-xs text-muted"><span>{o.units} unit{o.units === 1 ? '' : 's'} · <span className="font-medium text-ink">{rupees(o.value)}</span></span><span>{formatDateTime(o.createdAt)}</span></p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">Handled by {o.assignedTo ? <span className="font-medium text-ink">{o.assignedTo}</span> : <NotAssigned status={o.status} />}</p>
            </Link>
          </li>
        ))}
      </ul>

      <Card className="hidden overflow-hidden sm:block">
        <Table minWidth={860}>
          <THead><tr><Th>Order</Th><Th>Customer</Th><Th>Status</Th><Th className="text-right">Units</Th><Th className="text-right">Value</Th><Th>Handled by</Th><Th>Source</Th></tr></THead>
          <tbody>
            {!list.data && <LoadingRow cols={7} error={list.error} />}{list.data?.length === 0 && <EmptyRow cols={7}>No orders.</EmptyRow>}
            {list.data?.map((o) => (
              <Tr key={o.id} className="hover:bg-aqua-50/60">
                <Td><Link href={`/app/orders/${o.id}`} className="font-mono text-sm font-medium text-navy hover:underline">{o.number}</Link><div className="text-xs text-muted">{formatDateTime(o.createdAt)}</div></Td>
                <Td>{o.customer.name}{o.forDoctor && <div className="text-xs text-muted">for {o.forDoctor}</div>}{o.surgeryDate && <div className="text-xs text-muted">Surgery {formatDate(o.surgeryDate)}</div>}</Td>
                <Td><OrderBadge status={o.status} />{o.backorder > 0 && o.status !== 'PLACED' && o.status !== 'CANCELLED' && <Badge tone="warn" className="ml-1">{o.backorder} to invoice</Badge>}</Td>
                <Td className="num">{o.units}</Td>
                <Td className="num">{rupees(o.value)}</Td>
                <Td className="text-sm">{o.assignedTo ?? <NotAssigned status={o.status} />}</Td>
                <Td className="text-xs text-muted">{o.source === 'STAFF' ? 'Staff' : o.source === 'PORTAL' ? 'Portal' : 'App'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
