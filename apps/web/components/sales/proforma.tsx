'use client';
import { ShareButton } from '@/components/sales/share-button';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Receipt } from 'lucide-react';
import { formatDate, istDateString } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, PageHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/field';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyRow, LoadingRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { rupees } from '@/lib/format';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { DocViewer } from './doc-viewer';

const TONE: Record<string, 'neutral' | 'teal' | 'ok' | 'danger' | 'warn'> = { DRAFT: 'neutral', SENT: 'teal', CONVERTED: 'ok', EXPIRED: 'warn', CANCELLED: 'danger' };

export function ProformaList() {
  const { can } = useMe();
  const list = trpc.proformas.list.useQuery();
  return (
    <>
      <PageHeader title="Proforma invoices" description="Quotations / advance invoices. Convert to a tax invoice in one click." actions={can('CREATE_PROFORMA') && <LinkButton href="/app/proforma/new"><Plus className="size-4" aria-hidden /> New proforma</LinkButton>} />
      <Card className="overflow-hidden">
        <Table minWidth={720}>
          <THead><tr><Th>Proforma</Th><Th>Date</Th><Th>Customer</Th><Th>Valid until</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></THead>
          <tbody>
            {!list.data && <LoadingRow cols={6} error={list.error} />}{list.data?.length === 0 && <EmptyRow cols={6}>No proformas yet.</EmptyRow>}
            {list.data?.map((p) => (
              <Tr key={p.id} className="hover:bg-aqua-50/60">
                <Td><Link href={`/app/proforma/${p.id}`} className="font-mono text-sm font-medium text-navy hover:underline">{p.number}</Link></Td>
                <Td>{formatDate(p.date)}</Td><Td>{p.customer.name}</Td><Td>{formatDate(p.validUntil)}</Td>
                <Td className="num font-semibold">{rupees(p.total)}</Td>
                <Td><Badge tone={TONE[p.status] ?? 'neutral'}>{p.status.charAt(0) + p.status.slice(1).toLowerCase()}</Badge>{p.invoice && <Link className="ml-2 font-mono text-xs text-teal-700 hover:underline" href={`/app/invoices/${p.invoice.id}`}>{p.invoice.number}</Link>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

type Pf = RouterOutputs['proformas']['get'];

export function ProformaDetail({ id, isNew }: { id: string; isNew: boolean }) {
  const { can } = useMe();
  const utils = trpc.useUtils();
  const q = trpc.proformas.get.useQuery({ id });
  const [convertOpen, setConvertOpen] = useState(false);
  const markSent = trpc.proformas.markSent.useMutation({ onSuccess: () => utils.proformas.invalidate() });
  const cancel = trpc.proformas.cancel.useMutation({ onSuccess: () => utils.proformas.invalidate() });
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const p = q.data;
  const converted = p.invoice && p.invoice.status === 'ISSUED';
  return (
    <div className="flex flex-col gap-5">
      <Link href="/app/proforma" className="flex w-fit items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> All proformas</Link>
      <PageHeader title={p.number} description={<span className="flex items-center gap-2">{p.customer.name} · {formatDate(p.date)} · valid until {formatDate(p.validUntil)} <Badge tone={TONE[p.status] ?? 'neutral'}>{p.status.toLowerCase()}</Badge></span>}
        actions={<div className="flex flex-wrap gap-2">
          {!converted && p.status !== 'CANCELLED' && can('CREATE_TAX_INVOICE') && <Button onClick={() => setConvertOpen(true)}><Receipt className="size-4" aria-hidden /> Convert to tax invoice</Button>}
          {p.status !== 'CANCELLED' && <ShareButton kind="proforma" id={p.id} />}
          {p.status === 'DRAFT' && can('CREATE_PROFORMA') && <Button variant="secondary" loading={markSent.isPending} onClick={() => markSent.mutate({ id })}>Mark as sent</Button>}
          {!converted && p.status !== 'CANCELLED' && can('CREATE_PROFORMA') && <Button variant="danger" loading={cancel.isPending} onClick={() => { if (confirm('Cancel this proforma?')) cancel.mutate({ id }); }}>Cancel</Button>}
        </div>} />
      {isNew && <Alert tone="ok">Proforma saved. Share or print it below.</Alert>}
      {converted && <Alert tone="ok">Converted to tax invoice <Link className="font-mono underline" href={`/app/invoices/${p.invoice!.id}`}>{p.invoice!.number}</Link>.</Alert>}
      {cancel.error && <Alert>{errorMessage(cancel.error)}</Alert>}
      <DocViewer kind="proforma" id={p.id} />
      {convertOpen && <ConvertDialog p={p} onClose={() => setConvertOpen(false)} />}
    </div>
  );
}

/** Convert: same lines and quoted rates. Stock is FEFO; serial-tracked items need their serials picked. */
function ConvertDialog({ p, onClose }: { p: Pf; onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [date, setDate] = useState(istDateString());
  const [serials, setSerials] = useState<Record<string, string[]>>({});
  const convert = trpc.proformas.convert.useMutation({ onSuccess: async (r) => { await utils.invalidate(); router.push(`/app/invoices/${r.id}?new=1`); } });
  const serialLines = p.lines.filter((l) => l.trackSerial);
  const ready = serialLines.every((l) => (serials[l.variantId] ?? []).length === l.qty);
  return (
    <Dialog open onClose={onClose} title="Convert to tax invoice" description="Customer, quantities and quoted rates are copied as they are." size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!ready} loading={convert.isPending} onClick={() => convert.mutate({ id: p.id, date, lines: serialLines.map((l) => ({ variantId: l.variantId, serialNos: serials[l.variantId] ?? [] })) })}>Create tax invoice</Button></>}>
      <div className="flex flex-col gap-4">
        <TextField label="Invoice date" type="date" value={date} onChange={(e) => setDate(e.target.value)} wrapperClassName="max-w-48" />
        {serialLines.map((l) => <SerialPick key={l.id} line={l} value={serials[l.variantId] ?? []} onChange={(v) => setSerials({ ...serials, [l.variantId]: v })} />)}
        {serialLines.length === 0 && <p className="text-sm text-muted">Stock will be taken from the earliest-expiring batches.</p>}
        {convert.error && <Alert>{errorMessage(convert.error)}</Alert>}
      </div>
    </Dialog>
  );
}

function SerialPick({ line, value, onChange }: { line: Pf['lines'][number]; value: string[]; onChange: (v: string[]) => void }) {
  const stock = trpc.inventory.productStock.useQuery({ productId: line.productId });
  const v = stock.data?.variants.find((x) => x.id === line.variantId);
  const available = (v?.batches ?? []).filter((b) => !b.expired).flatMap((b) => b.serials);
  return (
    <fieldset className="rounded-lg border border-line p-3">
      <legend className="px-1 text-sm font-medium">{line.description} {line.label ?? ''}: pick {line.qty} serial(s) ({value.length} chosen)</legend>
      <div className="flex flex-wrap gap-1">
        {available.length === 0 && <span className="text-xs text-danger">No units in stock</span>}
        {available.map((s) => { const on = value.includes(s); return <button key={s} type="button" onClick={() => onChange(on ? value.filter((x) => x !== s) : value.length < line.qty ? [...value, s] : value)} className={cn('rounded-full border px-2 py-0.5 font-mono text-[11px]', on ? 'border-teal bg-aqua-100' : 'border-line text-muted')}>{s}</button>; })}
      </div>
    </fieldset>
  );
}
