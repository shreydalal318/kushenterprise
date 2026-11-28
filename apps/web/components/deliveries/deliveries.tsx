'use client';
import { useState } from 'react';
import Link from 'next/link';
import { MapPin, Phone, Truck } from 'lucide-react';
import { formatDate, formatDateTime } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/field';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';

const maps = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export function Deliveries() {
  const { can, me, isOwner } = useMe();
  // Strict: something with one of our staff is theirs to mark delivered (the owner can step in); pickups by anyone allowed.
  const mayDeliver = (personId: string | null) => (personId ? isOwner || (!!me && personId === me.id) : can('UPDATE_ORDER_STATUS'));
  const mine = trpc.deliveries.mine.useQuery();
  const board = trpc.deliveries.board.useQuery(undefined, { enabled: can('VIEW_ORDERS') });
  const [deliver, setDeliver] = useState<{ orderId: string; number: string } | null>(null);
  const byPerson = new Map<string, NonNullable<typeof board.data>>();
  for (const d of board.data ?? []) { const k = d.method === 'PICKUP' ? 'Waiting for customer pickup' : d.person ?? 'Unassigned'; byPerson.set(k, [...(byPerson.get(k) ?? []), d]); }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Deliveries" description="Local deliveries by our own staff, and orders waiting to be collected." />
      <Card>
        <CardHeader title="My deliveries" description="Orders handed to you to deliver. Mark each one delivered with who received it." />
        <ul className="divide-y divide-line">
          {mine.error ? <li role="alert" className="px-5 py-8 text-center text-sm text-danger">{errorMessage(mine.error)}</li>
            : !mine.data && <li className="px-5 py-8 text-center text-sm text-muted">Loading your deliveries…</li>}
          {mine.data?.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">Nothing to deliver right now.</li>}
          {mine.data?.map((d) => (
            <li key={d.dispatchId} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-navy">{d.customer} <Link href={`/app/orders/${d.orderId}`} className="ml-1 font-mono text-xs font-normal text-teal-700 hover:underline">{d.orderNumber}</Link></p>
                <p className="mt-1 flex items-start gap-1.5 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /> <a className="hover:underline" href={maps(d.address)} target="_blank" rel="noreferrer">{d.address}</a></p>
                {d.phone && <p className="mt-1 flex items-center gap-1.5 text-sm"><Phone className="size-4 text-muted" aria-hidden /> <a className="text-teal-700 hover:underline" href={`tel:${d.phone}`}>{d.contact ? `${d.contact} · ` : ''}{d.phone}</a></p>}
                <p className="mt-1 text-xs text-muted">{d.units} unit(s){d.invoice ? ` · invoice ${d.invoice.number} · ${rupees(d.invoice.total)}${d.invoice.due > 0 ? ` (due ${rupees(d.invoice.due)})` : ' (paid)'}` : ''}{d.surgeryDate ? ` · surgery ${formatDate(d.surgeryDate)}` : ''}</p>
                {d.note && <p className="mt-1 text-xs text-muted">Note: {d.note}</p>}
              </div>
              <Button onClick={() => setDeliver({ orderId: d.orderId, number: d.orderNumber })}>Mark delivered</Button>
            </li>
          ))}
        </ul>
      </Card>
      {can('VIEW_ORDERS') && (
        <Card>
          <CardHeader title="Out for delivery" description="Everything handed to our delivery staff or waiting for pickup that is not delivered yet." />
          <CardBody className="flex flex-col gap-5">
            {board.error ? <Alert>{errorMessage(board.error)}</Alert> : !board.data && <p className="text-sm text-muted">Loading…</p>}
            {board.data?.length === 0 && <p className="text-sm text-muted">Nothing is out right now.</p>}
            {[...byPerson.entries()].map(([who, rows]) => (
              <div key={who}>
                <p className="mb-2 flex items-center gap-2 font-medium text-navy"><Truck className="size-4 text-teal-700" aria-hidden /> {who} <Badge>{rows.length}</Badge>{rows[0]?.mobile && <a className="text-sm font-normal text-teal-700 hover:underline" href={`tel:${rows[0].mobile}`}>{rows[0].mobile}</a>}</p>
                <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                  {rows.map((d) => (
                    <li key={d.dispatchId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <span><Link href={`/app/orders/${d.orderId}`} className="font-mono text-teal-700 hover:underline">{d.orderNumber}</Link> · {d.customer}<span className="block text-xs text-muted">{d.address}</span></span>
                      <span className="flex items-center gap-2 text-xs text-muted">since {formatDateTime(d.since)}{mayDeliver(d.personId) && <Button size="sm" variant="secondary" onClick={() => setDeliver({ orderId: d.orderId, number: d.orderNumber })}>Mark delivered</Button>}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
      {deliver && <DeliverDialog orderId={deliver.orderId} number={deliver.number} onClose={() => setDeliver(null)} />}
    </div>
  );
}

function DeliverDialog({ orderId, number, onClose }: { orderId: string; number: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [receivedBy, setReceivedBy] = useState('');
  const [note, setNote] = useState('');
  const m = trpc.orders.markDelivered.useMutation({ onSuccess: async () => { await Promise.all([utils.deliveries.invalidate(), utils.orders.invalidate(), utils.analytics.invalidate()]); onClose(); } });
  const fe = fieldErrors(m.error);
  return (
    <Dialog open onClose={onClose} title={`Delivered: ${number}`} description="Who received the goods? Optional, kept as proof of delivery." size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate({ id: orderId, receivedBy: receivedBy.trim() || null, note })}>Mark delivered</Button></>}>
      <div className="flex flex-col gap-3">
        <TextField label="Received by (optional)" placeholder="e.g. Sister Mary, OT store" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} error={fe.receivedBy} />
        <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {m.error && !fe.receivedBy && <Alert>{errorMessage(m.error)}</Alert>}
      </div>
    </Dialog>
  );
}
