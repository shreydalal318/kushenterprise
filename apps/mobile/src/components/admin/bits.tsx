import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Alert, Button, Card, LinkButton, Loading, s } from '@/components/ui';
import { errorText, rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';

/**
 * Small building blocks for the office screens (customers, pricing, reports, admin). Same look as
 * the rest of the staff app, with every word at least 15px and every tap target at least 44pt.
 */
export type Icon = keyof typeof Ionicons.glyphMap;

/** Secondary text: grey, but still easy to read. */
export const Note = ({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) => (
  <Text numberOfLines={numberOfLines} style={[{ fontSize: 15, lineHeight: 21, color: C.muted }, style]}>{children}</Text>
);
/** The big name at the top of a detail screen. */
export const Heading = ({ children }: { children: ReactNode }) => <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '700', color: C.navy }}>{children}</Text>;
/** A heading between groups of cards. */
export const Section = ({ children }: { children: ReactNode }) => <Text accessibilityRole="header" style={{ fontSize: 15, fontWeight: '700', color: C.muted, marginTop: 6 }}>{children}</Text>;

/** "Label ........ value" on one line. */
export function Line({ k, v, strong, tone }: { k: string; v: ReactNode; strong?: boolean; tone?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, minHeight: 24 }}>
      <Text style={{ fontSize: 15, color: C.muted }}>{k}</Text>
      <Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 15, color: tone ?? C.ink, fontWeight: strong ? '700' : '500' }}>{v}</Text>
    </View>
  );
}

/** What went wrong, with a Try again button. */
export function Failed({ error, onRetry, busy }: { error: unknown; onRetry?: () => void; busy?: boolean }) {
  return (
    <View style={{ gap: 8 }}>
      <Alert>{errorText(error)}</Alert>
      {onRetry && <Button variant="secondary" title="Try again" loading={busy} onPress={onRetry} />}
    </View>
  );
}
/** While a screen's data loads: a spinner, or the error with Try again. */
export const Waiting = ({ q }: { q: { error: unknown; isFetching: boolean; refetch: () => unknown } }) =>
  (q.error ? <Failed error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} /> : <Loading />);

/** Field errors from the server's checks, keyed by field ("billingAddress.pincode"). */
export function fieldErrors(e: unknown): Record<string, string> {
  const fe = (e as { data?: { zodError?: { fieldErrors?: Record<string, string[] | undefined> } | null } | null } | null)?.data?.zodError?.fieldErrors;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fe ?? {})) if (v?.[0]) out[k] = v[0];
  return out;
}
/** The errors under one part of a form, with the prefix taken off. */
export function subErrors(fe: Record<string, string>, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fe)) if (k.startsWith(`${prefix}.`)) out[k.slice(prefix.length + 1)] = v;
  return out;
}

/** A text box with its label above and any problem in red below. */
export function Input({ label, error, hint, style, multiline, ...rest }: { label: string; error?: string | null; hint?: string } & TextInputProps) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: C.ink }}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor="#9aa5b1" multiline={multiline}
        style={[s.input, { minHeight: 48 }, multiline ? { minHeight: 96, textAlignVertical: 'top' } : null, error ? { borderColor: C.danger } : null, style]} {...rest} />
      {error ? <Text style={{ fontSize: 15, color: C.danger }}>{error}</Text> : hint ? <Note>{hint}</Note> : null}
    </View>
  );
}

