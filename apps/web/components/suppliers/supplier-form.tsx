'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader } from '@/components/ui/card';
import { TextField } from '@/components/ui/field';
import { StateSelect } from '@/components/common/state-select';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type Supplier = RouterOutputs['suppliers']['get'];

export function SupplierForm({ supplier, editable = true }: { supplier?: Supplier; editable?: boolean }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [v, setV] = useState({
    name: supplier?.name ?? '', addressLine1: supplier?.addressLine1 ?? '', addressLine2: supplier?.addressLine2 ?? '', city: supplier?.city ?? '',
    pincode: supplier?.pincode ?? '', stateCode: supplier?.stateCode ?? '', gstin: supplier?.gstin ?? '', contactPerson: supplier?.contactPerson ?? '',
    mobile: supplier?.mobile ?? '', email: supplier?.email ?? '', paymentTermsDays: String(supplier?.paymentTermsDays ?? 30),
  });
  const create = trpc.suppliers.create.useMutation({ onSuccess: (s) => { void utils.suppliers.list.invalidate(); router.push(`/app/suppliers/${s.id}`); } });
  const update = trpc.suppliers.update.useMutation({ onSuccess: () => Promise.all([utils.suppliers.get.invalidate({ id: supplier!.id }), utils.suppliers.list.invalidate()]) });
  const m = supplier ? update : create;
  const fe = fieldErrors(m.error);
  const t = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const payload = { ...v, paymentTermsDays: Number(v.paymentTermsDays) };
  return (
    <Card>
      <form onSubmit={(e) => { e.preventDefault(); if (supplier) update.mutate({ id: supplier.id, ...payload }); else create.mutate(payload); }} noValidate>
        <CardHeader title="Supplier details" />
        <CardBody>
          <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
            <TextField label="Company name" value={v.name} onChange={t('name')} error={fe.name} wrapperClassName="sm:col-span-2" required />
            <TextField label="Address line 1" value={v.addressLine1} onChange={t('addressLine1')} error={fe.addressLine1} />
            <TextField label="Address line 2" value={v.addressLine2} onChange={t('addressLine2')} />
            <TextField label="City" value={v.city} onChange={t('city')} error={fe.city} />
            <TextField label="PIN code" inputMode="numeric" value={v.pincode} onChange={t('pincode')} error={fe.pincode} />
            <StateSelect value={v.stateCode} onChange={(s) => setV({ ...v, stateCode: s })} error={fe.stateCode} />
            <TextField label="GSTIN (optional)" className="uppercase" value={v.gstin} onChange={t('gstin')} error={fe.gstin} />
            <TextField label="Contact person" value={v.contactPerson} onChange={t('contactPerson')} />
            <TextField label="Mobile" type="tel" value={v.mobile} onChange={t('mobile')} error={fe.mobile} />
            <TextField label="Email" type="email" value={v.email} onChange={t('email')} error={fe.email} />
            <TextField label="Payment terms (days)" type="number" min={0} value={v.paymentTermsDays} onChange={t('paymentTermsDays')} error={fe.paymentTermsDays} />
          </fieldset>
          {m.error && <div className="mt-4"><Alert>{Object.keys(fe).length ? 'Please correct the highlighted fields.' : errorMessage(m.error)}</Alert></div>}
          {update.isSuccess && <div className="mt-4"><Alert tone="ok">Saved.</Alert></div>}
        </CardBody>
        {editable && <div className="flex justify-end border-t border-line px-5 py-3"><Button type="submit" loading={m.isPending}>{supplier ? 'Save supplier' : 'Create supplier'}</Button></div>}
      </form>
    </Card>
  );
}
