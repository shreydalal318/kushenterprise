import { useState } from 'react';
import { router } from 'expo-router';
import { INDIAN_STATES, gstinError, isValidPincode, stateCodeFromGstin } from '@kush/core';
import { readableError } from '@/components/errors';
import { Alert, Button, Card, Field, H2, Screen } from '@/components/ui';
import { useCan } from '@/lib/auth';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { flashNext, PickList, Note } from './common';

type Supplier = RouterOutputs['suppliers']['get'];

/** New supplier, or change one (web: SupplierForm). Only people who make purchase orders may. */
export function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const utils = trpc.useUtils();
  const can = useCan();
  const [v, setV] = useState({
    name: supplier?.name ?? '', addressLine1: supplier?.addressLine1 ?? '', addressLine2: supplier?.addressLine2 ?? '', city: supplier?.city ?? '',
    pincode: supplier?.pincode ?? '', stateCode: supplier?.stateCode ?? null as string | null, gstin: supplier?.gstin ?? '', contactPerson: supplier?.contactPerson ?? '',
    mobile: supplier?.mobile ?? '', email: supplier?.email ?? '', paymentTermsDays: String(supplier?.paymentTermsDays ?? 30),
  });
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  const create = trpc.suppliers.create.useMutation();
  const update = trpc.suppliers.update.useMutation();
  const m = supplier ? update : create;
  if (!can('CREATE_PURCHASE_ORDERS')) return <Screen><Alert tone="warn">Adding or changing suppliers needs the “Create purchase orders” permission. Ask the owner.</Alert></Screen>;

  const gstin = v.gstin.trim().toUpperCase();
  const gstErr = gstin ? gstinError(gstin) : null;
  const gstState = gstin && !gstErr ? stateCodeFromGstin(gstin) : null;
  const missing = [
    v.name.trim().length < 2 && 'write the company name',
    !v.addressLine1.trim() && 'write the address',
    !v.city.trim() && 'write the city',
    v.pincode.trim() && !isValidPincode(v.pincode.trim()) && 'write a 6-digit PIN code',
    !v.stateCode && 'choose the state',
    gstErr && 'check the GSTIN',
    gstState && v.stateCode && gstState !== v.stateCode && 'the state must match the GSTIN',
    !/^\d{1,3}$/.test(v.paymentTermsDays.trim()) && 'write the payment terms in days',
  ].filter((x): x is string => !!x);

  function save() {
    const payload = {
      name: v.name.trim(), addressLine1: v.addressLine1.trim(), addressLine2: v.addressLine2.trim() || null, city: v.city.trim(), pincode: v.pincode.trim() || null,
      stateCode: v.stateCode!, gstin: gstin || null, contactPerson: v.contactPerson.trim() || null, mobile: v.mobile.trim() || null, email: v.email.trim() || null,
      paymentTermsDays: Number(v.paymentTermsDays.trim()),
    };
    if (supplier) {
      update.mutate({ id: supplier.id, ...payload }, { onSuccess: () => { void utils.suppliers.invalidate(); flashNext(`supplier:${supplier.id}`, 'Supplier saved ✓'); router.back(); } });
    } else {
      create.mutate(payload, { onSuccess: (s) => { void utils.suppliers.invalidate(); flashNext(`supplier:${s.id}`, `Supplier ${s.name} added ✓ Next: add the products they supply, or make a purchase order.`); router.replace(`/staff/suppliers/${s.id}`); } });
    }
  }

  return (
    <Screen footer={
      <>
        {m.error && <Alert>{readableError(m.error)}</Alert>}
        {missing.length > 0 && <Note style={{ textAlign: 'center' }}>To save: {missing.join(', ')}.</Note>}
        <Button title={supplier ? 'Save supplier' : 'Add supplier'} loading={m.isPending} disabled={missing.length > 0} onPress={save} />
      </>
    }>
      <Card>
        <H2>Company</H2>
        <Field label="Company name" value={v.name} onChangeText={set('name')} maxLength={160} />
        <Field label="GSTIN (optional)" autoCapitalize="characters" autoCorrect={false} value={v.gstin} maxLength={15} error={gstin.length >= 15 ? gstErr : null}
          onChangeText={(x) => { const g = x.toUpperCase(); setV((s) => ({ ...s, gstin: g, ...(!s.stateCode && g.length >= 2 && INDIAN_STATES.some((st) => st.code === g.slice(0, 2)) ? { stateCode: g.slice(0, 2) } : {}) })); }} />
        <Field label="Payment terms (days)" keyboardType="number-pad" value={v.paymentTermsDays} onChangeText={(x) => set('paymentTermsDays')(x.replace(/\D/g, ''))} maxLength={3} />
      </Card>
      <Card>
        <H2>Address</H2>
        <Field label="Address line 1" value={v.addressLine1} onChangeText={set('addressLine1')} maxLength={200} />
        <Field label="Address line 2 (optional)" value={v.addressLine2} onChangeText={set('addressLine2')} maxLength={200} />
        <Field label="City" value={v.city} onChangeText={set('city')} maxLength={80} />
        <Field label="PIN code (optional)" keyboardType="number-pad" value={v.pincode} onChangeText={(x) => set('pincode')(x.replace(/\D/g, ''))} maxLength={6} />
        <PickList label="State" value={v.stateCode} placeholder="Choose the state" items={INDIAN_STATES.map((st) => ({ id: st.code, label: st.name, hint: `Code ${st.code}` }))} onChange={(id) => setV((s) => ({ ...s, stateCode: id }))}
          error={gstState && v.stateCode && gstState !== v.stateCode ? `The GSTIN is for state code ${gstState}` : null} />
      </Card>
      <Card>
        <H2>Contact</H2>
        <Field label="Contact person (optional)" value={v.contactPerson} onChangeText={set('contactPerson')} maxLength={120} />
        <Field label="Mobile (optional)" keyboardType="phone-pad" value={v.mobile} onChangeText={set('mobile')} maxLength={15} />
        <Field label="Email (optional)" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={v.email} onChangeText={set('email')} maxLength={120} />
      </Card>
    </Screen>
  );
}
