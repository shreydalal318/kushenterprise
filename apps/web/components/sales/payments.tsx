'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { AGEING_BUCKETS, formatDate, istDateString, PAYMENT_MODE_LABEL, PAYMENT_MODES, type PaymentMode } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Card, PageHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, SelectField, TextField } from '@/components/ui/field';
import { EmptyRow, LoadingRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { PaymentBadge } from './status';

export function PaymentsScreen() {
  const params = useSearchParams();
  const [tab, setTab] = useState<'payments' | 'receivables'>('payments');
  const [open, setOpen] = useState(!!params.get('customer'));
  const list = trpc.payments.list.useQuery(undefined, { enabled: tab === 'payments' });
  const rec = trpc.ledger.receivables.useQuery(undefined, { enabled: tab === 'receivables' });
  return (
    <>
      <PageHeader title="Payments" description="Money received, applied to invoices. Anything not applied stays on the customer’s account." actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> Record payment</Button>} />
      <div role="tablist" className="mb-4 flex w-fit rounded-lg bg-white p-0.5 ring-1 ring-line">
        {([['payments', 'Received'], ['receivables', 'Outstanding']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('h-9 rounded-md px-3 text-sm', tab === k ? 'bg-aqua-100 font-semibold text-navy' : 'text-muted')}>{l}</button>)}
      </div>
      <Card className="overflow-hidden">
        {tab === 'payments' ? (
          <Table minWidth={760}>
            <THead><tr><Th>Receipt</Th><Th>Date</Th><Th>Customer</Th><Th>Mode</Th><Th className="text-right">Amount</Th><Th>Applied to</Th><Th className="text-right">On account</Th></tr></THead>
            <tbody>
              {!list.data && <LoadingRow cols={7} />}{list.data?.length === 0 && <EmptyRow cols={7}>No payments yet.</EmptyRow>}
              {list.data?.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-mono text-sm">{p.number}</Td><Td>{formatDate(p.date)}</Td>
                  <Td><Link className="text-teal-700 hover:underline" href={`/app/ledger/${p.customer.id}`}>{p.customer.name}</Link></Td>
                  <Td className="text-sm">{PAYMENT_MODE_LABEL[p.mode as PaymentMode]}{p.reference ? <div className="text-xs text-muted">{p.reference}</div> : null}</Td>
                  <Td className="num font-semibold">{rupees(p.amount)}</Td>
                  <Td className="text-xs">{p.invoices.map((i) => <Link key={i.id} className="mr-2 font-mono text-teal-700 hover:underline" href={`/app/invoices/${i.id}`}>{i.number}</Link>)}</Td>
                  <Td className={cn('num', p.onAccount > 0 && 'text-warn')}>{p.onAccount ? rupees(p.onAccount) : '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Table minWidth={860}>
            <THead><tr><Th>Customer</Th><Th className="text-right">Outstanding</Th><Th className="text-right">Overdue</Th>{AGEING_BUCKETS.map((b) => <Th key={b} className="text-right">{b} days</Th>)}</tr></THead>
            <tbody>
              {!rec.data && <LoadingRow cols={7} />}{rec.data?.length === 0 && <EmptyRow cols={7}>Nothing outstanding.</EmptyRow>}
              {rec.data?.map((r) => (
                <Tr key={r.customerId}>
                  <Td><Link className="font-medium text-navy hover:underline" href={`/app/ledger/${r.customerId}`}>{r.name}</Link><div className="text-xs text-muted">{r.code}{r.creditLimit ? ` · limit ${rupees(r.creditLimit)}` : ''}</div></Td>
                  <Td className={cn('num font-semibold', r.creditLimit && r.outstanding > r.creditLimit && 'text-danger', r.outstanding < 0 && 'text-ok')}>{r.outstanding < 0 ? <>{rupees(-r.outstanding)}<div className="text-xs font-normal">advance</div></> : rupees(r.outstanding)}</Td>
                  <Td className={cn('num', r.overdue > 0 && 'text-danger')}>{r.overdue ? rupees(r.overdue) : '—'}</Td>
                  {AGEING_BUCKETS.map((b) => <Td key={b} className="num text-muted">{r.ageing[b] ? rupees(r.ageing[b]) : '—'}</Td>)}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {open && <RecordPaymentDialog onClose={() => setOpen(false)} customerId={params.get('customer') ?? ''} invoiceId={params.get('invoice')} />}
    </>
  );
}

export function RecordPaymentDialog({ onClose, customerId: initialCustomer, invoiceId }: { onClose: () => void; customerId?: string; invoiceId?: string | null }) {
  const utils = trpc.useUtils();
  const customers = trpc.sales.customers.useQuery();
  const [customerId, setCustomerId] = useState(initialCustomer ?? '');
  const ledger = trpc.ledger.customer.useQuery({ customerId }, { enabled: !!customerId });
  const [v, setV] = useState({ date: istDateString(), amount: '', mode: 'NEFT_RTGS' as PaymentMode, reference: '', note: '' });
  const [auto, setAuto] = useState(!invoiceId);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  useEffect(() => {
    const inv = ledger.data?.openInvoices.find((i) => i.id === invoiceId);
    if (inv) { setAlloc({ [inv.id]: String(inv.due) }); setV((x) => ({ ...x, amount: x.amount || String(inv.due) })); }
  }, [ledger.data, invoiceId]);
  const allocated = useMemo(() => Object.values(alloc).reduce((t, a) => t + (Number(a) || 0), 0), [alloc]);
  const record = trpc.payments.record.useMutation({ onSuccess: async () => { await utils.invalidate(); onClose(); } });
  const fe = fieldErrors(record.error);
  return (
    <Dialog open onClose={onClose} title="Record payment" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={record.isPending} onClick={() => record.mutate({ customerId, date: v.date, amount: Number(v.amount) as never, mode: v.mode, reference: v.reference, note: v.note, autoAllocate: auto, allocations: auto ? [] : Object.entries(alloc).filter(([, a]) => Number(a) > 0).map(([invoiceId, a]) => ({ invoiceId, amount: Number(a) as never })) })}>Save receipt</Button></>}>
      <div className="flex flex-col gap-4">
        <SelectField label="Customer" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setAlloc({}); }} error={fe.customerId}>
          <option value="">Choose…</option>
          {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
        </SelectField>
        {ledger.data && <p className="text-sm text-muted">Outstanding <strong className="text-ink">{rupees(ledger.data.outstanding)}</strong>{ledger.data.overdue > 0 && <> · overdue <strong className="text-danger">{rupees(ledger.data.overdue)}</strong></>}{ledger.data.onAccount > 0 && <> · on account {rupees(ledger.data.onAccount)}</>}</p>}
        <div className="grid gap-3 sm:grid-cols-4">
          <TextField label="Amount (₹)" type="number" step="0.01" min={0} value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} error={fe.amount} />
          <TextField label="Date" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
          <SelectField label="Mode" value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value as PaymentMode })}>{PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAYMENT_MODE_LABEL[m]}</option>)}</SelectField>
          <TextField label="UTR / cheque no." value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
        </div>
        <Checkbox label="Apply to the oldest invoices automatically" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        {!auto && ledger.data && (
          <Table minWidth={520}>
            <THead><tr><Th>Invoice</Th><Th>Date</Th><Th className="text-right">Due</Th><Th>Status</Th><Th className="w-32">Apply (₹)</Th></tr></THead>
            <tbody>
              {ledger.data.openInvoices.length === 0 && <EmptyRow cols={5}>No unpaid invoices. The payment will stay on account.</EmptyRow>}
              {ledger.data.openInvoices.map((i) => (
                <Tr key={i.id}>
                  <Td className="font-mono text-sm">{i.number}</Td><Td>{formatDate(i.date)}</Td><Td className="num">{rupees(i.due)}</Td><Td><PaymentBadge status={i.status} /></Td>
                  <Td><input aria-label={`Apply to ${i.number}`} type="number" step="0.01" min={0} max={i.due} value={alloc[i.id] ?? ''} onChange={(e) => setAlloc({ ...alloc, [i.id]: e.target.value })} className="h-9 w-28 rounded-md border border-line px-2 text-right text-sm" /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {!auto && <p className={cn('text-sm', allocated > Number(v.amount || 0) ? 'text-danger' : 'text-muted')}>Applied {rupees(allocated)} of {rupees(Number(v.amount || 0))}; {rupees(Math.max(0, Number(v.amount || 0) - allocated))} stays on account.</p>}
        {record.error && !Object.keys(fe).length && <Alert>{errorMessage(record.error)}</Alert>}
      </div>
    </Dialog>
  );
}
