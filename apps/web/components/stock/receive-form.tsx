'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { istDateString, formatDate } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { SelectField, TextField } from '@/components/ui/field';
import { Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { ScanField, type ScanFieldHandle } from '@/components/scan/scan-field';
import { MapBarcodeDialog } from '@/components/stock/map-barcode-dialog';
import { cn } from '@/lib/cn';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { scanError, scanOk, scanWarn } from '@/lib/feedback';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { VariantPicker, type VariantChoice } from './variant-picker';

interface Line extends VariantChoice { key: string; batchNo: string; expiryDate: string; serials: string; qty: string; rate: string }

const serialList = (s: string) => s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
let keySeq = 0;

export function ReceiveForm() {
  const params = useSearchParams();
  const router = useRouter();
  const opening = params.get('opening') === '1';
  const { can } = useMe();
  const canRate = can('VIEW_PRICES_MARGINS') || (!opening && can('CREATE_PURCHASE_ORDERS'));
  const utils = trpc.useUtils();
  const suppliers = trpc.suppliers.list.useQuery(undefined, { enabled: !opening });
  const locations = trpc.inventory.locations.useQuery();
  const [head, setHead] = useState({ supplierId: '', date: istDateString(), supplierInvoiceNo: '', supplierInvoiceDate: '', locationId: '', note: '' });
  const [lines, setLinesState] = useState<Line[]>([]);
  // Scanners fire faster than React re-renders: keep the latest lines in a ref and process
  // scans strictly one after another, so repeated scans add to the same line.
  const linesRef = useRef<Line[]>([]);
  const setLines = (next: Line[] | ((ls: Line[]) => Line[])) => {
    linesRef.current = typeof next === 'function' ? next(linesRef.current) : next;
    setLinesState(linesRef.current);
  };
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const scan = useRef<ScanFieldHandle>(null);

  const grn = trpc.inventory.createGrn.useMutation();
  const open = trpc.inventory.createOpening.useMutation();
  const m = opening ? open : grn;
  const fe = fieldErrors(m.error);

  function addLine(v: VariantChoice, extra: Partial<Line> = {}) {
    setLines((ls) => [...ls, { ...v, key: String(++keySeq), batchNo: '', expiryDate: '', serials: '', qty: '1', rate: '', ...extra }]);
  }
  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const onScan = (code: string) => { queue.current = queue.current.then(() => handleScan(code)); return queue.current; };

  /** Scan to receive: GS1 box codes fill batch, expiry and serial; scanning again adds a unit. */
  async function handleScan(code: string) {
    setMsg(null);
    const r = await utils.scan.resolve.fetch({ code }).catch(() => null);
    if (!r || !r.found) { scanError(); setUnknown(code); setMsg({ tone: 'danger', text: `Unknown barcode ${code}` }); return; }
    const batchNo = r.parsed?.batch?.toUpperCase() ?? '';
    const expiryDate = r.parsed?.expiry ?? '';
    const serial = r.parsed?.serial?.toUpperCase() ?? '';
    if (expiryDate && expiryDate < istDateString()) { scanError(); setMsg({ tone: 'danger', text: `${r.product.name} batch ${batchNo} expired on ${formatDate(expiryDate)}. Do not accept.` }); return; }
    const existing = linesRef.current.find((l) => l.variantId === r.variant.id && (l.batchNo === batchNo || (!batchNo && !l.batchNo)));
    if (existing) {
      const ss = serialList(existing.serials);
      if (serial && ss.includes(serial)) { scanWarn(); setMsg({ tone: 'warn', text: `Serial ${serial} already scanned` }); return; }
      update(existing.key, { qty: String(Number(existing.qty || 0) + 1), serials: serial ? [...ss, serial].join('\n') : existing.serials });
    } else {
      addLine({ variantId: r.variant.id, productId: r.product.id, productName: r.product.name, label: r.variant.label, sku: r.variant.sku, trackSerial: r.product.trackSerial, trackBatch: r.product.trackBatch, trackExpiry: r.product.trackExpiry }, { batchNo, expiryDate, serials: serial });
    }
    scanOk();
    setMsg({ tone: 'ok', text: `${r.product.name} ${r.variant.label ?? ''}${batchNo ? ` · batch ${batchNo}` : ''}${serial ? ` · ${serial}` : ''}` });
  }

  function submit() {
    const payload = lines.map((l) => ({ variantId: l.variantId, batchNo: l.batchNo, expiryDate: l.expiryDate, serialNos: serialList(l.serials), qty: Number(l.qty), rate: canRate ? l.rate : undefined }));
    const common = { date: head.date, locationId: head.locationId || undefined, note: head.note };
    const done = (r: { id: string }) => { void utils.inventory.invalidate(); router.push(`/app/stock/receipts/${r.id}?new=1`); };
    if (opening) open.mutate({ ...common, lines: payload as never }, { onSuccess: done });
    else grn.mutate({ ...common, supplierId: head.supplierId, supplierInvoiceNo: head.supplierInvoiceNo, supplierInvoiceDate: head.supplierInvoiceDate, lines: payload as never }, { onSuccess: done });
  }

  const totalUnits = lines.reduce((t, l) => t + (Number(l.qty) || 0), 0);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={opening ? 'Opening stock' : 'Receive goods (GRN)'}
        description={opening ? 'Enter what is on the shelf today. Use this once when you start, or for stock that has no purchase record.' : 'Scan the boxes as they arrive: GS1 codes fill in the batch, expiry and serial automatically.'}
        actions={<Link href={opening ? '/app/stock/receive' : '/app/stock/receive?opening=1'} className="text-sm text-teal-700 hover:underline">{opening ? 'Switch to goods received' : 'Enter opening stock instead'}</Link>} />

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-3">
          {!opening && (
            <SelectField label="Supplier" value={head.supplierId} onChange={(e) => setHead({ ...head, supplierId: e.target.value })} error={fe.supplierId}>
              <option value="">Choose…</option>
              {suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectField>
          )}
          <TextField label={opening ? 'As on date' : 'Received on'} type="date" value={head.date} onChange={(e) => setHead({ ...head, date: e.target.value })} error={fe.date} />
          <SelectField label="Location" value={head.locationId} onChange={(e) => setHead({ ...head, locationId: e.target.value })}>
            {locations.data?.map((l) => <option key={l.id} value={l.isDefault ? '' : l.id}>{l.name}{l.isDefault ? ' (default)' : ''}</option>)}
          </SelectField>
          {!opening && <TextField label="Supplier invoice no." value={head.supplierInvoiceNo} onChange={(e) => setHead({ ...head, supplierInvoiceNo: e.target.value })} />}
          {!opening && <TextField label="Supplier invoice date" type="date" value={head.supplierInvoiceDate} onChange={(e) => setHead({ ...head, supplierInvoiceDate: e.target.value })} />}
          <TextField label="Note (optional)" value={head.note} onChange={(e) => setHead({ ...head, note: e.target.value })} wrapperClassName={opening ? 'sm:col-span-1' : ''} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Items" description={`${lines.length} line(s), ${totalUnits} unit(s)`} />
        <CardBody className="flex flex-col gap-3">
          <ScanField ref={scan} onScan={onScan} placeholder="Scan the barcode on the box (GS1 DataMatrix, EAN or the maker's code)" />
          {msg && <Alert tone={msg.tone === 'danger' ? 'danger' : msg.tone === 'warn' ? 'warn' : 'ok'}>{msg.text}</Alert>}
          <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or add by hand<span className="h-px flex-1 bg-line" /></div>
          <VariantPicker onPick={(v) => addLine(v)} />
        </CardBody>
        {lines.length > 0 && (
          <Table minWidth={980}>
            <THead><tr><Th>Item</Th><Th>Batch / lot</Th><Th>Expiry</Th><Th className="w-24">Qty</Th><Th>Serial numbers</Th>{canRate && <Th className="w-32">Rate (₹)</Th>}<Th className="w-10" /></tr></THead>
            <tbody>
              {lines.map((l, i) => {
                const ss = serialList(l.serials);
                const serialOk = !l.trackSerial || ss.length === Number(l.qty);
                const err = (k: string) => fe[`lines.${i}.${k}`];
                const input = 'h-9 w-full rounded-md border border-line px-2 text-sm aria-[invalid=true]:border-danger';
                return (
                  <Tr key={l.key}>
                    <Td><div className="font-medium">{l.productName}</div><div className="text-xs text-muted">{l.label ?? l.sku}</div></Td>
                    <Td>{l.trackBatch ? <input aria-label={`Batch for line ${i + 1}`} className={cn(input, 'uppercase')} value={l.batchNo} onChange={(e) => update(l.key, { batchNo: e.target.value })} aria-invalid={!!err('batchNo')} /> : <span className="text-xs text-muted">Not tracked</span>}</Td>
                    <Td>{l.trackExpiry ? <input aria-label={`Expiry for line ${i + 1}`} type="date" className={input} value={l.expiryDate} onChange={(e) => update(l.key, { expiryDate: e.target.value })} /> : <span className="text-xs text-muted">—</span>}</Td>
                    <Td><input aria-label={`Quantity for line ${i + 1}`} type="number" min={1} className={input} value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} aria-invalid={!!err('qty')} /></Td>
                    <Td>
                      {l.trackSerial ? (
                        <>
                          <textarea aria-label={`Serial numbers for line ${i + 1}`} rows={Math.min(4, Math.max(1, ss.length))} className={cn(input, 'h-auto py-1 font-mono uppercase')} value={l.serials} onChange={(e) => update(l.key, { serials: e.target.value })} placeholder="One per line or comma-separated" />
                          <span className={cn('text-xs', serialOk ? 'text-muted' : 'text-danger')}>{ss.length} of {l.qty || 0} serials</span>
                        </>
                      ) : <span className="text-xs text-muted">Not tracked</span>}
                    </Td>
                    {canRate && <Td><input aria-label={`Rate for line ${i + 1}`} type="number" step="0.01" min={0} className={input} value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value })} placeholder="Cost" /></Td>}
                    <Td><button aria-label={`Remove line ${i + 1}`} className="rounded p-1.5 text-muted hover:bg-danger-50 hover:text-danger" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}><Trash2 className="size-4" /></button></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {m.error && <Alert>{Object.keys(fe).length && !Object.keys(fe).some((k) => k.startsWith('lines.')) ? 'Please correct the highlighted fields.' : errorMessage(m.error)}</Alert>}
      <div className="flex items-center justify-end gap-3">
        {!canRate && <span className="text-xs text-muted">Purchase rates are taken from the product cost.</span>}
        <Button size="lg" disabled={!lines.length} loading={m.isPending} onClick={submit}>{opening ? 'Save opening stock' : 'Save goods receipt'} ({totalUnits} units)</Button>
      </div>
      {unknown && <MapBarcodeDialog code={unknown} onClose={() => { setUnknown(null); scan.current?.focus(); }} onMapped={() => { const c = unknown; setUnknown(null); void onScan(c); }} />}
    </div>
  );
}
