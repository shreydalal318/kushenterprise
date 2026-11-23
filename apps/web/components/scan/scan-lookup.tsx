'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { formatDate, formatDateTime } from '@kush/core';
import { Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { MapBarcodeDialog } from '@/components/stock/map-barcode-dialog';
import { cn } from '@/lib/cn';
import { scanError, scanOk, scanWarn } from '@/lib/feedback';
import { rupees } from '@/lib/format';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { ScanField, type ScanFieldHandle } from './scan-field';

type Result = RouterOutputs['scan']['resolve'];
const BAD = ['EXPIRED', 'OUT_OF_STOCK', 'SERIAL_NOT_IN_STOCK', 'INACTIVE'];
const WARN_TEXT: Record<string, string> = {
  EXPIRED: 'This batch has EXPIRED. Do not sell or use.',
  OUT_OF_STOCK: 'Out of stock: no units on hand.',
  BATCH_NOT_IN_STOCK: 'This batch is not in stock (other batches are).',
  SERIAL_NOT_IN_STOCK: 'This serial number is not in stock (already sold or returned).',
  INACTIVE: 'This item is marked inactive.',
  NEAR_EXPIRY: 'Expires within 30 days.',
};
const VIA: Record<string, string> = { barcode: 'Internal code', gs1: 'Manufacturer GS1 code', gtin: 'Manufacturer EAN/GTIN', alias: 'Linked manufacturer code', serial: 'Serial number' };

export function ScanLookup() {
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<{ at: Date; code: string; text: string; tone: 'ok' | 'warn' | 'bad' }[]>([]);
  const [mapCode, setMapCode] = useState<string | null>(null);
  const field = useRef<ScanFieldHandle>(null);

  async function onScan(code: string) {
    setBusy(true);
    const r = await utils.scan.resolve.fetch({ code }, { staleTime: 0 }).catch(() => null);
    setBusy(false);
    if (!r) { scanError(); return; }
    setResult(r);
    if (!r.found) {
      scanError();
      setHistory((h) => [{ at: new Date(), code, text: 'Unknown barcode', tone: 'bad' as const }, ...h].slice(0, 12));
      return;
    }
    const tone = r.warnings.some((w) => BAD.includes(w)) ? 'bad' : r.warnings.length ? 'warn' : 'ok';
    if (tone === 'bad') scanError(); else if (tone === 'warn') scanWarn(); else scanOk();
    setHistory((h) => [{ at: new Date(), code, text: `${r.product.name} ${r.variant.label ?? ''}`, tone } as const, ...h].slice(0, 12));
  }

  return (
    <>
      <PageHeader title="Scan" description="Scan the barcode on any box (GS1 DataMatrix, EAN, the maker's own code) or a serial number to see stock, batch and expiry. USB, Bluetooth or the camera. Unknown codes can be linked to an item here once." />
      <ScanField ref={field} onScan={onScan} busy={busy} className="mb-5" />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {!result && <Card><CardBody className="py-16 text-center text-sm text-muted">Waiting for a scan…</CardBody></Card>}
          {result && !result.found && (
            <Card className="border-danger/40">
              <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
                <XCircle className="size-10 text-danger" aria-hidden />
                <p className="text-lg font-semibold">Unknown barcode</p>
                <p className="break-all font-mono text-sm text-muted">{result.code.replace(/\x1d/g, '⟨GS⟩')}</p>
                {result.parsed && <p className="text-sm">GS1: {result.parsed.gtin && `GTIN ${result.parsed.gtin}`} {result.parsed.batch && `· batch ${result.parsed.batch}`} {result.parsed.expiry && `· exp ${formatDate(result.parsed.expiry)}`}</p>}
                <button className="mt-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" onClick={() => setMapCode(result.code)}>Link to a product…</button>
              </CardBody>
            </Card>
          )}
          {result?.found && <FoundCard r={result} />}
        </div>
        <Card className="h-fit">
          <CardHeader title="Recent scans" />
          <ul className="divide-y divide-line">
            {history.length === 0 && <li className="px-5 py-4 text-sm text-muted">None yet.</li>}
            {history.map((h, i) => (
              <li key={i} className="flex items-start gap-2 px-5 py-2.5 text-sm">
                {h.tone === 'ok' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden /> : h.tone === 'warn' ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
                <div className="min-w-0"><p className="truncate">{h.text}</p><p className="text-xs text-muted">{formatDateTime(h.at).slice(11)}</p></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {mapCode && <MapBarcodeDialog code={mapCode} onClose={() => { setMapCode(null); field.current?.focus(); }} onMapped={() => { const c = mapCode; setMapCode(null); void onScan(c); }} />}
    </>
  );
}

function FoundCard({ r }: { r: Extract<Result, { found: true }> }) {
  const bad = r.warnings.some((w) => BAD.includes(w));
  return (
    <Card className={cn(bad ? 'border-danger/50' : r.warnings.length ? 'border-warn/40' : 'border-ok/40')}>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xl font-semibold text-navy">{r.product.name}</p>
            <p className="text-lg">{r.variant.label ?? r.variant.sku}</p>
            <p className="mt-1 text-xs text-muted">{r.variant.sku} · {r.variant.barcode}{r.variant.gtin ? ` · GTIN ${r.variant.gtin}` : ''} · read via {VIA[r.via] ?? r.via} · {r.ms} ms</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold">{r.stock.total}</p>
            <p className="text-xs text-muted">{r.product.unit} on hand · MRP {rupees(r.variant.mrp)}</p>
          </div>
        </div>
        {r.warnings.map((w) => (
          <div key={w} role="alert" className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium', BAD.includes(w) ? 'bg-danger-50 text-danger' : 'bg-warn-50 text-warn')}>
            <AlertTriangle className="size-4" aria-hidden /> {WARN_TEXT[w] ?? w}
          </div>
        ))}
        {(r.batch || r.serial) && (
          <div className="grid gap-3 rounded-lg bg-aqua-50 p-3 text-sm sm:grid-cols-4">
            {r.batch && <div><p className="text-xs text-muted">Scanned batch</p><p className="font-mono font-semibold">{r.batch.batchNo}</p></div>}
            {r.batch && <div><p className="text-xs text-muted">Expiry</p><p className="font-semibold">{r.batch.expiryDate ? formatDate(r.batch.expiryDate) : '—'}</p></div>}
            {r.batch && <div><p className="text-xs text-muted">This batch on hand</p><p className="font-semibold">{r.batch.qty}</p></div>}
            {r.serial && <div><p className="text-xs text-muted">Serial</p><p className="font-mono font-semibold">{r.serial.serialNo} <Badge tone={r.serial.status === 'IN_STOCK' ? 'ok' : 'danger'}>{r.serial.status.replace(/_/g, ' ').toLowerCase()}</Badge></p></div>}
          </div>
        )}
        {r.suggested && <p className="text-sm">Pick first (FEFO): batch <strong className="font-mono">{r.suggested.batchNo}</strong>{r.suggested.expiryDate ? `, expires ${formatDate(r.suggested.expiryDate)}` : ''}.</p>}
        {r.stock.batches.length > 0 && (
          <Table minWidth={420}>
            <THead><tr><Th>Batch</Th><Th>Expiry</Th><Th>Location</Th><Th className="text-right">Qty</Th></tr></THead>
            <tbody>
              {r.stock.batches.map((b) => <Tr key={`${b.batchId}-${b.location.id}`} className={b.batchId === r.batch?.batchId ? 'bg-aqua-50' : ''}><Td className="font-mono text-sm">{b.batchNo}</Td><Td>{b.expiryDate ? formatDate(b.expiryDate) : '—'}</Td><Td className="text-sm">{b.location.name}</Td><Td className="num font-semibold">{b.qty}</Td></Tr>)}
            </tbody>
          </Table>
        )}
        <Link href={`/app/stock/product/${r.product.id}`} className="text-sm text-teal-700 hover:underline">Open stock for this product →</Link>
      </CardBody>
    </Card>
  );
}
