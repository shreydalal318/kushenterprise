'use client';
import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { rupees } from '@/lib/format';
import { formatDate } from '@kush/core';

export interface ImportChange { productId: string; code: string; name: string; oldRate: number | null; newRate: number | null; validFrom: string | null; validTo: string | null; note: string | null; aboveMrp: boolean }
interface Preview { changes: ImportChange[]; errors: { rowNo: number; message: string }[]; unchanged: number; totalRows: number }

/** Export / import buttons + preview-and-confirm dialog for a price sheet. */
export function ExcelButtons({ query, canImport, onApply, applying }: {
  query: string; // "customerId=…" or "priceListId=…"
  canImport: boolean;
  onApply: (changes: ImportChange[]) => Promise<unknown>;
  applying: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function upload(f: File) {
    setBusy(true); setError(null); setDone(null);
    const body = new FormData();
    body.append('file', f);
    const res = await fetch(`/api/pricing/import?${query}`, { method: 'POST', body });
    const json = (await res.json().catch(() => ({}))) as Preview & { error?: string };
    setBusy(false);
    if (!res.ok) return setError(json.error ?? 'Import failed');
    setPreview(json);
  }
  const blocked = preview?.changes.some((c) => c.aboveMrp);

  return (
    <>
      <a href={`/api/pricing/export?${query}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:bg-aqua-50"><Download className="size-4" aria-hidden /> Export Excel</a>
      {canImport && (
        <>
          <input ref={input} type="file" accept=".xlsx" className="sr-only" aria-label="Import Excel price sheet" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
          <Button size="sm" variant="secondary" className="h-9" loading={busy} onClick={() => input.current?.click()}><Upload className="size-4" aria-hidden /> Import Excel</Button>
        </>
      )}
      {error && <span className="text-sm text-danger">{error}</span>}
      {done && <span className="text-sm text-ok">{done}</span>}
      <Dialog open={!!preview} onClose={() => setPreview(null)} size="xl" title="Review imported prices"
        description={preview && `${preview.totalRows} row(s) read: ${preview.changes.length} change(s), ${preview.unchanged} unchanged, ${preview.errors.length} problem(s).`}
        footer={<>
          <Button variant="secondary" onClick={() => setPreview(null)}>Cancel</Button>
          <Button loading={applying} disabled={!preview?.changes.length || blocked}
            onClick={async () => { const n = preview!.changes.length; await onApply(preview!.changes); setPreview(null); setDone(`${n} price change(s) saved`); }}>
            Save {preview?.changes.length ?? 0} change(s)
          </Button>
        </>}>
        {preview && (
          <div className="flex flex-col gap-4">
            {blocked && <Alert>Some rates are above MRP. Fix them in the sheet and import again.</Alert>}
            {preview.errors.length > 0 && (
              <Alert tone="warn">
                <p className="font-medium">These rows were skipped:</p>
                <ul className="mt-1 list-disc pl-5">{preview.errors.slice(0, 20).map((e, i) => <li key={i}>{e.rowNo ? `Row ${e.rowNo}: ` : ''}{e.message}</li>)}</ul>
              </Alert>
            )}
            <Table minWidth={680}>
              <THead><tr><Th>Product</Th><Th className="text-right">Now</Th><Th className="text-right">New</Th><Th>Valid</Th><Th>Note</Th></tr></THead>
              <tbody>
                {preview.changes.length === 0 && <EmptyRow cols={5}>Nothing to change.</EmptyRow>}
                {preview.changes.map((c) => (
                  <Tr key={c.productId} className={c.aboveMrp ? 'bg-danger-50' : ''}>
                    <Td><span className="font-mono text-xs">{c.code}</span> {c.name}</Td>
                    <Td className="num text-muted">{rupees(c.oldRate)}</Td>
                    <Td className="num font-medium">{c.newRate == null ? <Badge tone="danger">Remove</Badge> : rupees(c.newRate)}{c.aboveMrp && <div className="text-xs text-danger">above MRP</div>}</Td>
                    <Td className="whitespace-nowrap text-xs">{c.validFrom || c.validTo ? `${c.validFrom ? formatDate(c.validFrom) : '…'} → ${c.validTo ? formatDate(c.validTo) : '…'}` : '—'}</Td>
                    <Td className="text-xs text-muted">{c.note ?? ''}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Dialog>
    </>
  );
}
