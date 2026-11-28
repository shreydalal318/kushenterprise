import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FlatList, Pressable, Text, TextInput, View, type FlatListProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect } from 'expo-router';
import { STOCK_STATUS_LABEL, type StockStatus } from '@kush/core';
import { Alert, Badge, Button, Card, LinkButton, Loading, P, Row, s, Screen } from '@/components/ui';
import { errorText } from '@/lib/format';
import { C, R } from '@/lib/theme';

export type Icon = keyof typeof Ionicons.glyphMap;

/** A real calendar day as YYYY-MM-DD (2026-02-30 is not). */
export const isDay = (v: string) => { const d = new Date(`${v}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v); };
/** Whole number typed as text, 0 when it isn't one. Quantities stay as typed so backspace doesn't snap them. */
export const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : 0);
/** A number typed as text: blank is null, anything that isn't a number is NaN. */
export const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v.trim().replace(/,/g, '')));
/** Only digits and one dot, for money and powers typed on a phone keypad. */
export const decimalText = (v: string, signed = false) => {
  const clean = v.replace(signed ? /[^\d.+-]/g : /[^\d.]/g, '');
  const [a, ...b] = clean.split('.');
  return b.length ? `${a}.${b.join('')}` : clean;
};
export const nameOf = (x: { name?: string; productName?: string; label?: string | null }) => `${x.productName ?? x.name ?? ''}${x.label ? ` ${x.label}` : ''}`;

/** The search term a moment after typing stops, so every key press doesn't ask the server. */
export function useDebounced(v: string, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v.trim().slice(0, 60)), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

// The short green line after an action. A screen that saves and goes back (or on to another screen)
// leaves its message here; the screen it lands on shows it when it comes into view.
const flashes = new Map<string, string>();
export const flashNext = (key: string, msg: string) => { flashes.set(key, msg); };
export function useFlash(key: string) {
  const [msg, setMsg] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { const m = flashes.get(key); if (m) { flashes.delete(key); setMsg(m); } }, [key]));
  return [msg, setMsg] as const;
}

/** Secondary text that still meets the 15px minimum. */
export const Note = ({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) => (
  <Text numberOfLines={numberOfLines} style={[{ fontSize: 15, lineHeight: 21, color: C.muted }, style]}>{children}</Text>
);
export const SectionTitle = ({ children }: { children: ReactNode }) => (
  <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 6 }}>{children}</Text>
);
/** "Label ........ value" on one line, both readable. */
export function Line({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <Note style={{ flexShrink: 1 }}>{k}</Note>
      <Text style={{ fontSize: 15, color: C.ink, fontWeight: strong ? '700' : '600', textAlign: 'right', flexShrink: 1 }}>{v}</Text>
    </Row>
  );
}

export function SearchBox({ value, onChange, placeholder, label = 'Search' }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string }) {
  return (
    <View style={{ justifyContent: 'center' }}>
      <Ionicons name="search-outline" size={18} color={C.muted} style={{ position: 'absolute', left: 12, zIndex: 1 }} />
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#9aa5b1" autoCorrect={false} returnKeyType="search"
        style={[s.input, { paddingLeft: 38, minHeight: 46 }]} />
      {!!value && (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChange('')} hitSlop={8} style={{ position: 'absolute', right: 4, padding: 10 }}>
          <Ionicons name="close-circle" size={20} color={C.muted} />
        </Pressable>
      )}
    </View>
  );
}

/** The server's error in plain words, and a way to ask again. */
export function Failed({ error, onRetry, busy }: { error: unknown; onRetry: () => void; busy?: boolean }) {
  return <><Alert>{errorText(error)}</Alert><Button variant="secondary" title="Try again" loading={busy} onPress={onRetry} /></>;
}
/** The header title, also while a screen is loading or can't be shown (none of these routes is named in the stack layout). */
export const Title = ({ title }: { title?: string }) => (title ? <Stack.Screen options={{ title }} /> : null);
/** A whole screen that couldn't load. */
export const FailedScreen = ({ title, ...p }: { title?: string; error: unknown; onRetry: () => void; busy?: boolean }) => <Screen><Title title={title} /><Failed {...p} /></Screen>;
export const NoAccess = ({ children, title }: { children: ReactNode; title?: string }) => <Screen><Title title={title} /><Alert tone="warn">{children}</Alert></Screen>;
export const LoadingScreen = ({ title }: { title?: string }) => <><Title title={title} /><Loading /></>;

/** A pill for picking one of a few: a filter, a reason, a GST rate. 44pt tall. */
export function Pill({ label, selected, onPress, disabled }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected, disabled }} onPress={onPress} disabled={disabled}
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: selected ? C.teal700 : C.line, backgroundColor: selected ? C.aqua100 : C.white, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ fontSize: 15, fontWeight: selected ? '700' : '500', color: selected ? C.navy : C.ink }}>{label}</Text>
    </Pressable>
  );
}
export function Pills<T extends string | number>({ options, value, onChange, disabled }: { options: [T, string][]; value: T | null; onChange: (v: T) => void; disabled?: boolean }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map(([k, l]) => <Pill key={String(k)} label={l} selected={value === k} disabled={disabled} onPress={() => onChange(k)} />)}</View>;
}

export function Check({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value, disabled }} accessibilityLabel={label} onPress={() => onChange(!value)} disabled={disabled}
      style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', minHeight: 44, paddingVertical: 8, opacity: disabled ? 0.5 : 1 }}>
      <Ionicons name={value ? 'checkbox' : 'square-outline'} size={24} color={C.teal700} />
      <View style={{ flex: 1 }}><P>{label}</P>{hint ? <Note>{hint}</Note> : null}</View>
    </Pressable>
  );
}

/** One line of a menu: icon, words, an optional count, and a chevron. */
export function NavRow({ icon, label, hint, count, onPress, tone }: { icon: Icon; label: string; hint?: string; count?: number; onPress: () => void; tone?: 'warn' | 'danger' }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={count ? `${label}, ${count}` : label} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, backgroundColor: pressed ? C.aqua50 : C.white })}>
      <Ionicons name={icon} size={22} color={C.teal700} />
      <View style={{ flex: 1 }}><Text style={{ fontSize: 16, fontWeight: '600', color: C.ink }}>{label}</Text>{hint ? <Note>{hint}</Note> : null}</View>
      {!!count && <View style={{ minWidth: 26, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: tone === 'danger' ? C.danger : tone === 'warn' ? C.warn : C.teal700 }}><Text style={{ color: C.white, fontWeight: '700', textAlign: 'center', fontSize: 14 }}>{count}</Text></View>}
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </Pressable>
  );
}

/** A card you can tap to open. */
export function TapCard({ onPress, label, children, style }: { onPress?: () => void; label: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  if (!onPress) return <Card style={style}>{children}</Card>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      {({ pressed }) => <Card style={[style, pressed && { backgroundColor: C.aqua50 }]}>{children}</Card>}
    </Pressable>
  );
}

/** Ask before doing something that can't be undone: the question, "Yes, …" in red, and a way back. */
export function Confirm({ question, yes, onYes, onNo, busy, no = 'No, go back' }: { question: string; yes: string; onYes: () => void; onNo: () => void; busy?: boolean; no?: string }) {
  return (
    <>
      <Text style={{ fontSize: 16, fontWeight: '700', color: C.danger, textAlign: 'center' }}>{question}</Text>
      <Button variant="danger" title={yes} loading={busy} onPress={onYes} />
      <LinkButton tone="muted" title={no} disabled={busy} onPress={onNo} />
    </>
  );
}

export interface MoreAction { icon: Icon; title: string; onPress: () => void; danger?: boolean }
/** Less common actions, folded away under "More actions" so the screen has one main button. */
export function MoreActions({ actions }: { actions: MoreAction[] }) {
  const [open, setOpen] = useState(false);
  if (!actions.length) return null;
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 }}>
        <Text style={{ color: C.teal700, fontWeight: '700', fontSize: 15 }}>More actions</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.teal700} />
      </Pressable>
      {open && (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {actions.map((a) => (
            <Pressable key={a.title} accessibilityRole="button" accessibilityLabel={a.title} onPress={() => { setOpen(false); a.onPress(); }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}>
              <Ionicons name={a.icon} size={20} color={a.danger ? C.danger : C.teal700} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: a.danger ? C.danger : C.ink }}>{a.title}</Text>
            </Pressable>
          ))}
        </Card>
      )}
    </View>
  );
}

/** A number with what it means, two to a row. */
export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'danger' | 'warn' | 'ok' }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: C.white, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 12, gap: 2 }}>
      <Note>{label}</Note>
      <Text style={{ fontSize: 20, fontWeight: '700', color: tone === 'danger' ? C.danger : tone === 'warn' ? C.warn : tone === 'ok' ? C.ok : C.navy }}>{value}</Text>
      {sub ? <Note>{sub}</Note> : null}
    </View>
  );
}
export const Stats = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;

export function EmptyCard({ icon = 'file-tray-outline', title, hint }: { icon?: Icon; title: string; hint?: string }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
      <Ionicons name={icon} size={36} color={C.teal700} />
      <P style={{ fontWeight: '700', textAlign: 'center' }}>{title}</P>
      {hint ? <Note style={{ textAlign: 'center' }}>{hint}</Note> : null}
    </Card>
  );
}

/**
 * Choose one from a list that may be long (supplier, category, state): looks like a field, opens a
 * list with a search box when there are many to choose from.
 */
export function PickList({ label, value, items, onChange, placeholder = 'Choose…', none, disabled, error }: {
  label: string; value: string | null; items: { id: string; label: string; hint?: string }[]; onChange: (id: string | null) => void;
  placeholder?: string; none?: string; disabled?: boolean; error?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = items.find((i) => i.id === value);
  const term = q.trim().toLowerCase();
  const shown = term ? items.filter((i) => `${i.label} ${i.hint ?? ''}`.toLowerCase().includes(term)) : items;
  const pick = (id: string | null) => { onChange(id); setOpen(false); setQ(''); };
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? (value === null && none ? none : placeholder)}`} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => setOpen(!open)}
        style={[s.input, { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, opacity: disabled ? 0.6 : 1 }, !!error && { borderColor: C.danger }]}>
        <Text style={{ flex: 1, fontSize: 16, color: current || (value === null && none) ? C.ink : '#9aa5b1' }} numberOfLines={1}>{current?.label ?? (value === null && none ? none : placeholder)}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
      </Pressable>
      {!!error && <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text>}
      {open && (
        <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: R.md, backgroundColor: C.white, padding: 6, gap: 2 }}>
          {items.length > 8 && <SearchBox value={q} onChange={setQ} placeholder={`Find ${label.toLowerCase()}`} label={`Find ${label}`} />}
          {!!(none && !term) && <Option label={none} selected={value === null} onPress={() => pick(null)} />}
          {shown.slice(0, 60).map((i) => <Option key={i.id} label={i.label} hint={i.hint} selected={value === i.id} onPress={() => pick(i.id)} />)}
          {!shown.length && <Note style={{ padding: 8 }}>Nothing matches “{q.trim()}”.</Note>}
          {shown.length > 60 && <Note style={{ padding: 8 }}>Type to find more ({shown.length - 60} not shown).</Note>}
        </View>
      )}
    </View>
  );
}
function Option({ label, hint, selected, onPress }: { label: string; hint?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 6, paddingVertical: 6, borderRadius: R.sm, backgroundColor: pressed ? C.aqua50 : 'transparent' })}>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={C.teal700} />
      <View style={{ flex: 1 }}><P>{label}</P>{hint ? <Note>{hint}</Note> : null}</View>
    </Pressable>
  );
}

