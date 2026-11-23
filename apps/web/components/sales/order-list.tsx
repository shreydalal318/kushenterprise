'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { formatDate, formatDateTime, ORDER_STATUS_LABEL, ORDER_STATUSES, type OrderStatus } from '@kush/core';
import { Badge, Card, PageHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { OrderBadge } from './status';

const sel = 'h-10 rounded-lg border border-line bg-white px-3 text-sm';

export function OrderList() {
  const { can } = useMe();
  const [q, setQ] = useState('');
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [assignedToId, setAssigned] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const staff = trpc.orders.staff.useQuery();
  const list = trpc.orders.list.useQuery({ q: q || undefined, status: (status || undefined) as OrderStatus | undefined, assignedToId: assignedToId || undefined, from: from || undefined, to: to || undefined });
  return (
    <>
      <PageHeader title="Orders" description="Pending orders are listed first." actions={can('CREATE_ORDERS') && <LinkButton href="/app/orders/new"><Plus className="size-4" aria-hidden /> New order</LinkButton>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative"><span className="sr-only">Search</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order no. or customer" className={`${sel} w-56 pl-9`} /></label>
        <select aria-label="Status" className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
        </select>
        <select aria-label="Assigned to" className={sel} value={assignedToId} onChange={(e) => setAssigned(e.target.value)}>
          <option value="">Anyone</option>{staff.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input aria-label="From date" type="date" className={sel} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input aria-label="To date" type="date" className={sel} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Card className="overflow-hidden">
        <Table minWidth={860}>
          <THead><tr><Th>Order</Th><Th>Customer</Th><Th>Status</Th><Th className="text-right">Units</Th><Th className="text-right">Value</Th><Th>Assigned</Th><Th>Source</Th></tr></THead>
          <tbody>
            {list.data?.length === 0 && <EmptyRow cols={7}>No orders.</EmptyRow>}
            {list.data?.map((o) => (
              <Tr key={o.id} className="hover:bg-aqua-50/60">
                <Td><Link href={`/app/orders/${o.id}`} className="font-mono text-sm font-medium text-navy hover:underline">{o.number}</Link><div className="text-xs text-muted">{formatDateTime(o.createdAt)}</div></Td>
                <Td>{o.customer.name}{o.forDoctor && <div className="text-xs text-muted">for {o.forDoctor}</div>}{o.surgeryDate && <div className="text-xs text-muted">Surgery {formatDate(o.surgeryDate)}</div>}</Td>
                <Td><OrderBadge status={o.status} />{o.backorder > 0 && o.status !== 'PLACED' && o.status !== 'CANCELLED' && <Badge tone="warn" className="ml-1">{o.backorder} to send</Badge>}</Td>
                <Td className="num">{o.units}</Td>
                <Td className="num">{rupees(o.value)}</Td>
                <Td className="text-sm">{o.assignedTo ?? '—'}</Td>
                <Td className="text-xs text-muted">{o.source === 'STAFF' ? 'Staff' : o.source === 'PORTAL' ? 'Portal' : 'App'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
