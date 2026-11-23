'use client';
import { TextField } from '@/components/ui/field';
import { fieldErrors } from '@/lib/errors';
import { trpc } from '@/lib/trpc';
import { ChipList } from './chip-list';
import { SectionForm, useFormState } from './section-form';
import type { Settings } from './types';

export function InventorySection({ s }: { s: Settings }) {
  const utils = trpc.useUtils();
  const f = useFormState({ defaultReorderLevel: s.defaultReorderLevel, expiryAlertDays: s.expiryAlertDays });
  const save = trpc.settings.updateInventory.useMutation({ onSuccess: (d) => { utils.settings.get.setData(undefined, d); f.setDirty(false); } });
  const fe = fieldErrors(save.error);
  const v = f.values!;
  return (
    <SectionForm title="Inventory defaults" description="Used for low-stock and expiry alerts. Each product can override its reorder level."
      onSubmit={() => save.mutate(v)} saving={save.isPending} saved={save.isSuccess} dirty={f.dirty} error={save.error}>
      <TextField label="Default reorder level (units)" type="number" min={0} wrapperClassName="max-w-56" value={v.defaultReorderLevel} onChange={(e) => f.set('defaultReorderLevel', Number(e.target.value))} error={fe.defaultReorderLevel} />
      <ChipList label="Expiry alerts (days before expiry)" values={v.expiryAlertDays} inputType="number" placeholder="e.g. 30" format={(x) => `${x} days`} parse={Number} onChange={(x) => f.set('expiryAlertDays', x as number[])} />
      {fe.expiryAlertDays && <p className="text-xs text-danger">{fe.expiryAlertDays}</p>}
    </SectionForm>
  );
}
