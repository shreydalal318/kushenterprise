'use client';
import { Checkbox, TextAreaField, TextField } from '@/components/ui/field';
import { fieldErrors } from '@/lib/errors';
import { trpc } from '@/lib/trpc';
import { SectionForm, useFormState } from './section-form';
import type { Settings } from './types';

const COPIES = [
  ['ORIGINAL', 'Original for Recipient'],
  ['DUPLICATE', 'Duplicate for Transporter'],
  ['TRIPLICATE', 'Triplicate for Supplier'],
] as const;
type Copy = (typeof COPIES)[number][0];

export function DocumentsSection({ s }: { s: Settings }) {
  const utils = trpc.useUtils();
  const f = useFormState({
    invoiceDeclaration: s.invoiceDeclaration,
    defaultInvoiceTerms: s.defaultInvoiceTerms ?? '',
    defaultPoTerms: s.defaultPoTerms ?? '',
    proformaValidityDays: s.proformaValidityDays,
    defaultInvoiceCopies: s.defaultInvoiceCopies as Copy[],
  });
  const save = trpc.settings.updateDocuments.useMutation({ onSuccess: (d) => { utils.settings.get.setData(undefined, d); f.setDirty(false); } });
  const fe = fieldErrors(save.error);
  const v = f.values!;
  const toggleCopy = (c: Copy) =>
    f.set('defaultInvoiceCopies', v.defaultInvoiceCopies.includes(c) ? v.defaultInvoiceCopies.filter((x) => x !== c) : COPIES.map(([k]) => k).filter((k) => k === c || v.defaultInvoiceCopies.includes(k)));
  return (
    <SectionForm title="Terms & declaration" description="Default text printed on documents. Each document can still be edited before it is issued."
      onSubmit={() => save.mutate(v)} saving={save.isPending} saved={save.isSuccess} dirty={f.dirty} error={save.error}>
      <TextAreaField label="Invoice declaration" value={v.invoiceDeclaration} onChange={(e) => f.set('invoiceDeclaration', e.target.value)} error={fe.invoiceDeclaration} />
      <TextAreaField label="Default invoice terms (optional)" value={v.defaultInvoiceTerms} onChange={(e) => f.set('defaultInvoiceTerms', e.target.value)} error={fe.defaultInvoiceTerms} />
      <TextAreaField label="Default purchase order terms (optional)" value={v.defaultPoTerms} onChange={(e) => f.set('defaultPoTerms', e.target.value)} error={fe.defaultPoTerms} />
      <TextField label="Proforma valid for (days)" type="number" min={1} max={365} wrapperClassName="max-w-48" value={v.proformaValidityDays} onChange={(e) => f.set('proformaValidityDays', Number(e.target.value))} error={fe.proformaValidityDays} />
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Invoice copies printed by default</legend>
        <div className="grid gap-1 sm:grid-cols-3">
          {COPIES.map(([k, label]) => <Checkbox key={k} label={label} checked={v.defaultInvoiceCopies.includes(k)} onChange={() => toggleCopy(k)} />)}
        </div>
        {fe.defaultInvoiceCopies && <p className="text-xs text-danger">Choose at least one copy</p>}
      </fieldset>
    </SectionForm>
  );
}
