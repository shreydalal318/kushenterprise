'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { formatDate } from '@kush/core';
import { Badge, Card, PageHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyRow, LoadingRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { PaymentBadge } from './status';

const sel = 'h-10 rounded-lg border border-line bg-white px-3 text-sm';

export function InvoiceList() {
  const { can } = useMe();
  const [tab, setTab] = useState<'invoices' | 'credit'>('invoices');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = trpc.invoices.list.useQuery({ q: q || undefined, status: status || undefined, from: from || undefined, to: to || undefined }, { enabled: tab === 'invoices' });
  const cns = trpc.creditNotes.list.useQuery({ from: from || undefined, to: to || undefined }, { enabled: tab === 'credit' && (can('CREATE_TAX_INVOICE') || can('RECORD_PAYMENTS')) });
  const total = list.data?.filter((r) => r.status !== 'CANCELLED').reduce((t, r) => t + r.total, 0) ?? 0;
  const due = list.data?.reduce((t, r) => t + r.due, 0) ?? 0;
  return (
    <>
      <PageHeader title="Tax invoices" description="Never deleted: cancelled invoices stay on record with the reason."
        actions={can('CREATE_TAX_INVOICE') && <LinkButton href="/app/invoices/new"><Plus className="size-4" aria-hidden /> New invoice</LinkButton>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex rounded-lg bg-white p-0.5 ring-1 ring-line">
          {([['invoices', 'Invoices'], ['credit', 'Credit notes']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('h-9 rounded-md px-3 text-sm', tab === k ? 'bg-aqua-100 font-semibold text-navy' : 'text-muted')}>{l}</button>)}
        </div>
        {tab === 'invoices' && (
          <>
            <label className="relative"><span className="sr-only">Search</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number or customer" className={`${sel} w-56 pl-9`} /></label>
            <select aria-label="Payment status" className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option><option value="UNPAID">Unpaid</option><option value="PARTLY_PAID">Part paid</option><option value="OVERDUE">Overdue</option><option value="PAID">Paid</option><option value="CANCELLED">Cancelled</option>
            </select>
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-muted">From <input aria-label="From date" type="date" className={sel} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm text-muted">To <input aria-label="To date" type="date" className={sel} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {tab === 'invoices' && <span className="ml-auto text-sm text-muted">Billed {rupees(total)} · due {rupees(due)}</span>}
      </div>
      <Card className="overflow-hidden">
        {tab === 'invoices' ? (
          <Table minWidth={820}>
            <THead><tr><Th>Invoice</Th><Th>Date</Th><Th>Customer</Th><Th className="text-right">Total</Th><Th className="text-right">Due</Th><Th>Due date</Th><Th>Status</Th></tr></THead>
            <tbody>
              {!list.data && <LoadingRow cols={7} />}{list.data?.length === 0 && <EmptyRow cols={7}>No invoices yet.</EmptyRow>}
              {list.data?.map((r) => (
                <Tr key={r.id} className="hover:bg-aqua-50/60">
                  <Td><Link href={`/app/invoices/${r.id}`} className="font-mono text-sm font-medium text-navy hover:underline">{r.number}</Link><div className="text-xs text-muted">{r.taxType === 'INTER_STATE' ? 'IGST' : 'CGST + SGST'}</div></Td>
                  <Td>{formatDate(r.date)}</Td>
                  <Td>{r.customer.name}</Td>
                  <Td className={cn('num font-semibold', r.status === 'CANCELLED' && 'text-muted line-through')}>{rupees(r.total)}</Td>
                  <Td className="num">{r.due ? rupees(r.due) : '—'}</Td>
                  <Td className="text-sm">{formatDate(r.dueDate)}</Td>
                  <Td><PaymentBadge status={r.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Table minWidth={720}>
            <THead><tr><Th>Credit note</Th><Th>Date</Th><Th>Customer</Th><Th>Against</Th><Th>Reason</Th><Th className="text-right">Amount</Th></tr></THead>
            <tbody>
              {!cns.data && <LoadingRow cols={6} />}{cns.data?.length === 0 && <EmptyRow cols={6}>No credit notes.</EmptyRow>}
              {cns.data?.map((c) => (
                <Tr key={c.id}>
                  <Td><a href={`/api/documents/credit-note/${c.id}`} target="_blank" className="font-mono text-sm font-medium text-navy hover:underline" rel="noreferrer">{c.number}</a></Td>
                  <Td>{formatDate(c.date)}</Td><Td>{c.customer.name}</Td>
                  <Td>{c.invoice && <Link className="font-mono text-sm text-teal-700 hover:underline" href={`/app/invoices/${c.invoice.id}`}>{c.invoice.number}</Link>}</Td>
                  <Td className="text-sm">{c.reason}{c.restock && <Badge className="ml-2">Restocked</Badge>}</Td>
                  <Td className="num font-semibold">{rupees(c.total)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
