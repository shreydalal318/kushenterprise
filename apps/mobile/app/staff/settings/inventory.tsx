import { useState } from 'react';
import { fieldErrors, Input, Note } from '@/components/admin/bits';
import { ChipEditor, SaveBar, useForm, WithSettings, type Settings } from '@/components/admin/settings-bits';
import { Alert, Card, Screen } from '@/components/ui';
import { trpc } from '@/lib/trpc';

export default function InventorySettings() {
  return <WithSettings title="Stock alerts">{(s) => <InventoryForm s={s} />}</WithSettings>;
}

/** Used for the low-stock and expiry alerts. Each product can have its own reorder level. */
function InventoryForm({ s }: { s: Settings }) {
  const utils = trpc.useUtils();
  const [flash, setFlash] = useState<string | null>(null);
  const f = useForm({ defaultReorderLevel: String(s.defaultReorderLevel), expiryAlertDays: s.expiryAlertDays });
  const save = trpc.settings.updateInventory.useMutation({ onSuccess: (d) => { utils.settings.get.setData(undefined, d); f.saved(); setFlash('Stock alerts saved ✓'); } });
  const fe = fieldErrors(save.error);
  return (
    <Screen footer={<SaveBar error={save.error} saving={save.isPending} dirty={f.dirty} onSave={() => save.mutate(f.v)} />}>
      {!!flash && <Alert tone="ok">{flash}</Alert>}
      <Note>Used for the low-stock and expiry alerts. Each product can have its own reorder level.</Note>
      <Card>
        <Input label="Usual reorder level (units)" keyboardType="number-pad" value={f.v.defaultReorderLevel} onChangeText={(x) => { setFlash(null); f.set('defaultReorderLevel', x); }}
          error={fe.defaultReorderLevel} hint="Stock at or below this counts as low." maxLength={6} />
      </Card>
      <Card>
        <ChipEditor label="Warn this many days before expiry" numeric max={5} values={f.v.expiryAlertDays} format={(x) => `${x} days`} placeholder="e.g. 30"
          onChange={(x) => { setFlash(null); f.set('expiryAlertDays', x); }} />
        {!!fe.expiryAlertDays && <Alert>{fe.expiryAlertDays}</Alert>}
      </Card>
    </Screen>
  );
}
