'use client';
import Link from 'next/link';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { formatDateTime } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { CustomerOrderBadge } from '@/components/sales/status';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useCart } from './cart';

export function PortalHome() {
  const q = trpc.portal.home.useQuery();
  const utils = trpc.useUtils();
  const cart = useCart();
  const notes = trpc.notifications.list.useQuery({ limit: 5, unreadOnly: false });
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const d = q.data;
  async function reorder(orderId: string) {
    cart.add(await utils.portal.reorderLines.fetch({ orderId }));
    window.location.href = '/portal/cart';
  }
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`Welcome, ${d.customer.name}`} description={`Account ${d.customer.code}`} actions={<LinkButton href="/portal/catalogue">Order lenses &amp; supplies <ArrowRight className="size-4" aria-hidden /></LinkButton>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="px-5 py-4"><p className="text-xs text-muted">Outstanding</p><p className={cn('text-2xl font-semibold', d.outstanding > 0 ? 'text-navy' : 'text-ok')}>{rupees(Math.max(0, d.outstanding))}</p>{d.overdue > 0 && <p className="text-xs text-danger">{rupees(d.overdue)} overdue</p>}{d.onAccount > 0 && <p className="text-xs text-muted">{rupees(d.onAccount)} advance with us</p>}</Card>
        <Card className="px-5 py-4"><p className="text-xs text-muted">Open orders</p><p className="text-2xl font-semibold text-navy">{d.openOrders}</p><Link href="/portal/orders" className="text-xs text-teal-700 hover:underline">See all orders</Link></Card>
        <Card className="px-5 py-4"><p className="text-xs text-muted">Unread notifications</p><p className="text-2xl font-semibold text-navy">{d.unread}</p><Link href="/portal/notifications" className="text-xs text-teal-700 hover:underline">Open inbox</Link></Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Recent orders" />
          <ul className="divide-y divide-line">
            {d.orders.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">No orders yet. <Link className="text-teal-700 hover:underline" href="/portal/catalogue">Browse the catalogue</Link>.</li>}
            {d.orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div><Link href={`/portal/orders/${o.id}`} className="font-mono text-sm font-medium text-navy hover:underline">{o.number}</Link><div className="text-xs text-muted">{formatDateTime(o.createdAt)} · {o.units} unit(s)</div></div>
                <div className="flex items-center gap-2"><CustomerOrderBadge status={o.status} /><Button size="sm" variant="secondary" onClick={() => void reorder(o.id)}><RotateCcw className="size-3.5" aria-hidden /> Order again</Button></div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Latest updates" />
          <CardBody className="flex flex-col gap-3">
            {notes.data?.length === 0 && <p className="text-sm text-muted">Nothing yet.</p>}
            {notes.data?.map((n) => (
              <div key={n.id} className={cn('text-sm', !n.readAt && 'font-medium')}>
                {n.link ? <Link href={n.link} className="text-navy hover:underline">{n.title}</Link> : <span className="text-navy">{n.title}</span>}
                <p className="text-xs text-muted">{n.body}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
