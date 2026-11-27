'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Download, FileDown } from 'lucide-react';
import { AGEING_BUCKETS, CHANNEL_LABEL, formatDate, formatDateTime, NOTIFICATION_CHANNELS_FOR_CUSTOMER, type CustomerChannel } from '@kush/core';
import { SignOutButton } from '@/components/app/sign-out-button';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Checkbox, TextAreaField } from '@/components/ui/field';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { PaymentBadge } from '@/components/sales/status';
import { ShareButton } from '@/components/sales/share-button';
import { cn } from '@/lib/cn';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';

const pdf = (kind: string, id: string) => `/api/documents/${kind}/${id}`;
const DocLinks = ({ kind, id }: { kind: 'invoice' | 'proforma' | 'credit-note'; id: string }) => (
  <span className="flex items-center gap-3 text-sm"><a className="text-teal-700 hover:underline" href={pdf(kind, id)} target="_blank" rel="noreferrer">View</a><a className="text-teal-700 hover:underline" href={`${pdf(kind, id)}?download=1`}><Download className="inline size-3.5" aria-hidden /> PDF</a><ShareButton kind={kind} id={id} /></span>
);

export function MyInvoices() {
  const q = trpc.portal.documents.useQuery();
  const [tab, setTab] = useState<'invoices' | 'proformas' | 'credit'>('invoices');
  return (
    <>
      <PageHeader title="Invoices" description="Download or share your tax invoices, proformas and credit notes." />
      <div role="tablist" className="mb-4 flex w-fit rounded-lg bg-white p-0.5 ring-1 ring-line">
        {([['invoices', 'Tax invoices'], ['proformas', 'Proformas'], ['credit', 'Credit notes']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('h-9 rounded-md px-3 text-sm', tab === k ? 'bg-aqua-100 font-semibold text-navy' : 'text-muted')}>{l}</button>)}
      </div>
      <Card className="overflow-hidden">
        {tab === 'invoices' && (
          <Table minWidth={680}>
            <THead><tr><Th>Invoice</Th><Th>Due date</Th><Th className="text-right">Total</Th><Th className="text-right">Due</Th><Th>Status</Th><Th /></tr></THead>
            <tbody>
              {q.data?.invoices.length === 0 && <EmptyRow cols={6}>No invoices yet.</EmptyRow>}
              {q.data?.invoices.map((i) => <Tr key={i.id}><Td className="font-mono text-sm">{i.number}<div className="font-sans text-xs text-muted">{i.date ? formatDate(i.date) : ''}</div></Td><Td>{i.dueDate ? formatDate(i.dueDate) : ''}</Td><Td className="num">{rupees(i.total)}</Td><Td className="num font-semibold">{i.due ? rupees(i.due) : '—'}</Td><Td><PaymentBadge status={i.status} /></Td><Td><DocLinks kind="invoice" id={i.id} /></Td></Tr>)}
            </tbody>
          </Table>
        )}
        {tab === 'proformas' && (
          <Table minWidth={560}>
            <THead><tr><Th>Proforma</Th><Th>Valid until</Th><Th className="text-right">Total</Th><Th>Status</Th><Th /></tr></THead>
            <tbody>
              {q.data?.proformas.length === 0 && <EmptyRow cols={5}>No proformas.</EmptyRow>}
              {q.data?.proformas.map((p) => <Tr key={p.id}><Td className="font-mono text-sm">{p.number}<div className="font-sans text-xs text-muted">{p.date ? formatDate(p.date) : ''}</div></Td><Td>{p.validUntil ? formatDate(p.validUntil) : '—'}</Td><Td className="num">{rupees(p.total)}</Td><Td><Badge tone={p.status === 'CONVERTED' ? 'ok' : p.status === 'CANCELLED' ? 'danger' : 'teal'}>{p.status.toLowerCase()}</Badge></Td><Td><DocLinks kind="proforma" id={p.id} /></Td></Tr>)}
            </tbody>
          </Table>
        )}
        {tab === 'credit' && (
          <Table minWidth={520}>
            <THead><tr><Th>Credit note</Th><Th>Against</Th><Th className="text-right">Amount</Th><Th /></tr></THead>
            <tbody>
              {q.data?.creditNotes.length === 0 && <EmptyRow cols={4}>No credit notes.</EmptyRow>}
              {q.data?.creditNotes.map((c) => <Tr key={c.id}><Td className="font-mono text-sm">{c.number}<div className="font-sans text-xs text-muted">{c.date ? formatDate(c.date) : ''}</div></Td><Td className="font-mono text-sm">{c.invoice ?? '—'}</Td><Td className="num">{rupees(c.total)}</Td><Td><DocLinks kind="credit-note" id={c.id} /></Td></Tr>)}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

const KIND: Record<string, string> = { INVOICE: 'Invoice', PAYMENT: 'Payment', CREDIT_NOTE: 'Credit note', CANCELLED_INVOICE: 'Invoice (cancelled)' };

export function MyAccount({ customerId }: { customerId: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = trpc.portal.ledger.useQuery({ from: from || undefined, to: to || undefined });
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const d = q.data;
  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Account" description={`Payment terms ${d.customer.paymentTermsDays} days${d.customer.creditLimit ? ` · credit limit ${rupees(d.customer.creditLimit)}` : ''}`}
        actions={<a href={`/api/statement/${customerId}?download=1${qs ? `&${qs}` : ''}`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"><FileDown className="size-4" aria-hidden /> Statement PDF</a>} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Card className="col-span-2 px-4 py-3"><p className="text-xs text-muted">Outstanding</p><p className={cn('text-2xl font-semibold', d.outstanding > 0 ? 'text-navy' : 'text-ok')}>{rupees(Math.abs(d.outstanding))}{d.outstanding < 0 && <span className="ml-1 text-sm font-normal">advance</span>}</p>{d.overdue > 0 && <p className="text-xs text-danger">{rupees(d.overdue)} overdue</p>}</Card>
        {AGEING_BUCKETS.map((b) => <Card key={b} className="px-4 py-3"><p className="text-xs text-muted">{b} days</p><p className="text-lg font-semibold">{rupees(d.ageing[b])}</p></Card>)}
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Statement" actions={<div className="flex gap-2"><input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm" /><input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm" /></div>} />
        <Table minWidth={680}>
          <THead><tr><Th>Date</Th><Th>Document</Th><Th className="text-right">Debit</Th><Th className="text-right">Credit</Th><Th className="text-right">Balance</Th></tr></THead>
          <tbody>
            <Tr className="bg-canvas"><Td colSpan={4} className="font-medium">Opening balance</Td><Td className="num font-semibold">{rupees(d.opening)}</Td></Tr>
            {d.rows.length === 0 && <EmptyRow cols={5}>No entries in this period.</EmptyRow>}
            {d.rows.map((e) => <Tr key={`${e.type}-${e.id}`} className={e.type === 'CANCELLED_INVOICE' ? 'text-muted' : ''}><Td>{formatDate(e.date)}</Td><Td className="text-sm">{KIND[e.type]} <span className="font-mono">{e.number}</span></Td><Td className="num">{e.debit ? rupees(e.debit) : ''}</Td><Td className="num text-ok">{e.credit ? rupees(e.credit) : ''}</Td><Td className="num font-semibold">{rupees(e.balance)}</Td></Tr>)}
            <Tr className="bg-canvas"><Td colSpan={4} className="font-medium">Closing balance</Td><Td className="num font-semibold">{rupees(d.closing)}</Td></Tr>
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

export function Inbox() {
  const utils = trpc.useUtils();
  const q = trpc.notifications.list.useQuery({ limit: 100 });
  const mark = trpc.notifications.markRead.useMutation({ onSuccess: () => utils.notifications.invalidate() });
  return (
    <>
      <PageHeader title="Notifications" actions={<Button variant="secondary" loading={mark.isPending} onClick={() => mark.mutate({})}>Mark all as read</Button>} />
      <Card>
        <ul className="divide-y divide-line">
          {q.data?.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted">No notifications yet.</li>}
          {q.data?.map((n) => (
            <li key={n.id} className={cn('flex gap-3 px-5 py-3', !n.readAt && 'bg-aqua-50/60')}>
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-teal')} aria-hidden />
              <div className="min-w-0 flex-1">
                {n.link ? <Link href={n.link} onClick={() => !n.readAt && mark.mutate({ ids: [n.id] })} className="font-medium text-navy hover:underline">{n.title}</Link> : <p className="font-medium text-navy">{n.title}</p>}
                <p className="text-sm text-ink/80">{n.body}</p>
                <p className="text-xs text-muted">{formatDateTime(n.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

export function MyProfile() {
  const utils = trpc.useUtils();
  const q = trpc.portal.profile.useQuery();
  const [msg, setMsg] = useState('');
  const req = trpc.portal.requestChange.useMutation({ onSuccess: () => setMsg('') });
  const channels = trpc.portal.setNotifyChannels.useMutation({ onSuccess: () => utils.portal.profile.invalidate() });
  const fe = fieldErrors(req.error);
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const p = q.data;
  const kv = (k: string, v: unknown) => (v ? <div><dt className="text-xs text-muted">{k}</dt><dd className="text-sm">{String(v)}</dd></div> : null);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Profile & settings" description={`${p.name} · ${p.code}`}
        actions={<SignOutButton className="h-10 rounded-lg border border-line bg-white px-4 font-semibold text-ink hover:bg-aqua-50" />} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader title="Registration" /><CardBody><dl className="grid grid-cols-2 gap-3">
          {kv('Type', p.type.toLowerCase())}{kv('GSTIN', p.gstin)}{kv('PAN', p.pan)}{kv('Drug licence', p.drugLicenceNo)}{kv('Contact person', p.contactPerson)}{kv('Phone', p.mobile)}{kv('Email', p.email)}{kv('Hospital', p.hospital)}{kv('Payment terms', `${p.paymentTermsDays} days`)}{kv('Credit limit', p.creditLimit ? rupees(p.creditLimit) : null)}
        </dl></CardBody></Card>
        <Card><CardHeader title="Addresses" description="Kept by Kush Enterprise. Ask below to add or change one." />
          <ul className="divide-y divide-line">{p.addresses.map((a) => <li key={a.id} className="px-5 py-3 text-sm"><Badge tone={a.kind === 'BILLING' ? 'navy' : 'teal'}>{a.kind === 'BILLING' ? 'Billing' : 'Delivery'}</Badge>{a.isDefault && <Badge className="ml-1">Default</Badge>} {a.label && <strong>{a.label}: </strong>}{a.text}</li>)}</ul>
        </Card>
        {p.doctors.length > 0 && <Card><CardHeader title="Linked doctors" /><ul className="divide-y divide-line">{p.doctors.map((d) => <li key={d.id} className="px-5 py-2 text-sm">{d.name}{d.mobile ? <span className="text-muted"> · {d.mobile}</span> : null}</li>)}</ul></Card>}
        <Card><CardHeader title="How we keep you updated" description="Order updates always appear in your inbox here." /><CardBody className="flex flex-col gap-2">
          {NOTIFICATION_CHANNELS_FOR_CUSTOMER.map((c: CustomerChannel) => (
            <Checkbox key={c} label={CHANNEL_LABEL[c]} checked={p.notifyChannels.includes(c)} disabled={channels.isPending}
              onChange={(e) => channels.mutate({ channels: (e.target.checked ? [...p.notifyChannels, c] : p.notifyChannels.filter((x) => x !== c)).filter((x): x is CustomerChannel => x !== 'IN_APP') })} />
          ))}
          {p.contact && <p className="mt-2 text-sm text-muted">Your contact at Kush Enterprise: <strong className="text-ink">{p.contact.name}</strong>{p.contact.mobile ? ` · ${p.contact.mobile}` : ''}</p>}
        </CardBody></Card>
        <Card className="lg:col-span-2"><CardHeader title="Ask for a change" description="New delivery address, GSTIN, contact details, a doctor to add… We will update your account and let you know." /><CardBody className="flex flex-col gap-3">
          <TextAreaField label="What should change?" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} error={fe.message} />
          {req.isSuccess && <Alert tone="ok">Sent. We will update your account and let you know.</Alert>}
          {req.error && !fe.message && <Alert>{errorMessage(req.error)}</Alert>}
          <div><Button loading={req.isPending} onClick={() => req.mutate({ message: msg })}>Send request</Button></div>
        </CardBody></Card>
      </div>
      <p className="text-xs text-muted">Signed in as {p.login.name}{p.login.mobile ? ` (${p.login.mobile})` : ''}.</p>
    </div>
  );
}
