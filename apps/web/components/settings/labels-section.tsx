'use client';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fieldErrors } from '@/lib/errors';
import { trpc } from '@/lib/trpc';
import { SectionForm, useFormState } from './section-form';
import type { Settings } from './types';

export function LabelsSection({ s }: { s: Settings }) {
  const utils = trpc.useUtils();
  const f = useFormState({ labelSizes: s.labelSizes });
  const save = trpc.settings.updateLabels.useMutation({ onSuccess: (d) => { utils.settings.get.setData(undefined, d); f.setDirty(false); } });
  const fe = fieldErrors(save.error);
  const rows = f.values!.labelSizes;
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => f.set('labelSizes', rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const cell = 'h-9 rounded-md border border-line px-2 text-sm';
  return (
    <SectionForm title="Label printing" description="Sizes offered when printing barcode labels (thermal rolls or A4 sticker sheets)."
      onSubmit={() => save.mutate({ labelSizes: rows })} saving={save.isPending} saved={save.isSuccess} dirty={f.dirty} error={save.error}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr><th className="py-1 font-medium">Name</th><th className="font-medium">Width mm</th><th className="font-medium">Height mm</th><th className="font-medium">Labels per sheet</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1 pr-2"><input aria-label="Label name" className={`${cell} w-full`} value={r.name} onChange={(e) => update(i, { name: e.target.value })} /></td>
                <td className="pr-2"><input aria-label="Width in mm" type="number" step="0.1" className={`${cell} w-24`} value={r.widthMm} onChange={(e) => update(i, { widthMm: Number(e.target.value) })} /></td>
                <td className="pr-2"><input aria-label="Height in mm" type="number" step="0.1" className={`${cell} w-24`} value={r.heightMm} onChange={(e) => update(i, { heightMm: Number(e.target.value) })} /></td>
                <td className="pr-2"><input aria-label="Labels per sheet" type="number" className={`${cell} w-24`} value={r.perSheet} onChange={(e) => update(i, { perSheet: Number(e.target.value) })} /></td>
                <td><button type="button" aria-label={`Remove ${r.name}`} className="rounded p-1.5 text-muted hover:bg-danger-50 hover:text-danger" onClick={() => f.set('labelSizes', rows.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fe.labelSizes && <p className="text-xs text-danger">{fe.labelSizes}</p>}
      <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => f.set('labelSizes', [...rows, { name: 'New size', widthMm: 50, heightMm: 25, perSheet: 1 }])}><Plus className="size-4" aria-hidden /> Add size</Button>
    </SectionForm>
  );
}
