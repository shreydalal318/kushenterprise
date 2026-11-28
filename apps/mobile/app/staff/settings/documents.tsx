import { useState } from 'react';
import { Check, fieldErrors, Input, Note } from '@/components/admin/bits';
import { SaveBar, useForm, WithSettings, type Settings } from '@/components/admin/settings-bits';
import { Alert, Card, H2, Screen } from '@/components/ui';
import { trpc } from '@/lib/trpc';
import { Done } from '@/components/done';

const COPIES = [['ORIGINAL', 'Original for Recipient'], ['DUPLICATE', 'Duplicate for Transporter'], ['TRIPLICATE', 'Triplicate for Supplier']] as const;
type Copy = (typeof COPIES)[number][0];

export default function DocumentSettings() {
  return <WithSettings title="Terms and declaration">{(s) => <DocumentsForm s={s} />}</WithSettings>;
}

/** Default text printed on documents; each document can still be changed before it is issued. */
function DocumentsForm({ s }: { s: Settings }) {
  const utils = trpc.useUtils();
  const [flash, setFlash] = useState<string | null>(null);
  const f = useForm({
    invoiceDeclaration: s.invoiceDeclaration, defaultInvoiceTerms: s.defaultInvoiceTerms ?? '', defaultPoTerms: s.defaultPoTerms ?? '',
    proformaValidityDays: String(s.proformaValidityDays), defaultInvoiceCopies: s.defaultInvoiceCopies as Copy[],
  });
  const save = trpc.settings.updateDocuments.useMutation({ onSuccess: (d) => { utils.settings.get.setData(undefined, d); f.saved(); setFlash('Saved ✓ New documents will use this text.'); } });
  const fe = fieldErrors(save.error);
  const v = f.v;
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => { setFlash(null); f.set(k, x); };
  const toggle = (c: Copy) => set('defaultInvoiceCopies', v.defaultInvoiceCopies.includes(c) ? v.defaultInvoiceCopies.filter((x) => x !== c) : COPIES.map(([k]) => k).filter((k) => k === c || v.defaultInvoiceCopies.includes(k)));
  return (
    <Screen footer={<SaveBar error={save.error} saving={save.isPending} dirty={f.dirty} onSave={() => save.mutate(v)} />}>
      <Done message={flash} onShown={() => setFlash(null)} />
      <Note>Default text printed on documents. Each document can still be changed before it is issued.</Note>
      <Card>
        <Input label="Invoice declaration" multiline value={v.invoiceDeclaration} onChangeText={(x) => set('invoiceDeclaration', x)} error={fe.invoiceDeclaration} maxLength={1000} />
        <Input label="Usual invoice terms (optional)" multiline value={v.defaultInvoiceTerms} onChangeText={(x) => set('defaultInvoiceTerms', x)} error={fe.defaultInvoiceTerms} maxLength={2000} />
        <Input label="Usual purchase order terms (optional)" multiline value={v.defaultPoTerms} onChangeText={(x) => set('defaultPoTerms', x)} error={fe.defaultPoTerms} maxLength={2000} />
        <Input label="Proforma valid for (days)" keyboardType="number-pad" value={v.proformaValidityDays} onChangeText={(x) => set('proformaValidityDays', x)} error={fe.proformaValidityDays} maxLength={3} />
      </Card>
      <Card>
        <H2>Invoice copies printed</H2>
        {COPIES.map(([k, label]) => <Check key={k} label={label} value={v.defaultInvoiceCopies.includes(k)} onChange={() => toggle(k)} />)}
        {!!(fe.defaultInvoiceCopies || !v.defaultInvoiceCopies.length) && <Alert>Choose at least one copy.</Alert>}
      </Card>
    </Screen>
  );
}
