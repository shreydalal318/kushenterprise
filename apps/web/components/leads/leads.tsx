'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Mail, MessageCircle, Phone, Search, UserPlus } from 'lucide-react';
import { formatDateTime } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { TextAreaField } from '@/components/ui/field';
import { LinkButton } from '@/components/ui/link-button';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type Lead = RouterOutputs['leads']['get'];
const STATUS: Record<string, [string, 'warn' | 'teal' | 'ok' | 'neutral']> = { NEW: ['New', 'warn'], CONTACTED: ['Contacted', 'teal'], CONVERTED: ['Customer', 'ok'], CLOSED: ['Closed', 'neutral'] };
const TYPE: Record<string, string> = { HOSPITAL: 'Hospital', CLINIC: 'Clinic', DOCTOR: 'Doctor' };

/** Website enquiries: call back, note what happened, and convert the good ones into customers. */
export function Leads() {
  const params = useSearchParams();
  const [status, setStatus] = useState<'' | 'NEW' | 'CONTACTED' | 'CONVERTED' | 'CLOSED'>('NEW');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(params.get('open'));
  const list = trpc.leads.list.useQuery({ status: status || undefined, q: q || undefined });
  const counts = trpc.leads.counts.useQuery();
  useEffect(() => { if (params.get('open')) setStatus(''); }, [params]);
  return (
    <>
      <PageHeader title="Leads" description="Enquiries from the website. Call back, note what happened, and convert real customers in one click." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex rounded-lg bg-white p-0.5 ring-1 ring-line">
          {([['NEW', 'New'], ['CONTACTED', 'Contacted'], ['CONVERTED', 'Customers'], ['CLOSED', 'Closed'], ['', 'All']] as const).map(([k, l]) => (
            <button key={k || 'all'} role="tab" aria-selected={status === k} onClick={() => { setStatus(k); setOpenId(null); }} className={cn('h-9 rounded-md px-3 text-sm', status === k ? 'bg-aqua-100 font-semibold text-navy' : 'text-muted')}>
              {l}{k && counts.data?.[k] ? <span className="ml-1 text-xs text-muted">{counts.data[k]}</span> : null}
            </button>
          ))}
        </div>
        <label className="relative"><span className="sr-only">Search leads</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, clinic, mobile, city" className="h-10 w-64 rounded-lg border border-line bg-white pl-9 pr-3 text-sm" /></label>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <Card>
          <ul className="divide-y divide-line">
            {list.data?.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted">No enquiries here.</li>}
            {list.data?.map((l) => (
              <li key={l.id}>
                <button onClick={() => setOpenId(l.id)} aria-current={openId === l.id} className={cn('flex w-full flex-wrap items-start justify-between gap-2 px-5 py-3 text-left hover:bg-aqua-50', openId === l.id && 'bg-aqua-50')}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-navy">{l.organisation || l.name}{l.organisation && <span className="font-normal text-muted"> · {l.name}</span>}</p>
                    <p className="truncate text-sm text-muted">{l.message}</p>
                    <p className="text-xs text-muted">{formatDateTime(l.createdAt)}{l.city ? ` · ${l.city}` : ''}{l.type ? ` · ${TYPE[l.type]}` : ''}</p>
                  </div>
                  <Badge tone={STATUS[l.status]![1]}>{STATUS[l.status]![0]}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {openId ? <LeadPanelLoader key={openId} id={openId} /> : <Card><CardBody className="py-10 text-center text-sm text-muted">Choose an enquiry to see the details.</CardBody></Card>}
      </div>
    </>
  );
}

function LeadPanelLoader({ id }: { id: string }) {
  const q = trpc.leads.get.useQuery({ id });
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  return q.data ? <LeadPanel l={q.data} /> : <Card><CardBody className="text-sm text-muted">Loading…</CardBody></Card>;
}

function LeadPanel({ l }: { l: Lead }) {
  const utils = trpc.useUtils();
  const [notes, setNotes] = useState(l.notes ?? '');
  const update = trpc.leads.update.useMutation({ onSuccess: () => utils.leads.invalidate() });
  const tel = l.mobile.replace(/\s/g, '');
  return (
    <Card className="self-start">
      <CardHeader title={l.organisation || l.name} description={<Badge tone={STATUS[l.status]![1]}>{STATUS[l.status]![0]}</Badge>} />
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <a href={`tel:${tel}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-aqua-50"><Phone className="size-4" aria-hidden /> {l.mobile}</a>
          <a href={`https://wa.me/${tel.replace(/^\+/, '')}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-aqua-50"><MessageCircle className="size-4" aria-hidden /> WhatsApp</a>
          {l.email && <a href={`mailto:${l.email}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-aqua-50"><Mail className="size-4" aria-hidden /> Email</a>}
        </div>
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted">Name</dt><dd>{l.name}</dd>
          {l.type && <><dt className="text-muted">Type</dt><dd>{TYPE[l.type]}</dd></>}
          {l.city && <><dt className="text-muted">City</dt><dd>{l.city}</dd></>}
          <dt className="text-muted">Received</dt><dd>{formatDateTime(l.createdAt)}</dd>
          {l.sourcePath && <><dt className="text-muted">From page</dt><dd className="font-mono text-xs">{l.sourcePath}</dd></>}
          {l.handledBy && <><dt className="text-muted">Handled by</dt><dd>{l.handledBy}</dd></>}
        </dl>
        <div className="rounded-lg bg-canvas p-3 text-sm whitespace-pre-line">{l.message}</div>
        {l.products.length > 0 && <p className="text-sm">Asked about: {l.products.map((p) => <Link key={p.id} href={`/app/products/${p.id}`} className="mr-2 text-teal-700 hover:underline">{p.name}</Link>)}</p>}
        <TextAreaField label="Notes (internal)" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {update.error && <Alert>{errorMessage(update.error)}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={update.isPending && update.variables?.status === undefined} onClick={() => update.mutate({ id: l.id, notes })}>Save notes</Button>
          {l.status !== 'CONVERTED' && l.status !== 'CONTACTED' && <Button variant="secondary" onClick={() => update.mutate({ id: l.id, status: 'CONTACTED', notes })}>Mark contacted</Button>}
          {l.status !== 'CONVERTED' && l.status !== 'CLOSED' && <Button variant="secondary" onClick={() => update.mutate({ id: l.id, status: 'CLOSED', notes })}>Close</Button>}
        </div>
        {l.status === 'CONVERTED' && l.convertedCustomerId
          ? <LinkButton variant="secondary" href={`/app/customers/${l.convertedCustomerId}`}>Open customer</LinkButton>
          : <LinkButton href={`/app/customers/new?fromLead=${l.id}`}><UserPlus className="size-4" aria-hidden /> Convert to customer</LinkButton>}
      </CardBody>
    </Card>
  );
}