/** A real calendar day as YYYY-MM-DD (2026-02-30 is not). */
export const isDay = (v: string) => { const d = new Date(`${v}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v); };
/** Empty, or a real date. */
export const dayOk = (v: string) => !v.trim() || isDay(v.trim());
export function DateInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <Input label={label} value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" hint={hint ?? 'For example 2026-04-01'} keyboardType="numbers-and-punctuation" maxLength={10} autoCorrect={false} autoCapitalize="none"
      error={dayOk(value) ? null : 'Write the date as YYYY-MM-DD, for example 2026-04-01'} />
  );
}
/** Money or a count typed by hand: a number, or null when it isn't one. */
export const toNumber = (v: string) => { const t = v.replace(/[₹,\s]/g, ''); return t && /^-?\d*\.?\d+$/.test(t) ? Number(t) : null; };

/** A search box with a clear button. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: C.line, borderRadius: R.md, backgroundColor: C.white }}>
      <Ionicons name="search" size={18} color={C.muted} />
      <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#9aa5b1" autoCorrect={false} returnKeyType="search"
        style={{ flex: 1, fontSize: 16, color: C.ink, paddingVertical: 10 }} />
      {!!value && (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} onPress={() => onChange('')} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Ionicons name="close-circle" size={22} color={C.muted} />
        </Pressable>
      )}
    </View>
  );
}
/** The value once typing has paused, so a search doesn't ask the server on every letter. */
export function useDebounced(v: string, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/** Pull down to refresh a list; the spinner shows only for a pull, not for every search. */
export function usePull(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  return { refreshing, onRefresh: () => { setRefreshing(true); void refresh().finally(() => setRefreshing(false)); } };
}

/** A tick box: tap anywhere on the row. */
export function Check({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value, disabled }} accessibilityLabel={label} disabled={disabled} onPress={() => onChange(!value)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 4, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}>
      <Ionicons name={value ? 'checkbox' : 'square-outline'} size={26} color={value ? C.teal700 : C.muted} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, color: C.ink }}>{label}</Text>
        {hint ? <Note>{hint}</Note> : null}
      </View>
    </Pressable>
  );
}
/** One of several (a round button). */
export function Choice({ label, hint, selected, onPress, disabled }: { label: string; hint?: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected, disabled }} accessibilityLabel={label} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 4, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={24} color={selected ? C.teal700 : C.muted} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, color: C.ink, fontWeight: selected ? '700' : '400' }}>{label}</Text>
        {hint ? <Note>{hint}</Note> : null}
      </View>
    </Pressable>
  );
}

/** Pills for a filter or a short choice (Doctor / Hospital / Clinic). */
export function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ fontSize: 15, fontWeight: '600', color: C.ink }}>{label}</Text> : null}
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map(([k, l]) => {
          const on = value === k;
          return (
            <Pressable key={k || 'all'} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={l} onPress={() => onChange(k)}
              style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: on ? C.teal700 : C.line, backgroundColor: on ? C.aqua100 : C.white, opacity: pressed ? 0.7 : 1 })}>
              <Text style={{ fontSize: 15, fontWeight: on ? '700' : '500', color: on ? C.navy : C.muted }}>{l}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const TONE = { ok: [C.ok50, C.ok], warn: [C.warn50, C.warn], danger: [C.danger50, C.danger], teal: [C.aqua100, C.teal700], neutral: [C.canvas, C.muted] } as const;
export type Tone = keyof typeof TONE;
/** A status word in a coloured pill. */
export const Tag = ({ label, tone = 'neutral' }: { label: string; tone?: Tone }) => (
  <View style={{ backgroundColor: TONE[tone][0], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, alignSelf: 'flex-start' }}>
    <Text style={{ color: TONE[tone][1], fontSize: 15, fontWeight: '700' }}>{label}</Text>
  </View>
);

/** A whole card you tap to open something, with a › on the right. */
export function Tap({ onPress, label, children, style }: { onPress: () => void; label: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      {({ pressed }) => (
        <Card style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 }, pressed ? { backgroundColor: C.aqua50 } : null, style]}>
          <View style={{ flex: 1, gap: 4 }}>{children}</View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </Card>
      )}
    </Pressable>
  );
}

/** A plain action in a list of actions ("Edit details", "Deactivate"). */
export function Action({ icon, title, onPress, danger, disabled }: { icon: Icon; title: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} disabled={disabled}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 4, opacity: disabled ? 0.5 : pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={22} color={danger ? C.danger : C.teal700} />
      <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: danger ? C.danger : C.ink }}>{title}</Text>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </Pressable>
  );
}

/** A small outlined button for a side action on a card (Call, WhatsApp, PDF). */
export function SmallButton({ icon, title, onPress, busy, disabled, label }: { icon?: Icon; title: string; onPress: () => void; busy?: boolean; disabled?: boolean; label?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? title} accessibilityState={{ busy, disabled }} onPress={onPress} disabled={disabled || busy} hitSlop={4}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.teal700, backgroundColor: pressed ? C.aqua100 : C.white, opacity: disabled ? 0.5 : 1, alignSelf: 'flex-start' })}>
      {busy ? <ActivityIndicator size="small" color={C.teal700} /> : icon ? <Ionicons name={icon} size={18} color={C.teal700} /> : null}
      <Text style={{ fontSize: 15, fontWeight: '700', color: C.teal700 }}>{title}</Text>
    </Pressable>
  );
}
/** A row of small buttons that wraps on narrow phones. */
export const ButtonRow = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;

/** The yes / no before anything that can't easily be undone. */
export function Confirm({ question, detail, yes, no = 'No, go back', onYes, onNo, busy, error }: {
  question: string; detail?: string; yes: string; no?: string; onYes: () => void; onNo: () => void; busy?: boolean; error?: unknown;
}) {
  return (
    <Card style={{ borderColor: C.danger, borderWidth: 2 }}>
      <Text accessibilityRole="alert" style={{ fontSize: 17, fontWeight: '700', color: C.danger, textAlign: 'center' }}>{question}</Text>
      {detail ? <Note style={{ textAlign: 'center' }}>{detail}</Note> : null}
      {error ? <Alert>{errorText(error)}</Alert> : null}
      <Button variant="danger" title={yes} loading={busy} onPress={onYes} />
      <LinkButton tone="muted" title={no} onPress={onNo} disabled={busy} />
    </Card>
  );
}

/** A number in a card (sales today, outstanding). Put two side by side in a Grid. */
export function Stat({ label, value, sub, subTone, onPress }: { label: string; value: string; sub?: string; subTone?: string; onPress?: () => void }) {
  const inner = (pressed: boolean) => (
    <Card style={[{ gap: 2, minHeight: 88 }, pressed ? { backgroundColor: C.aqua50 } : null]}>
      <Note>{label}</Note>
      <Text style={{ fontSize: 22, fontWeight: '700', color: C.navy }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={{ fontSize: 15, color: subTone ?? C.muted }}>{sub}</Text> : null}
    </Card>
  );
  return (
    <View style={{ flexGrow: 1, flexBasis: '45%' }}>
      {onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress}>{({ pressed }) => inner(pressed)}</Pressable> : inner(false)}
    </View>
  );
}
export const Grid = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;

const pct = (n: number): `${number}%` => `${Math.round(n * 10) / 10}%`;
/** Simple bars: one row per item, longest bar = biggest number. */
export function Bars({ rows, format = rupees, empty = 'Nothing in this period.' }: { rows: { key: string; label: string; sub?: string; value: number }[]; format?: (n: number) => string; empty?: string }) {
  if (!rows.length) return <Note>{empty}</Note>;
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: 12 }}>
      {rows.map((r) => (
        <View key={r.key} style={{ gap: 4 }} accessible accessibilityLabel={`${r.label}: ${format(r.value)}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 15, color: C.ink }} numberOfLines={2}>{r.label}{r.sub ? <Text style={{ color: C.muted }}>{` · ${r.sub}`}</Text> : null}</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: r.value < 0 ? C.danger : C.ink }}>{format(r.value)}</Text>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: C.canvas, overflow: 'hidden' }}>
            <View style={{ height: 10, borderRadius: 5, width: pct(max > 0 ? Math.max(1.5, (Math.max(0, r.value) / max) * 100) : 0), backgroundColor: C.teal }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Standing bars over time (sales per day / week / month), with the first and last label under them. */
export function Columns({ points, height = 120, format = rupees }: { points: { label: string; value: number }[]; height?: number; format?: (n: number) => string }) {
  if (!points.length) return <Note>Nothing in this period.</Note>;
  const max = Math.max(1, ...points.map((p) => p.value));
  const best = points.reduce((b, p) => (p.value > b.value ? p : b), points[0]!);
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`From ${points[0]!.label} to ${points[points.length - 1]!.label}. Highest ${format(best.value)} on ${best.label}.`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: points.length > 40 ? 1 : 3, borderBottomWidth: 1, borderBottomColor: C.line }}>
        {points.map((p, i) => (
          <View key={`${p.label}-${i}`} style={{ flex: 1, height: p.value > 0 ? Math.max(2, (p.value / max) * height) : 0, backgroundColor: p === best ? C.teal700 : C.teal, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Note>{points[0]!.label}</Note>
        <Note>{points[points.length - 1]!.label}</Note>
      </View>
      {best.value > 0 && <Note>Highest: {format(best.value)} ({best.label})</Note>}
    </View>
  );
}

const waiting = new Map<string, string>();
/** Leave a green line for the screen we go back to ("Address saved ✓"); it shows when that screen is in view again. */
export const flashOn = (key: string, msg: string) => { waiting.set(key, msg); };
/** The short green line after each action, like the order screen's. */
export function useFlash(key: string, first: string | null = null) {
  const [flash, setFlash] = useState<string | null>(first);
  useFocusEffect(useCallback(() => {
    const m = waiting.get(key);
    if (m) { waiting.delete(key); setFlash(m); }
  }, [key]));
  return [flash, setFlash] as const;
}

/** Ring, WhatsApp or email someone from the phone. */
export const callNumber = (mobile: string) => void Linking.openURL(`tel:${mobile.replace(/\s/g, '')}`).catch(() => {});
export const whatsApp = (mobile: string) => void Linking.openURL(`https://wa.me/${mobile.replace(/[^\d]/g, '')}`).catch(() => {});
export const sendEmail = (email: string) => void Linking.openURL(`mailto:${email}`).catch(() => {});

/** Shown instead of a screen the person isn't allowed to use. */
export const NotAllowed = ({ what }: { what: string }) => <Alert tone="warn">{`You can’t ${what}. Ask the owner to give you that permission.`}</Alert>;
