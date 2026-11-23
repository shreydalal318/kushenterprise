'use client';
import { INDIAN_STATES } from '@kush/core';
import { SelectField } from '@/components/ui/field';

export function StateSelect({ value, onChange, error, label = 'State' }: { value: string; onChange: (v: string) => void; error?: string; label?: string }) {
  return (
    <SelectField label={label} value={value} onChange={(e) => onChange(e.target.value)} error={error}>
      <option value="">Choose…</option>
      {INDIAN_STATES.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
    </SelectField>
  );
}
