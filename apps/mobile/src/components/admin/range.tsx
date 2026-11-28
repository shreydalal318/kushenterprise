import { useState } from 'react';
import { View } from 'react-native';
import { addDays, financialYear, formatDate } from '@kush/core';
import { Card } from '@/components/ui';
import { DateInput, isDay, Note, Pills, SmallButton } from './bits';

export interface Range { from: string; to: string }

/** The website's quick periods: this month, last month, last 30 days, this financial year. */
export function presets(today: string): [string, string, Range][] {
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const fy = financialYear(today).slice(0, 4);
  return [
    ['month', 'This month', { from: monthStart, to: today }],
    ['last', 'Last month', { from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd }],
    ['30', 'Last 30 days', { from: addDays(today, -29), to: today }],
    ['fy', 'This financial year', { from: `${fy}-04-01`, to: today }],
  ];
}
export const rangeText = (r: Range) => (r.from === r.to ? formatDate(r.from) : `${formatDate(r.from)} to ${formatDate(r.to)}`);

/** Pick the period a report covers: a quick choice, or two dates (at most two years apart, as the server allows). */
export function RangePicker({ value, onChange, today }: { value: Range; onChange: (r: Range) => void; today: string }) {
  const list = presets(today);
  const match = list.find(([, , r]) => r.from === value.from && r.to === value.to)?.[0];
  const [custom, setCustom] = useState(!match);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const f = from.trim();
  const t = to.trim();
  const problem = !isDay(f) || !isDay(t) ? 'Write both dates as YYYY-MM-DD.'
    : f > t ? 'The “from” date must be on or before the “to” date.'
      : Date.parse(t) - Date.parse(f) > 731 * 86_400_000 ? 'Choose at most two years.' : null;
  return (
    <View style={{ gap: 8 }}>
      <Pills value={custom ? 'custom' : match ?? 'custom'} options={[...list.map(([k, l]): [string, string] => [k, l]), ['custom', 'Choose dates']]}
        onChange={(k) => {
          if (k === 'custom') { setCustom(true); setFrom(value.from); setTo(value.to); return; }
          setCustom(false);
          const r = list.find(([key]) => key === k)?.[2];
          if (r) onChange(r);
        }} />
      {custom && (
        <Card>
          <DateInput label="From" value={from} onChange={setFrom} />
          <DateInput label="To" value={to} onChange={setTo} />
          {problem && (f || t) ? <Note>{problem}</Note> : null}
          <SmallButton icon="checkmark" title="Show this period" disabled={!!problem} onPress={() => onChange({ from: f, to: t })} />
        </Card>
      )}
      <Note>{`Showing ${rangeText(value)}. Sales are before GST, less returns; cancelled invoices are left out.`}</Note>
    </View>
  );
}
