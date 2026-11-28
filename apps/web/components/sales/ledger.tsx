'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileDown, Plus } from 'lucide-react';
import { AGEING_BUCKETS, daysUntil, drCr, tallyDate, tallyLedgerLine } from '@kush/core';
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
      <PageHeader title="Ledger Account" description={`${d.customer.name} (${d.customer.code}) · terms ${d.customer.paymentTermsDays} days${d.customer.creditLimit ? ` · credit limit ${rupees(d.customer.creditLimit)}` : ''}`}
        actions={<div className="flex gap-2">
          <a href={`/api/statement/${d.customer.id}?download=1${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold hover:bg-aqua-50"><FileDown className="size-4" aria-hidden /> Ledger PDF</a>
          {can('RECORD_PAYMENTS') && <Button onClick={() => setPay(true)}><Plus className="size-4" aria-hidden /> Record payment</Button>}
        </div>} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Card className="col-span-2 px-4 py-3"><p className="text-xs text-muted">Outstanding</p><p className={cn('text-2xl font-semibold', d.outstanding > 0 ? 'text-navy' : 'text-ok')}>{rupees(Math.abs(d.outstanding))}{d.outstanding < 0 && <span className="ml-1 text-sm font-normal">advance</span>}</p>{d.overdue > 0 && <p className="text-xs text-danger">{rupees(d.overdue)} overdue</p>}{d.onAccount > 0 && <p className="text-xs text-muted">{rupees(d.onAccount)} on account</p>}</Card>
        {AGEING_BUCKETS.map((b) => <Card key={b} className="px-4 py-3"><p className="text-xs text-muted">{b} days</p><p className="text-lg font-semibold">{rupees(d.ageing[b])}</p></Card>)}
      </div>
      {d.openInvoices.length > 0 && (
        <Card className="overflow-hidden">
          {/* Tally's bill-wise pending bills. */}
          <CardHeader title="Pending Bills" />
          <Table minWidth={720}>
            <THead><tr><Th>Date</Th><Th>Ref. No.</Th><Th className="text-right">Opening Amount</Th><Th className="text-right">Pending Amount</Th><Th>Due on</Th><Th className="text-right">Overdue by days</Th><Th>Status</Th></tr></THead>
            <tbody>{d.openInvoices.map((i) => { const late = -daysUntil(i.dueDate, d.today); return <Tr key={i.id}><Td className="whitespace-nowrap">{tallyDate(i.date)}</Td><Td><Link className="font-mono text-sm text-teal-700 hover:underline" href={`/app/invoices/${i.id}`}>{i.number}</Link></Td><Td className="num whitespace-nowrap">{rupees(i.total)} Dr</Td><Td className="num whitespace-nowrap font-semibold">{rupees(i.due)} Dr</Td><Td className="whitespace-nowrap">{tallyDate(i.dueDate)}</Td><Td className={cn('num', late > 0 && 'text-danger')}>{late > 0 ? late : ''}</Td><Td><PaymentBadge status={i.status} /></Td></Tr>; })}</tbody>
          </Table>
        </Card>
      )}
      <Card className="overflow-hidden">
        {/* Tally's ledger: To (debit) / By (credit), voucher type and number, running balance Dr / Cr. */}
        <CardHeader title="Ledger" actions={<div className="flex gap-2"><input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm" /><input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm" /></div>} />
        <Table minWidth={760}>
          <THead><tr><Th>Date</Th><Th>Particulars</Th><Th>Vch Type</Th><Th>Vch No.</Th><Th className="text-right">Debit</Th><Th className="text-right">Credit</Th><Th className="text-right">Balance</Th></tr></THead>
          <tbody>
            <Tr className="bg-canvas"><Td>{from ? tallyDate(from) : ''}</Td><Td className="font-semibold" colSpan={3}>Opening Balance</Td><Td className="num">{d.opening > 0 ? rupees(d.opening) : ''}</Td><Td className="num">{d.opening < 0 ? rupees(-d.opening) : ''}</Td><Td className="num font-semibold">{drCr(d.opening)}</Td></Tr>
            {d.rows.length === 0 && <EmptyRow cols={7}>No entries in this period.</EmptyRow>}
            {d.rows.map((e) => {
              const h = href(e);
              const t = tallyLedgerLine(e.type, e.mode);
              return (
                <Tr key={`${e.type}-${e.id}`} className={e.type === 'CANCELLED_INVOICE' ? 'text-muted' : ''}>
                  <Td className="whitespace-nowrap">{tallyDate(e.date)}</Td>
                  <Td className="text-sm">{t.particulars}{e.type !== 'INVOICE' && <div className="text-xs italic text-muted">{e.narration}</div>}</Td>
                  <Td className="text-sm">{t.vchType}</Td>
                  <Td className="text-sm">{h ? <a className="font-mono text-teal-700 hover:underline" href={h}>{e.number}</a> : <span className="font-mono">{e.number}</span>}</Td>
                  <Td className="num">{e.debit ? rupees(e.debit) : ''}</Td>
                  <Td className="num">{e.credit ? rupees(e.credit) : ''}</Td>
                  <Td className="num font-semibold whitespace-nowrap">{drCr(e.balance)}</Td>
                </Tr>
              );
            })}
            <Tr className="bg-canvas"><Td /><Td className="font-semibold" colSpan={5}>Closing Balance</Td><Td className="num font-semibold whitespace-nowrap">{drCr(d.closing)}</Td></Tr>
          </tbody>
        </Table>
      </Card>
      {pay && <RecordPaymentDialog customerId={customerId} onClose={() => setPay(false)} />}
    </div>
  );
}
