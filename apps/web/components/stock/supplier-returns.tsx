'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatDate, istDateString } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { trpc } from '@/lib/trpc';
import { StockTabs } from './stock-tabs';
import { VariantPicker, type VariantChoice } from './variant-picker';

interface Line extends VariantChoice { key: string; batchId: string; qty: string; serials: string[] }
let seq = 0;

export function SupplierReturns() {
  const utils = trpc.useUtils();
  const list = trpc.inventory.supplierReturns.useQuery();
  const suppliers = trpc.suppliers.list.useQuery();
  const [open, setOpen] = useState(false);
  const [head, setHead] = useState({ supplierId: '', date: istDateString(), reason: '', note: '' });
  const [lines, setLines] = useState<Line[]>([]);
  const create = trpc.inventory.returnToSupplier.useMutation({ onSuccess: () => { void utils.inventory.invalidate(); setOpen(false); setLines([]); setHead({ ...head, reason: '', note: '' }); } });
  const fe = fieldErrors(create.error);

  return (
    <>
      <PageHeader title="Stock" actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> Return to supplier</Button>} />
      <StockTabs />
      <Card className="overflow-hidden">
        <Table minWidth={640}>
          <THead><tr><Th>Debit note</Th><Th>Date</Th><Th>Supplier</Th><Th>Reason</Th><Th className="text-right">Units</Th></tr></THead>
          <tbody>
            {list.data?.length === 0 && <EmptyRow cols={5}>No returns yet.</EmptyRow>}
            {list.data?.map((r) => <Tr key={r.id}><Td className="font-mono text-sm">{r.number}</Td><Td>{formatDate(r.date)}</Td><Td>{r.supplier}</Td><Td className="text-sm">{r.reason}</Td><Td className="num font-semibold">{r.units}</Td></Tr>)}
          </tbody>
        </Table>
      </Card>
      <Dialog open={open} onClose={() => setOpen(false)} title="Return goods to supplier" size="xl"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" loading={create.isPending} disabled={!lines.length}
          onClick={() => create.mutate({ ...head, lines: lines.map((l) => ({ variantId: l.variantId, batchId: l.batchId, qty: Number(l.qty), serialNos: l.serials })) })}>Return {lines.reduce((t, l) => t + (Number(l.qty) || 0), 0)} unit(s)</Button></>}>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField label="Supplier" value={head.supplierId} onChange={(e) => setHead({ ...head, supplierId: e.target.value })} error={fe.supplierId}>
              <option value="">Choose…</option>
              {suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectField>
            <TextField label="Date" type="date" value={head.date} onChange={(e) => setHead({ ...head, date: e.target.value })} />
            <TextField label="Reason" placeholder="Damaged in transit, near expiry…" value={head.reason} onChange={(e) => setHead({ ...head, reason: e.target.value })} error={fe.reason} />
          </div>
          <VariantPicker onPick={(v) => setLines([...lines, { ...v, key: String(++seq), batchId: '', qty: '1', serials: [] }])} />
          {lines.map((l) => <ReturnLine key={l.key} line={l} onChange={(p) => setLines(lines.map((x) => (x.key === l.key ? { ...x, ...p } : x)))} onRemove={() => setLines(lines.filter((x) => x.key !== l.key))} />)}
          {create.error && <Alert>{Object.keys(fe).length && !Object.keys(fe).some((k) => k.startsWith('lines')) ? 'Please correct the highlighted fields.' : errorMessage(create.error)}</Alert>}
        </div>
      </Dialog>
    </>
  );
}

function ReturnLine({ line, onChange, onRemove }: { line: Line; onChange: (p: Partial<Line>) => void; onRemove: () => void }) {
  const ps = trpc.inventory.productStock.useQuery({ productId: line.productId });
  const batches = ps.data?.variants.find((v) => v.id === line.variantId)?.batches ?? [];
  const batch = batches.find((b) => b.batchId === line.batchId);
  return (
    <Card>
      <CardHeader title={`${line.productName} ${line.label ?? ''}`} actions={<button aria-label="Remove line" onClick={onRemove} className="rounded p-1.5 text-muted hover:bg-danger-50 hover:text-danger"><Trash2 className="size-4" /></button>} />
      <CardBody className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <SelectField label="Batch" value={line.batchId} onChange={(e) => onChange({ batchId: e.target.value, serials: [] })}>
          <option value="">Choose…</option>
          {batches.map((b) => <option key={b.batchId} value={b.batchId}>{b.batchNo} · {b.qty} on hand{b.expiryDate ? ` · exp ${formatDate(b.expiryDate)}` : ''}</option>)}
        </SelectField>
        <TextField label="Quantity" type="number" min={1} max={batch?.qty} value={line.qty} onChange={(e) => onChange({ qty: e.target.value })} />
        {line.trackSerial && batch && (
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {batch.serials.map((s) => (
              <label key={s} className={cn('cursor-pointer rounded-full border px-3 py-1 font-mono text-xs', line.serials.includes(s) ? 'border-teal bg-aqua-100' : 'border-line')}>
                <input type="checkbox" className="sr-only" checked={line.serials.includes(s)} onChange={() => { const ss = line.serials.includes(s) ? line.serials.filter((x) => x !== s) : [...line.serials, s]; onChange({ serials: ss, qty: String(ss.length) }); }} />{s}
              </label>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
