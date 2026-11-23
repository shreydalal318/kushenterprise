'use client';
import { TextField, SelectField } from '@/components/ui/field';
import { fieldErrors } from '@/lib/errors';
import { trpc } from '@/lib/trpc';
import { SectionForm, useFormState } from './section-form';
import type { Settings } from './types';

export function CompanySection({ s }: { s: Settings }) {
  const utils = trpc.useUtils();
  const states = trpc.settings.states.useQuery();
  const f = useFormState({
    legalName: s.legalName, addressLine1: s.addressLine1, addressLine2: s.addressLine2 ?? '', city: s.city, pincode: s.pincode,
    stateCode: s.stateCode, phone: s.phone ?? '', email: s.email ?? '', gstin: s.gstin, pan: s.pan,
    drugLicenceNo: s.drugLicenceNo, jurisdictionCity: s.jurisdictionCity,
  });
  const save = trpc.settings.updateCompany.useMutation({ onSuccess: (d) => { utils.settings.get.setData(undefined, d); f.setDirty(false); } });
  const fe = fieldErrors(save.error);
  const v = f.values!;
  const text = (k: keyof typeof v, label: string, extra: Record<string, unknown> = {}) => (
    <TextField label={label} value={v[k]} onChange={(e) => f.set(k, e.target.value)} error={fe[k]} {...extra} />
  );

  return (
    <SectionForm
      title="Company profile"
      description="Printed on every invoice, proforma and purchase order. The state decides CGST + SGST (same state) or IGST (other state)."
      onSubmit={() => save.mutate(v)} saving={save.isPending} saved={save.isSuccess} dirty={f.dirty} error={save.error}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {text('legalName', 'Legal name')}
        {text('drugLicenceNo', 'Drug licence no.')}
        {text('addressLine1', 'Address line 1', { wrapperClassName: 'sm:col-span-2' })}
        {text('addressLine2', 'Address line 2 (optional)', { wrapperClassName: 'sm:col-span-2' })}
        {text('city', 'City')}
        {text('pincode', 'PIN code', { inputMode: 'numeric' })}
        <SelectField label="State" value={v.stateCode} onChange={(e) => f.set('stateCode', e.target.value)} error={fe.stateCode}>
          <option value="XX">[State & Code] (not set)</option>
          {states.data?.map((st) => <option key={st.code} value={st.code}>{st.name} ({st.code})</option>)}
        </SelectField>
        {text('jurisdictionCity', 'Jurisdiction city', { hint: 'Printed as "Subject to … jurisdiction"' })}
        {text('gstin', 'GSTIN', { className: 'uppercase', hint: 'Checked against the GST check digit, state and PAN' })}
        {text('pan', 'PAN', { className: 'uppercase' })}
        {text('phone', 'Phone (optional)', { type: 'tel' })}
        {text('email', 'Email (optional)', { type: 'email' })}
      </div>
    </SectionForm>
  );
}
