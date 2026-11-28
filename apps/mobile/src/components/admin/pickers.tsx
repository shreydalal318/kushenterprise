import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { INDIAN_STATES, PERMISSION_GROUPS, PERMISSIONS, type Permission } from '@kush/core';
import { Card, H2, LinkButton } from '@/components/ui';
import { C, R } from '@/lib/theme';
import { Check, Choice, Note, SearchBox } from './bits';

export interface Option { value: string; label: string; hint?: string }

/**
 * Choose one from a list. Shows the current choice; tap to open the list (with a search box when
 * the list is long), tap an item to choose it and close.
 */
export function Picker({ label, value, options, onChange, placeholder = 'Tap to choose', error, hint, disabled }: {
  label: string; value: string; options: Option[]; onChange: (v: string) => void; placeholder?: string; error?: string | null; hint?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = options.find((o) => o.value === value);
  const term = q.trim().toLowerCase();
  const shown = term ? options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(term)) : options;
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: C.ink }}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? 'not chosen'}. Tap to change.`} accessibilityState={{ expanded: open, disabled }} disabled={disabled}
        onPress={() => { setOpen(!open); setQ(''); }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: error ? C.danger : open ? C.teal700 : C.line, borderRadius: R.md, backgroundColor: pressed ? C.aqua50 : C.white, opacity: disabled ? 0.5 : 1 })}>
        <Text style={{ flex: 1, fontSize: 16, color: current ? C.ink : '#9aa5b1' }} numberOfLines={2}>{current?.label ?? placeholder}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
      </Pressable>
      {error ? <Text style={{ fontSize: 15, color: C.danger }}>{error}</Text> : hint ? <Note>{hint}</Note> : null}
      {open && (
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          {options.length > 8 && <View style={{ paddingBottom: 6 }}><SearchBox value={q} onChange={setQ} placeholder={`Find ${label.toLowerCase()}`} /></View>}
          {shown.slice(0, 80).map((o) => (
            <Choice key={o.value || '-none-'} label={o.label} hint={o.hint} selected={o.value === value} onPress={() => { onChange(o.value); setOpen(false); setQ(''); }} />
          ))}
          {shown.length > 80 && <Note>Type a few letters to find the rest.</Note>}
          {!shown.length && <Note>Nothing matches “{q}”.</Note>}
          <LinkButton tone="muted" title="Close" onPress={() => setOpen(false)} />
        </Card>
      )}
    </View>
  );
}

/** Indian state (decides CGST + SGST or IGST). `withUnset` adds the "not set yet" placeholder the company settings start with. */
export function StatePicker({ value, onChange, error, label = 'State', withUnset }: { value: string; onChange: (v: string) => void; error?: string | null; label?: string; withUnset?: boolean }) {
  const options: Option[] = [
    ...(withUnset ? [{ value: 'XX', label: 'Not set yet' }] : []),
    ...INDIAN_STATES.map((st) => ({ value: st.code, label: `${st.name} (${st.code})` })),
  ];
  return <Picker label={label} value={value} options={options} onChange={onChange} error={error} placeholder="Choose the state" />;
}

/** Quick starts, the same as the website's. */
const PRESETS: { label: string; perms: Permission[] }[] = [
  { label: 'Counter / billing', perms: ['VIEW_ORDERS', 'CREATE_ORDERS', 'CREATE_PROFORMA', 'CREATE_TAX_INVOICE', 'RECORD_PAYMENTS'] },
  { label: 'Store / dispatch', perms: ['VIEW_ORDERS', 'UPDATE_ORDER_STATUS', 'SCAN_DISPATCH', 'MANAGE_STOCK'] },
  { label: 'Sales rep', perms: ['VIEW_ORDERS', 'CREATE_ORDERS', 'MANAGE_CUSTOMERS'] },
];

/** What an employee may do: tick boxes grouped the same way as on the website. */
export function PermissionPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (p: Permission) => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  return (
    <View style={{ gap: 12 }}>
      <Card>
        <H2>Quick start</H2>
        <Note>Adds a usual set of ticks. You can still change each one below.</Note>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PRESETS.map((p) => (
            <Pressable key={p.label} accessibilityRole="button" accessibilityLabel={`Add ${p.label}`} onPress={() => onChange([...new Set([...value, ...p.perms])])}
              style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.teal700, backgroundColor: pressed ? C.aqua100 : C.white })}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: C.teal700 }}>+ {p.label}</Text>
            </Pressable>
          ))}
        </View>
        {value.length > 0 && <LinkButton tone="danger" title="Untick everything" onPress={() => onChange([])} />}
      </Card>
      {PERMISSION_GROUPS.map((g) => (
        <Card key={g.group} style={{ gap: 0 }}>
          <H2>{g.group}</H2>
          {g.permissions.map((p) => (
            <Check key={p} label={PERMISSIONS[p].label} value={value.includes(p)} onChange={() => toggle(p)}
              hint={p === 'VIEW_PRICES_MARGINS' ? 'Purchase cost, margins and every customer’s price' : undefined} />
          ))}
        </Card>
      ))}
    </View>
  );
}
