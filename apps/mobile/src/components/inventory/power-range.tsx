import { Text, View } from 'react-native';
import { expandPowerRange, formatPower } from '@kush/core';
import { Field } from '@/components/ui';
import { C } from '@/lib/theme';
import { decimalText, Note, Pills } from './common';

/** The same power-range fields as the website (apps/web/components/products/power-range-fields.tsx). */
export interface PowerRange { from: string; to: string; step: string; cylinders: string; addPowers: string }
export const emptyRange: PowerRange = { from: '10', to: '30', step: '0.5', cylinders: '', addPowers: '' };

const list = (s: string) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean).map(Number);

/** The form's text turned into what the server takes (null while incomplete). */
export function toRangeInput(r: PowerRange) {
  if (r.from.trim() === '' || r.to.trim() === '') return null;
  return { from: Number(r.from), to: Number(r.to), step: Number(r.step), cylinders: list(r.cylinders), addPowers: list(r.addPowers) };
}

export function rangePreview(r: PowerRange): { count: number; text: string } | { error: string } {
  const input = toRangeInput(r);
  if (!input) return { error: 'Write the first and last power' };
  if ([input.from, input.to, ...input.cylinders, ...input.addPowers].some((n) => !Number.isFinite(n))) return { error: 'Powers must be numbers, like 21.5' };
  try {
    const combos = expandPowerRange(input);
    return { count: combos.length, text: `${formatPower(input.from)} to ${formatPower(input.to)} in ${input.step} D steps${input.cylinders.length ? ` × ${input.cylinders.length} cylinder(s)` : ''}${input.addPowers.length ? ` × ${input.addPowers.length} add power(s)` : ''}` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export function PowerRangeFields({ value, onChange, lensType }: { value: PowerRange; onChange: (v: PowerRange) => void; lensType: string | null }) {
  const p = rangePreview(value);
  const set = (k: keyof PowerRange) => (v: string) => onChange({ ...value, [k]: v });
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Field label="First power (D)" keyboardType="numbers-and-punctuation" value={value.from} onChangeText={(v) => set('from')(decimalText(v, true))} maxLength={6} /></View>
        <View style={{ flex: 1 }}><Field label="Last power (D)" keyboardType="numbers-and-punctuation" value={value.to} onChangeText={(v) => set('to')(decimalText(v, true))} maxLength={6} /></View>
      </View>
      <Note>Gap between powers</Note>
      <Pills options={[['0.25', '0.25 D'], ['0.5', '0.50 D'], ['1', '1.00 D']]} value={value.step} onChange={set('step')} />
      {lensType === 'TORIC' && <Field label="Cylinder powers (D)" placeholder="e.g. 1.5, 2.25, 3" keyboardType="numbers-and-punctuation" value={value.cylinders} onChangeText={set('cylinders')} />}
      {lensType === 'TORIC' && <Note>One power is made for every power × cylinder.</Note>}
      {lensType === 'MULTIFOCAL' && <Field label="Add powers (D), optional" placeholder="e.g. 3.25, 3.75" keyboardType="numbers-and-punctuation" value={value.addPowers} onChangeText={set('addPowers')} />}
      <Text accessibilityRole="text" style={{ fontSize: 15, lineHeight: 21, color: 'error' in p ? C.danger : C.ink }}>
        {'error' in p ? p.error : `Makes ${p.count} power${p.count === 1 ? '' : 's'}: ${p.text}. Powers already there are skipped.`}
      </Text>
    </View>
  );
}
