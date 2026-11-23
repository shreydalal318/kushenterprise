'use client';
import { fieldErrors } from '@/lib/errors';
import { trpc } from '@/lib/trpc';
import { ChipList } from './chip-list';
import { SectionForm, useFormState } from './section-form';
import type { Settings } from './types';

export function MastersSection({ s }: { s: Settings }) {
  const utils = trpc.useUtils();
  const f = useFormState({ gstRates: s.gstRates as number[], units: s.units });
  const save = trpc.settings.updateMasters.useMutation({ onSuccess: (d) => { utils.settings.get.setData(undefined, d); f.setDirty(false); } });
  const fe = fieldErrors(save.error);
  const v = f.values!;
  return (
    <SectionForm title="GST rates & units" description="Choices offered in the product master. Each product stores its own HSN code and rate; confirm rates with your accountant."
      onSubmit={() => save.mutate(v)} saving={save.isPending} saved={save.isSuccess} dirty={f.dirty} error={save.error}>
      <ChipList label="GST rates (%)" values={v.gstRates} inputType="number" placeholder="e.g. 5" format={(x) => `${x}%`} parse={Number} onChange={(x) => f.set('gstRates', x as number[])} />
      {fe.gstRates && <p className="text-xs text-danger">{fe.gstRates}</p>}
      <ChipList label="Units" values={v.units} placeholder="e.g. vial" onChange={(x) => f.set('units', x as string[])} />
      {fe.units && <p className="text-xs text-danger">{fe.units}</p>}
    </SectionForm>
  );
}
