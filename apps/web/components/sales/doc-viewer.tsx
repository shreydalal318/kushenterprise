'use client';
import { useState } from 'react';
import { Download, ExternalLink, Printer } from 'lucide-react';
import { INVOICE_COPIES, type InvoiceCopy } from '@kush/core';
import { Card, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/cn';

const LABEL: Record<InvoiceCopy, string> = { ORIGINAL: 'Original', DUPLICATE: 'Duplicate', TRIPLICATE: 'Triplicate' };

/** Inline PDF preview with copy selection, download and print. */
export function DocViewer({ kind, id, withCopies = false, defaultCopies = ['ORIGINAL'] }: { kind: 'invoice' | 'proforma' | 'credit-note' | 'purchase-order'; id: string; withCopies?: boolean; defaultCopies?: InvoiceCopy[] }) {
  const [copies, setCopies] = useState<InvoiceCopy[]>(defaultCopies);
  const qs = `copies=${copies.join(',')}`;
  const src = `/api/documents/${kind}/${id}?${qs}`;
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Document" actions={
        <div className="flex flex-wrap items-center gap-2">
          {withCopies && INVOICE_COPIES.map((c) => (
            <label key={c} className={cn('flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs', copies.includes(c) ? 'border-teal bg-aqua-100 font-semibold' : 'border-line')}>
              <input type="checkbox" className="sr-only" checked={copies.includes(c)} onChange={() => setCopies((cs) => { const n = cs.includes(c) ? cs.filter((x) => x !== c) : INVOICE_COPIES.filter((x) => x === c || cs.includes(x)); return n.length ? n : cs; })} />{LABEL[c]}
            </label>
          ))}
          <a href={`${src}&download=1`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-aqua-50"><Download className="size-4" aria-hidden /> Download</a>
          <a href={src} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800"><Printer className="size-4" aria-hidden /> Print <ExternalLink className="size-3" aria-hidden /></a>
        </div>
      } />
      <iframe key={src} title="PDF preview" src={src} className="h-[80vh] min-h-[560px] w-full bg-canvas" />
    </Card>
  );
}
