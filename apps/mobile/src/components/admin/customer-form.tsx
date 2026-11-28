import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Alert, Button, Card, H2, LinkButton, Screen } from '@/components/ui';
import { errorText } from '@/lib/format';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { fieldErrors, Input, Note, Pills, subErrors } from './bits';
import { Picker, StatePicker } from './pickers';

type Customer = RouterOutputs['customers']['get'];
type Lead = RouterOutputs['leads']['get'];
export const TYPE_LABEL = { DOCTOR: 'Doctor', HOSPITAL: 'Hospital', CLINIC: 'Clinic' } as const;
export type CustomerType = keyof typeof TYPE_LABEL;
const TYPES: [CustomerType, string][] = [['DOCTOR', 'Doctor'], ['HOSPITAL', 'Hospital'], ['CLINIC', 'Clinic']];

export interface AddressValue { label: string; line1: string; line2: string; city: string; pincode: string; stateCode: string; gstin: string }
export const emptyAddress = (stateCode = ''): AddressValue => ({ label: '', line1: '', line2: '', city: '', pincode: '', stateCode, gstin: '' });
export const addressValue = (a: { label: string | null; line1: string; line2: string | null; city: string; pincode: string; stateCode: string; gstin: string | null }): AddressValue =>
  ({ label: a.label ?? '', line1: a.line1, line2: a.line2 ?? '', city: a.city, pincode: a.pincode, stateCode: a.stateCode, gstin: a.gstin ?? '' });

/** Address boxes. `full` adds the label ("Main OT") and a branch GSTIN, as on the website's address dialog. */
export function AddressFields({ value, onChange, errors = {}, full = false }: { value: AddressValue; onChange: (v: AddressValue) => void; errors?: Record<string, string>; full?: boolean }) {
  const t = (k: keyof AddressValue) => (x: string) => onChange({ ...value, [k]: x });
  return (
    <View style={{ gap: 12 }}>
      {full && <Input label="Label (optional)" placeholder="Main OT, Pharmacy…" value={value.label} onChangeText={t('label')} maxLength={60} />}
      <Input label="Address line 1" value={value.line1} onChangeText={t('line1')} error={errors.line1} maxLength={200} />
      <Input label="Address line 2 (optional)" value={value.line2} onChangeText={t('line2')} maxLength={200} />
      <Input label="City" value={value.city} onChangeText={t('city')} error={errors.city} maxLength={80} />
      <Input label="PIN code" keyboardType="number-pad" value={value.pincode} onChangeText={t('pincode')} error={errors.pincode} maxLength={6} />
      <StatePicker value={value.stateCode} onChange={t('stateCode')} error={errors.stateCode} />
      {full && <Input label="Branch GSTIN (optional)" autoCapitalize="characters" value={value.gstin} onChangeText={t('gstin')} error={errors.gstin} maxLength={15} />}
    </View>
  );
}

/**
 * New customer or edit one: the same fields and checks as the website's customer form. A website
 * enquiry (`lead`) fills in what it knows and is marked converted when the customer is saved.
 */
