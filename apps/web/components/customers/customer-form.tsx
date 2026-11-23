'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader } from '@/components/ui/card';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { StateSelect } from '@/components/common/state-select';
import { errorMessage, fieldErrors, subErrors } from '@/lib/errors';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { AddressFields, emptyAddress, type AddressValue } from './address-fields';
import { TYPE_LABEL, type CustomerType } from './labels';

type Customer = RouterOutputs['customers']['get'];

export function CustomerForm({ customer, presetParentId, presetType }: { customer?: Customer; presetParentId?: string; presetType?: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const staff = trpc.customers.staffOptions.useQuery();
  const parents = trpc.customers.options.useQuery({ types: ['HOSPITAL', 'CLINIC'] });
  const [v, setV] = useState({
    type: (customer?.type ?? (presetType as CustomerType | undefined) ?? (presetParentId ? 'DOCTOR' : 'HOSPITAL')) as CustomerType,
    name: customer?.name ?? '', contactPerson: customer?.contactPerson ?? '', mobile: customer?.mobile ?? '', email: customer?.email ?? '',
    stateCode: customer?.stateCode ?? '', gstin: customer?.gstin ?? '', pan: customer?.pan ?? '', drugLicenceNo: customer?.drugLicenceNo ?? '',
    creditLimit: customer?.creditLimit == null ? '' : String(customer.creditLimit), paymentTermsDays: String(customer?.paymentTermsDays ?? 30),
    assignedEmployeeId: customer?.assignedEmployeeId ?? '', parentId: customer?.parentId ?? presetParentId ?? '', notes: customer?.notes ?? '',
  });
  const [billing, setBilling] = useState<AddressValue>(emptyAddress());
  const create = trpc.customers.create.useMutation({ onSuccess: (c) => { void utils.customers.list.invalidate(); router.push(`/app/customers/${c.id}`); } });
  const update = trpc.customers.update.useMutation({ onSuccess: () => Promise.all([utils.customers.get.invalidate({ id: customer!.id }), utils.customers.list.invalidate()]) });
  const m = customer ? update : create;
  const fe = fieldErrors(m.error);
  const t = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  function submit() {
    const base = {
      ...v, paymentTermsDays: Number(v.paymentTermsDays), creditLimit: v.creditLimit as never,
      assignedEmployeeId: v.assignedEmployeeId || null, parentId: v.type === 'DOCTOR' ? v.parentId || null : null,
    };
    if (customer) update.mutate({ id: customer.id, ...base });
    else create.mutate({ ...base, billingAddress: { ...billing, stateCode: billing.stateCode || v.stateCode } });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col gap-6" noValidate>
      <Card>
        <CardHeader title="Account" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Type" value={v.type} onChange={t('type')} error={fe.type}>
            {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </SelectField>
          <TextField label={v.type === 'DOCTOR' ? 'Doctor name' : 'Hospital / clinic name'} placeholder={v.type === 'DOCTOR' ? 'Dr. Meera Iyer' : ''} value={v.name} onChange={t('name')} error={fe.name} required />
          {v.type === 'DOCTOR' && (
            <SelectField label="Works at (optional)" value={v.parentId} onChange={t('parentId')} error={fe.parentId} hint='Lets orders be placed "for Dr. X at Hospital Y"'>
              <option value="">— Independent —</option>
              {parents.data?.filter((p) => p.id !== customer?.id).map((p) => <option key={p.id} value={p.id}>{p.name} ({TYPE_LABEL[p.type]})</option>)}
            </SelectField>
          )}
          <TextField label="Contact person" value={v.contactPerson} onChange={t('contactPerson')} />
          <TextField label="Mobile" type="tel" placeholder="98765 43210" value={v.mobile} onChange={t('mobile')} error={fe.mobile} />
          <TextField label="Email" type="email" value={v.email} onChange={t('email')} error={fe.email} />
          <SelectField label="Assigned employee" value={v.assignedEmployeeId} onChange={t('assignedEmployeeId')} error={fe.assignedEmployeeId}>
            <option value="">— Nobody —</option>
            {staff.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectField>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Tax & credit" description="GSTIN is optional for individual doctors. When given, it must match the state; PAN is filled from it." />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <StateSelect value={v.stateCode} onChange={(s) => setV({ ...v, stateCode: s })} error={fe.stateCode} />
          <TextField label="GSTIN" className="uppercase" value={v.gstin} onChange={t('gstin')} error={fe.gstin} />
          <TextField label="PAN" className="uppercase" value={v.pan} onChange={t('pan')} error={fe.pan} />
          <TextField label="Drug licence no. (optional)" value={v.drugLicenceNo} onChange={t('drugLicenceNo')} />
          <TextField label="Credit limit (₹, optional)" type="number" min={0} value={v.creditLimit} onChange={t('creditLimit')} error={fe.creditLimit} />
          <TextField label="Payment terms (days)" type="number" min={0} value={v.paymentTermsDays} onChange={t('paymentTermsDays')} error={fe.paymentTermsDays} />
          <TextAreaField label="Notes (internal)" value={v.notes} onChange={t('notes')} wrapperClassName="sm:col-span-3" />
        </CardBody>
      </Card>

      {!customer && (
        <Card>
          <CardHeader title="Billing address" description="More billing and shipping addresses can be added after saving." />
          <CardBody><AddressFields value={{ ...billing, stateCode: billing.stateCode || v.stateCode }} onChange={setBilling} errors={subErrors(fe, 'billingAddress')} /></CardBody>
        </Card>
      )}

      {m.error && <Alert>{Object.keys(fe).length ? 'Please correct the highlighted fields.' : errorMessage(m.error)}</Alert>}
      {update.isSuccess && <Alert tone="ok">Saved.</Alert>}
      <div className="flex justify-end gap-3">
        {!customer && <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>}
        <Button type="submit" loading={m.isPending}>{customer ? 'Save customer' : 'Create customer'}</Button>
      </div>
    </form>
  );
}
