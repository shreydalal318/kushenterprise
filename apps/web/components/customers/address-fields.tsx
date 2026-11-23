'use client';
import { TextField } from '@/components/ui/field';
import { StateSelect } from '@/components/common/state-select';

export interface AddressValue { label: string; line1: string; line2: string; city: string; pincode: string; stateCode: string; gstin: string }
export const emptyAddress = (stateCode = ''): AddressValue => ({ label: '', line1: '', line2: '', city: '', pincode: '', stateCode, gstin: '' });

/** Address inputs; `errors` keys may be prefixed (e.g. billingAddress errors are flattened by zod). */
export function AddressFields({ value, onChange, errors = {}, showLabel = false, showGstin = false }: {
  value: AddressValue; onChange: (v: AddressValue) => void; errors?: Record<string, string>; showLabel?: boolean; showGstin?: boolean;
}) {
  const t = (k: keyof AddressValue) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {showLabel && <TextField label="Label (optional)" placeholder="Main OT, Pharmacy…" value={value.label} onChange={t('label')} wrapperClassName="sm:col-span-2" />}
      <TextField label="Address line 1" value={value.line1} onChange={t('line1')} error={errors.line1} />
      <TextField label="Address line 2 (optional)" value={value.line2} onChange={t('line2')} />
      <TextField label="City" value={value.city} onChange={t('city')} error={errors.city} />
      <TextField label="PIN code" inputMode="numeric" value={value.pincode} onChange={t('pincode')} error={errors.pincode} />
      <StateSelect value={value.stateCode} onChange={(s) => onChange({ ...value, stateCode: s })} error={errors.stateCode} />
      {showGstin && <TextField label="Branch GSTIN (optional)" className="uppercase" value={value.gstin} onChange={t('gstin')} error={errors.gstin} />}
    </div>
  );
}
