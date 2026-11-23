'use client';
import { useState } from 'react';
import { ADJUSTMENT_REASON_LABELS, ADJUSTMENT_REASONS, formatDate, type AdjustmentReason } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type Variant = RouterOutputs['inventory']['productStock']['variants'][number];

/** Add or remove stock with a required reason. Removing needs the batch (and serials, if tracked). */
export function AdjustDialog({ variant, batchId: presetBatch, productName, trackSerial, trackBatch, trackExpiry, onClose }: {
  productId: string; variant: Variant; batchId?: string; productName: string; trackSerial: boolean; trackBatch: boolean; trackExpiry: boolean; onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [dir, setDir] = useState<'remove' | 'add'>('remove');
  const [batchId, setBatchId] = useState(presetBatch ?? variant.batches[0]?.batchId ?? '');
  const [newBatch, setNewBatch] = useState({ batchNo: '', expiryDate: '' });
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState<AdjustmentReason | ''>('');
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [serialText, setSerialText] = useState('');
  const adjust = trpc.inventory.adjust.useMutation({ onSuccess: async () => { await utils.inventory.invalidate(); onClose(); } });
  const fe = fieldErrors(adjust.error);
  const batch = variant.batches.find((b) => b.batchId === batchId);
  const n = Number(qty) || 0;
  const serials = dir === 'remove' ? picked : serialText.split(/[\s,;]+/).filter(Boolean);
  const useNewBatch = dir === 'add' && batchId === '__new';

  function submit() {
    adjust.mutate({
      variantId: variant.id,
      batchId: useNewBatch ? undefined : batchId || undefined,
      batchNo: useNewBatch ? newBatch.batchNo : undefined,
      expiryDate: useNewBatch ? newBatch.expiryDate : undefined,
      locationId: batch?.location.id,
      qty: dir === 'remove' ? -n : n,
      reason: reason as AdjustmentReason,
      note,
      serialNos: trackSerial ? serials : [],
    });
  }

  return (
    <Dialog open onClose={onClose} title="Adjust stock" description={`${productName} ${variant.label ?? ''}`} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={dir === 'remove' ? 'danger' : 'primary'} loading={adjust.isPending} disabled={!reason || n < 1 || (trackSerial && serials.length !== n)} onClick={submit}>{dir === 'remove' ? `Remove ${n}` : `Add ${n}`}</Button></>}>
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 gap-1 rounded-lg bg-canvas p-1">
          {(['remove', 'add'] as const).map((d) => (
            <button key={d} role="radio" aria-checked={dir === d} onClick={() => { setDir(d); setPicked([]); if (d === 'add' && !variant.batches.length) setBatchId('__new'); }} className={cn('h-9 rounded-md text-sm font-medium', dir === d ? 'bg-white shadow-sm' : 'text-muted')}>
              {d === 'remove' ? 'Remove stock' : 'Add stock'}
            </button>
          ))}
        </div>
        <SelectField label="Batch" value={batchId} onChange={(e) => { setBatchId(e.target.value); setPicked([]); }} error={fe.batchId}>
          {variant.batches.map((b) => <option key={`${b.batchId}-${b.location.id}`} value={b.batchId}>{b.batchNo} · {b.qty} on hand{b.expiryDate ? ` · exp ${formatDate(b.expiryDate)}` : ''}{b.expired ? ' (expired)' : ''}</option>)}
          {dir === 'add' && <option value="__new">+ A batch not listed</option>}
        </SelectField>
        {useNewBatch && (
          <div className="grid grid-cols-2 gap-3">
            {trackBatch && <TextField label="Batch / lot no." className="uppercase" value={newBatch.batchNo} onChange={(e) => setNewBatch({ ...newBatch, batchNo: e.target.value })} />}
            {trackExpiry && <TextField label="Expiry" type="date" value={newBatch.expiryDate} onChange={(e) => setNewBatch({ ...newBatch, expiryDate: e.target.value })} />}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Quantity" type="number" min={1} max={dir === 'remove' ? batch?.qty : undefined} value={qty} onChange={(e) => setQty(e.target.value)} error={fe.qty} />
          <SelectField label="Reason" value={reason} onChange={(e) => setReason(e.target.value as AdjustmentReason)} error={fe.reason}>
            <option value="">Choose…</option>
            {ADJUSTMENT_REASONS.map((r) => <option key={r} value={r}>{ADJUSTMENT_REASON_LABELS[r]}</option>)}
          </SelectField>
        </div>
        {trackSerial && dir === 'remove' && batch && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Which units? ({picked.length} of {n})</legend>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {batch.serials.map((s) => (
                <label key={s} className={cn('cursor-pointer rounded-full border px-3 py-1 font-mono text-xs', picked.includes(s) ? 'border-teal bg-aqua-100' : 'border-line')}>
                  <input type="checkbox" className="sr-only" checked={picked.includes(s)} onChange={() => setPicked(picked.includes(s) ? picked.filter((x) => x !== s) : [...picked, s])} />{s}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {trackSerial && dir === 'add' && <TextAreaField label={`Serial numbers (${serials.length} of ${n})`} className="font-mono uppercase" value={serialText} onChange={(e) => setSerialText(e.target.value)} />}
        <TextAreaField label="Note" placeholder="What happened? (kept in the stock ledger)" value={note} onChange={(e) => setNote(e.target.value)} />
        {adjust.error && !Object.keys(fe).length && <Alert>{errorMessage(adjust.error)}</Alert>}
      </div>
    </Dialog>
  );
}
