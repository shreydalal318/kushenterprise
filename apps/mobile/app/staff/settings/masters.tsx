import { useState } from 'react';
import { fieldErrors, Note } from '@/components/admin/bits';
import { ChipEditor, SaveBar, useForm, WithSettings, type Settings } from '@/components/admin/settings-bits';
import { Alert, Card, Screen } from '@/components/ui';
import { trpc } from '@/lib/trpc';
import { Done } from '@/components/done';

export default function MastersSettings() {
  return <WithSettings title="GST rates and units">{(s) => <MastersForm s={s} />}</WithSettings>;
}

/** The choices offered on the product form. Each product keeps its own HSN code and rate. */
function MastersForm({ s }: { s: Settings }) {
  const utils = trpc.useUtils();
  const [flash, setFlash] = useState<string | null>(null);
  const f = useForm({ gstRates: s.gstRates, units: s.units });
  const save = trpc.settings.updateMasters.useMutation({ onSuccess: (d) => { utils.settings.get.setData(undefined, d); f.saved(); setFlash('GST rates and units saved ✓'); } });
  const fe = fieldErrors(save.error);
  return (
    <Screen footer={<SaveBar error={save.error} saving={save.isPending} dirty={f.dirty} onSave={() => save.mutate(f.v)} />}>
      <Done message={flash} onShown={() => setFlash(null)} />
      <Note>Choices offered when adding a product. Each product keeps its own HSN code and GST rate; check rates with your accountant.</Note>
      <Card>
        <ChipEditor label="GST rates (%)" numeric values={f.v.gstRates} format={(x) => `${x}%`} placeholder="e.g. 5" onChange={(x) => { setFlash(null); f.set('gstRates', x); }} />
        {!!fe.gstRates && <Alert>{fe.gstRates}</Alert>}
      </Card>
      <Card>
        <ChipEditor label="Units" values={f.v.units} placeholder="e.g. vial" onChange={(x) => { setFlash(null); f.set('units', x); }} />
        {!!fe.units && <Alert>{fe.units}</Alert>}
      </Card>
    </Screen>
  );
}
