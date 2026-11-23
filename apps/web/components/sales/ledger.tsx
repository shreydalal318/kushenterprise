'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { AGEING_BUCKETS, formatDate } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardHeader, PageHeader } from '@/components/ui/card';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { RecordPaymentDialog } from './payments';
import { PaymentBadge } from './status';

const KIND: Record<string, string> = { INVOICE: 'Invoice', PAYMENT: 'Receipt', CREDIT_NOTE: 'Credit note', CANCELLED_INVOICE: 'Invoice (cancelled)' };

export function CustomerLedger({ customerId }: { customerId: string }) {
  const { can } = useMe();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pay, setPay] = useState(false);
  const q = trpc.ledger.customer.useQuery({ customerId, from: from || undefined, to: to || undefined });
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const d = q.data;
  const href = (e: (typeof d.rows)[number]) => (e.type === 'INVOICE' || e.type === 'CANCELLED_INVOICE' ? `/app/invoices/${e.id}` : e.type === 'CREDIT_NOTE' ? `/api/documents/credit-note/${e.id}` : null);
  return (
    <div className="flex flex-col gap-5">
      <Link href={`/app/customers/${d.customer.id}`} className="flex w-fit items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> {d.customer.name}</Link>
      <PageHeader title="Account statement" description={`${d.customer.name} (${d.customer.code}) · terms ${d.customer.paymentTermsDays} days${d.customer.creditLimit ? ` · credit limit ${rupees(d.customer.creditLimit)}` : ''}`}
        actions={can('RECORD_PAYMENTS') && <Button onClick={() => setPay(true)}><Plus className="size-4" aria-hidden /> Record payment</Button>} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Card className="col-span-2 px-4 py-3"><p className="text-xs text-muted">Outstanding</p><p className={cn('text-2xl font-semibold', d.outstanding > 0 ? 'text-navy' : 'text-ok')}>{rupees(Math.abs(d.outstanding))}{d.outstanding < 0 && <span className="ml-1 text-sm font-normal">advance</span>}</p>{d.overdue > 0 && <p className="text-xs text-danger">{rupees(d.overdue)} overdue</p>}{d.onAccount > 0 && <p className="text-xs text-muted">{rupees(d.onAccount)} on account</p>}</Card>
        {AGEING_BUCKETS.map((b) => <Card key={b} className="px-4 py-3"><p className="text-xs text-muted">{b} days</p><p className="text-lg font-semibold">{rupees(d.ageing[b])}</p></Card>)}
      </div>
      {d.openInvoices.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="Unpaid invoices" />
          <Table minWidth={620}>
            <THead><tr><Th>Invoice</Th><Th>Date</Th><Th>Due date</Th><Th className="text-right">Total</Th><Th className="text-right">Due</Th><Th>Status</Th></tr></THead>
            <tbody>{d.openInvoices.map((i) => <Tr key={i.id}><Td><Link className="font-mono text-sm text-teal-700 hover:underline" href={`/app/invoices/${i.id}`}>{i.number}</Link></Td><Td>{formatDate(i.date)}</Td><Td>{formatDate(i.dueDate)}</Td><Td className="num">{rupees(i.total)}</Td><Td className="num font-semibold">{rupees(i.due)}</Td><Td><PaymentBadge status={i.status} /></Td></Tr>)}</tbody>
          </Table>
        </Card>
      )}
      <Card className="overflow-hidden">
        <CardHeader title="Statement" actions={<div className="flex gap-2"><input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm" /><input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm" /></div>} />
        <Table minWidth={760}>
          <THead><tr><Th>Date</Th><Th>Document</Th><Th>Particulars</Th><Th className="text-right">Debit</Th><Th className="text-right">Credit</Th><Th className="text-right">Balance</Th></tr></THead>
          <tbody>
            <Tr className="bg-canvas"><Td colSpan={5} className="font-medium">Opening balance{from ? ` on ${formatDate(from)}` : ''}</Td><Td className="num font-semibold">{rupees(d.opening)}</Td></Tr>
            {d.rows.length === 0 && <EmptyRow cols={6}>No entries in this period.</EmptyRow>}
            {d.rows.map((e) => {
              const h = href(e);
              return (
                <Tr key={`${e.type}-${e.id}`} className={e.type === 'CANCELLED_INVOICE' ? 'text-muted' : ''}>
                  <Td>{formatDate(e.date)}</Td>
                  <Td className="text-sm">{KIND[e.type]} {h ? <a className="font-mono text-teal-700 hover:underline" href={h}>{e.number}</a> : <span className="font-mono">{e.number}</span>}</Td>
                  <Td className="text-sm">{e.narration}</Td>
                  <Td className="num">{e.debit ? rupees(e.debit) : ''}</Td>
                  <Td className="num text-ok">{e.credit ? rupees(e.credit) : ''}</Td>
                  <Td className="num font-semibold">{rupees(e.balance)}</Td>
                </Tr>
              );
            })}
            <Tr className="bg-canvas"><Td colSpan={5} className="font-medium">Closing balance</Td><Td className="num font-semibold">{rupees(d.closing)}</Td></Tr>
          </tbody>
        </Table>
      </Card>
      {pay && <RecordPaymentDialog customerId={customerId} onClose={() => setPay(false)} />}
    </div>
  );
}