/** A long list that scrolls fast (FlatList), with a fixed top (search, filters) and a pinned main button. */
export function ListScreen<T>({ top, footer, ...list }: { top?: ReactNode; footer?: ReactNode } & FlatListProps<T>) {
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.canvas }}>
      {!!top && <View style={{ padding: 12, gap: 8 }}>{top}</View>}
      <FlatList keyboardShouldPersistTaps="handled" {...list} contentContainerStyle={[{ padding: 12, paddingTop: top ? 0 : 12, gap: 10 }, list.contentContainerStyle]} />
      {!!footer && <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white }}>{footer}</View>}
    </SafeAreaView>
  );
}

// ---- status words, the same as the website ----
export const PO_STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft', SENT: 'Sent', PARTIALLY_RECEIVED: 'Partly received', RECEIVED: 'Received', CLOSED: 'Closed', CANCELLED: 'Cancelled' };
const PO_TONE: Record<string, 'neutral' | 'teal' | 'warn' | 'ok' | 'danger'> = { DRAFT: 'neutral', SENT: 'teal', PARTIALLY_RECEIVED: 'warn', RECEIVED: 'ok', CLOSED: 'neutral', CANCELLED: 'danger' };
export const PoBadge = ({ status }: { status: string }) => <Badge label={PO_STATUS_LABEL[status] ?? status} tone={PO_TONE[status] ?? 'neutral'} />;
const LEVEL_TONE: Record<StockStatus, 'ok' | 'warn' | 'danger' | 'teal'> = { IN_STOCK: 'ok', LOW_STOCK: 'warn', OUT_OF_STOCK: 'danger', EXPIRING_SOON: 'teal' };
export const LevelBadge = ({ status }: { status: StockStatus }) => <Badge label={STOCK_STATUS_LABEL[status]} tone={LEVEL_TONE[status]} />;
