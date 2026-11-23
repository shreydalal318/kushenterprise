'use client';
import { expandPowerRange, formatPower } from '@kush/core';
import { SelectField, TextField } from '@/components/ui/field';

export interface PowerRange { from: string; to: string; step: string; cylinders: string; addPowers: string }
export const emptyRange: PowerRange = { from: '10', to: '30', step: '0.5', cylinders: '', addPowers: '' };

const list = (s: string) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean).map(Number);

/** Convert the form strings into the API shape (null when incomplete). */
export function toRangeInput(r: PowerRange) {
  if (r.from === '' || r.to === '') return null;
  return { from: Number(r.from), to: Number(r.to), step: Number(r.step), cylinders: list(r.cylinders), addPowers: list(r.addPowers) };
}

export function rangePreview(r: PowerRange): { count: number; text: string } | { error: string } {
  const input = toRangeInput(r);
  if (!input) return { error: 'Enter from and to powers' };
  try {
    const combos = expandPowerRange(input);
    return { count: combos.length, text: `${formatPower(input.from)} to ${formatPower(input.to)} in ${input.step} D steps${input.cylinders.length ? ` × ${input.cylinders.length} cylinder(s)` : ''}${input.addPowers.length ? ` × ${input.addPowers.length} add power(s)` : ''}` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export function PowerRangeFields({ value, onChange, lensType }: { value: PowerRange; onChange: (v: PowerRange) => void; lensType: string | null }) {
  const p = rangePreview(value);
  const set = (k: keyof PowerRange) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="From (D)" type="number" step="0.25" value={value.from} onChange={set('from')} />
        <TextField label="To (D)" type="number" step="0.25" value={value.to} onChange={set('to')} />
        <SelectField label="Step" value={value.step} onChange={set('step')}>
          <option value="0.25">0.25 D</option><option value="0.5">0.50 D</option><option value="1">1.00 D</option>
        </SelectField>
      </div>
      {lensType === 'TORIC' && <TextField label="Cylinder powers (D)" placeholder="e.g. 1.5, 2.25, 3" value={value.cylinders} onChange={set('cylinders')} hint="One variant is created for every power × cylinder" />}
      {lensType === 'MULTIFOCAL' && <TextField label="Add powers (D), optional" placeholder="e.g. 3.25, 3.75" value={value.addPowers} onChange={set('addPowers')} />}
      <p className={'error' in p ? 'text-sm text-danger' : 'text-sm text-muted'} role="status">
        {'error' in p ? p.error : <>Will create <strong className="text-ink">{p.count}</strong> variant{p.count === 1 ? '' : 's'}: {p.text}. Existing powers are skipped.</>}
      </p>
    </div>
  );
}
