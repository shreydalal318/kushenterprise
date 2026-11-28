import { useState } from 'react';
import { fieldErrors, Input, Note } from '@/components/admin/bits';
import { StatePicker } from '@/components/admin/pickers';
import { SaveBar, useForm, WithSettings, type Settings } from '@/components/admin/settings-bits';
import { Alert, Card, H2, Screen } from '@/components/ui';
import { trpc } from '@/lib/trpc';
import { Done } from '@/components/done';

export default function CompanySettings() {
  return <WithSettings title="Company details">{(s) => <CompanyForm s={s} />}</WithSettings>;
}

/** Printed on every invoice, proforma and purchase order. The state decides CGST + SGST or IGST. */
function CompanyForm({ s }: { s: Settings }) {
  const utils = trpc.useUtils();
  const [flash, setFlash] = useState<string | null>(null);
  const f = useForm({
    legalName: s.legalName, addressLine1: s.addressLine1, addressLine2: s.addressLine2 ?? '', city: s.city, pincode: s.pincode,
    stateCode: s.stateCode, phone: s.phone ?? '', email: s.email ?? '', gstin: s.gstin, pan: s.pan, drugLicenceNo: s.drugLicenceNo, jurisdictionCity: s.jurisdictionCity,
  });
  const save = trpc.settings.updateCompany.useMutation({ onSuccess: (d) => { utils.settings.get.setData(undefined, d); f.saved(); setFlash('Company details saved ✓ New documents will show them.'); } });
  const fe = fieldErrors(save.error);
  const v = f.v;
  const text = (k: keyof typeof v, label: string, extra: Partial<Parameters<typeof Input>[0]> = {}) => (
    <Input label={label} value={v[k]} onChangeText={(x) => { setFlash(null); f.set(k, x); }} error={fe[k]} {...extra} />
  );
  return (
    <Screen footer={<SaveBar error={save.error} saving={save.isPending} dirty={f.dirty} onSave={() => save.mutate(v)} />}>
      <Done message={flash} onShown={() => setFlash(null)} />
      <Note>Printed on every invoice, proforma and purchase order. The state decides CGST + SGST (same state) or IGST (another state).</Note>
      <Card>
        <H2>Name and address</H2>
        {text('legalName', 'Legal name', { maxLength: 150 })}
        {text('addressLine1', 'Address line 1', { maxLength: 200 })}
        {text('addressLine2', 'Address line 2 (optional)', { maxLength: 200 })}
        {text('city', 'City', { maxLength: 80 })}
        {text('pincode', 'PIN code', { keyboardType: 'number-pad', maxLength: 10 })}
        <StatePicker withUnset value={v.stateCode} onChange={(x) => { setFlash(null); f.set('stateCode', x); }} error={fe.stateCode} />
        {text('jurisdictionCity', 'Jurisdiction city', { hint: 'Printed as “Subject to … jurisdiction”.', maxLength: 80 })}
      </Card>
      <Card>
        <H2>Tax and licence</H2>
        {text('gstin', 'GSTIN', { autoCapitalize: 'characters', hint: 'Checked against the GST check digit, the state and the PAN.', maxLength: 20 })}
        {text('pan', 'PAN', { autoCapitalize: 'characters', maxLength: 12 })}
        {text('drugLicenceNo', 'Drug licence no.', { maxLength: 100 })}
      </Card>
      <Card>
        <H2>Contact</H2>
        {text('phone', 'Phone (optional)', { keyboardType: 'phone-pad', maxLength: 40 })}
        {text('email', 'Email (optional)', { keyboardType: 'email-address', autoCapitalize: 'none', maxLength: 200 })}
      </Card>
    </Screen>
  );
}