export function CustomerForm({ customer, presetParentId, presetType, lead, onSaved, onBack, children }: {
  customer?: Customer; presetParentId?: string; presetType?: CustomerType; lead?: Lead | null;
  onSaved: (r: { id: string; created: boolean }) => void; onBack?: () => void; children?: ReactNode;
}) {
  const utils = trpc.useUtils();
  const staff = trpc.customers.staffOptions.useQuery();
  const parents = trpc.customers.options.useQuery({ types: ['HOSPITAL', 'CLINIC'] });
  const [v, setV] = useState({
    type: (customer?.type ?? lead?.type ?? presetType ?? (presetParentId ? 'DOCTOR' : 'HOSPITAL')) as CustomerType,
    name: customer?.name ?? (lead ? lead.organisation || lead.name : ''),
    contactPerson: customer?.contactPerson ?? (lead?.organisation ? lead.name : ''),
    mobile: customer?.mobile ?? lead?.mobile ?? '', email: customer?.email ?? lead?.email ?? '',
    stateCode: customer?.stateCode ?? '', gstin: customer?.gstin ?? '', pan: customer?.pan ?? '', drugLicenceNo: customer?.drugLicenceNo ?? '',
    creditLimit: customer?.creditLimit == null ? '' : String(customer.creditLimit), paymentTermsDays: String(customer?.paymentTermsDays ?? 30),
    assignedEmployeeId: customer?.assignedEmployeeId ?? '', parentId: customer?.parentId ?? presetParentId ?? '',
    notes: customer?.notes ?? (lead ? `From website enquiry: ${lead.notes ? `${lead.notes}. ` : ''}` : ''),
  });
  const [billing, setBilling] = useState<AddressValue>({ ...emptyAddress(), ...(lead?.city ? { city: lead.city } : {}) });
  const done = async (id: string, created: boolean) => {
    await Promise.all([utils.customers.list.invalidate(), utils.customers.get.invalidate({ id }), utils.customers.options.invalidate(), lead ? utils.leads.invalidate() : null]);
    onSaved({ id, created });
  };
  const create = trpc.customers.create.useMutation({ onSuccess: (c) => done(c.id, true) });
  const update = trpc.customers.update.useMutation({ onSuccess: (c) => done(c.id, false) });
  const m = customer ? update : create;
  const fe = fieldErrors(m.error);
  const set = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x });
  const doctor = v.type === 'DOCTOR';

  function submit() {
    const base = {
      type: v.type, name: v.name, contactPerson: v.contactPerson, mobile: v.mobile, email: v.email, stateCode: v.stateCode,
      gstin: v.gstin, pan: v.pan, drugLicenceNo: v.drugLicenceNo, creditLimit: v.creditLimit.trim() || null, paymentTermsDays: v.paymentTermsDays.trim() || '30',
      assignedEmployeeId: v.assignedEmployeeId || null, parentId: doctor ? v.parentId || null : null, notes: v.notes,
    };
    if (customer) update.mutate({ id: customer.id, ...base });
    else create.mutate({ ...base, billingAddress: { ...billing, stateCode: billing.stateCode || v.stateCode }, fromLeadId: lead?.id });
  }

  const missing = [!v.name.trim() && 'the name', !v.stateCode && 'the state', !customer && !billing.line1.trim() && 'the billing address'].filter(Boolean);
  return (
    <Screen footer={
      <>
        {m.error && <Alert>{Object.keys(fe).length ? `${errorText(m.error)} (see the box marked in red)` : errorText(m.error)}</Alert>}
        {missing.length > 0 && <Note style={{ textAlign: 'center' }}>To save, fill in {missing.join(', ')}.</Note>}
        <Button title={customer ? 'Save changes' : 'Create customer'} loading={m.isPending} disabled={missing.length > 0} onPress={submit} />
        {onBack && <LinkButton tone="muted" title="Back" onPress={onBack} disabled={m.isPending} />}
      </>
    }>
      {children}
      <Card>
        <H2>Who they are</H2>
        <Pills label="Type" value={v.type} options={TYPES} onChange={(type) => setV({ ...v, type })} />
        <Input label={doctor ? 'Doctor’s name' : 'Hospital / clinic name'} placeholder={doctor ? 'Dr. Meera Iyer' : ''} value={v.name} onChangeText={set('name')} error={fe.name} maxLength={160} />
        {doctor && (
          <Picker label="Works at (optional)" value={v.parentId} onChange={set('parentId')} error={fe.parentId} hint="Lets orders be placed “for Dr. X at Hospital Y”."
            options={[{ value: '', label: 'Independent (no hospital)' }, ...(parents.data ?? []).filter((p) => p.id !== customer?.id).map((p) => ({ value: p.id, label: p.name, hint: TYPE_LABEL[p.type] }))]} />
        )}
        <Input label="Contact person (optional)" value={v.contactPerson} onChangeText={set('contactPerson')} maxLength={120} />
        <Input label="Mobile (optional)" keyboardType="phone-pad" placeholder="98765 43210" value={v.mobile} onChangeText={set('mobile')} error={fe.mobile} maxLength={16} />
        <Input label="Email (optional)" keyboardType="email-address" autoCapitalize="none" value={v.email} onChangeText={set('email')} error={fe.email} maxLength={200} />
        <Picker label="Looked after by (optional)" value={v.assignedEmployeeId} onChange={set('assignedEmployeeId')} error={fe.assignedEmployeeId}
          options={[{ value: '', label: 'Nobody' }, ...(staff.data ?? []).map((u) => ({ value: u.id, label: u.name }))]} />
      </Card>

      <Card>
        <H2>Tax and credit</H2>
        <Note>GSTIN is optional for doctors. When given, it must match the state; the PAN is filled in from it.</Note>
        <StatePicker value={v.stateCode} onChange={set('stateCode')} error={fe.stateCode} />
        <Input label="GSTIN (optional)" autoCapitalize="characters" value={v.gstin} onChangeText={set('gstin')} error={fe.gstin} maxLength={15} />
        <Input label="PAN (optional)" autoCapitalize="characters" value={v.pan} onChangeText={set('pan')} error={fe.pan} maxLength={10} />
        <Input label="Drug licence no. (optional)" value={v.drugLicenceNo} onChangeText={set('drugLicenceNo')} maxLength={100} />
        <Input label="Credit limit in ₹ (optional)" keyboardType="decimal-pad" value={v.creditLimit} onChangeText={set('creditLimit')} error={fe.creditLimit} maxLength={14} />
        <Input label="Days to pay (payment terms)" keyboardType="number-pad" value={v.paymentTermsDays} onChangeText={set('paymentTermsDays')} error={fe.paymentTermsDays} maxLength={3} />
        <Input label="Notes for our team (optional)" multiline value={v.notes} onChangeText={set('notes')} error={fe.notes} maxLength={2000} />
      </Card>

      {!customer && (
        <Card>
          <H2>Billing address</H2>
          <Note>More billing and delivery addresses can be added after saving.</Note>
          <AddressFields value={{ ...billing, stateCode: billing.stateCode || v.stateCode }} onChange={setBilling} errors={subErrors(fe, 'billingAddress')} />
        </Card>
      )}
    </Screen>
  );
}
