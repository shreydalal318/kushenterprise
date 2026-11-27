import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, R } from '@/lib/theme';

/** Page wrapper. `footer` stays pinned to the bottom (e.g. "Add to cart") while the content scrolls. */
export function Screen({ children, scroll = true, padded = true, footer }: { children: ReactNode; scroll?: boolean; padded?: boolean; footer?: ReactNode }) {
  const inner = <View style={[{ gap: 12 }, padded && { padding: 16 }]}>{children}</View>;
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.canvas }}>
      {scroll ? <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">{inner}</ScrollView> : <View style={{ flex: 1 }}>{inner}</View>}
      {footer && <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white }}>{footer}</View>}
    </SafeAreaView>
  );
}

export const Card = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[s.card, style]}>{children}</View>;
export const H1 = ({ children }: { children: ReactNode }) => <Text style={s.h1}>{children}</Text>;
export const H2 = ({ children }: { children: ReactNode }) => <Text style={s.h2}>{children}</Text>;
export const P = ({ children, muted, style, numberOfLines }: { children: ReactNode; muted?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number }) => <Text numberOfLines={numberOfLines} style={[s.p, muted && { color: C.muted }, style]}>{children}</Text>;
export const Small = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => <Text style={[s.small, style]}>{children}</Text>;
export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;

export function Button({ title, onPress, variant = 'primary', loading, disabled, style, icon }: { title: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; icon?: ReactNode }) {
  const bg = variant === 'primary' ? C.teal700 : variant === 'danger' ? C.danger : C.white;
  const fg = variant === 'secondary' ? C.ink : C.white;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, variant === 'secondary' && { borderWidth: 1, borderColor: C.line }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <Row style={{ justifyContent: 'center' }}>{icon}<Text style={[s.btnText, { color: fg }]}>{title}</Text></Row>}
    </Pressable>
  );
}

export function Field({ label, error, ...rest }: { label: string; error?: string | null } & TextInputProps) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor="#9aa5b1" style={[s.input, !!error && { borderColor: C.danger }]} {...rest} />
      {!!error && <Text style={{ color: C.danger, fontSize: 12 }}>{error}</Text>}
    </View>
  );
}

const TONES = { ok: [C.ok50, C.ok], warn: [C.warn50, C.warn], danger: [C.danger50, C.danger], teal: [C.aqua100, C.teal700], neutral: [C.canvas, C.muted] } as const;
export const Badge = ({ label, tone = 'neutral' }: { label: string; tone?: keyof typeof TONES }) => (
  <View style={{ backgroundColor: TONES[tone][0], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}><Text style={{ color: TONES[tone][1], fontSize: 12, fontWeight: '600' }}>{label}</Text></View>
);

export const Alert = ({ children, tone = 'danger' }: { children: ReactNode; tone?: 'danger' | 'ok' | 'warn' | 'info' }) => {
  const [bg, fg] = tone === 'ok' ? [C.ok50, C.ok] : tone === 'warn' ? [C.warn50, C.warn] : tone === 'info' ? [C.aqua50, C.navy] : [C.danger50, C.danger];
  return <View accessibilityRole="alert" style={{ backgroundColor: bg, borderRadius: R.md, padding: 12 }}><Text style={{ color: fg, fontSize: 14 }}>{children}</Text></View>;
};
export const Loading = () => <View style={{ padding: 32 }}><ActivityIndicator color={C.teal700} /></View>;
export const Empty = ({ children }: { children: ReactNode }) => <Card><P muted style={{ textAlign: 'center', paddingVertical: 16 }}>{children}</P></Card>;
export const Divider = () => <View style={{ height: 1, backgroundColor: C.line }} />;

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return <Row style={{ justifyContent: 'space-between' }}><Small>{k}</Small><Text style={{ fontSize: 14, color: C.ink, fontWeight: '500' }}>{v}</Text></Row>;
}

export function Tabs<T extends string>({ value, options, onChange, big }: { value: T; options: [T, string][]; onChange: (v: T) => void; big?: boolean }) {
  return (
    <Row style={{ backgroundColor: C.white, borderRadius: R.md, padding: 3, borderWidth: 1, borderColor: C.line }}>
      {options.map(([k, l]) => (
        <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: value === k }} onPress={() => onChange(k)} style={{ flex: 1, paddingVertical: big ? 11 : 8, borderRadius: R.sm, backgroundColor: value === k ? C.aqua100 : 'transparent' }}>
          <Text style={{ textAlign: 'center', fontSize: big ? 15 : 13, fontWeight: value === k ? '700' : '500', color: value === k ? C.navy : C.muted }}>{l}</Text>
        </Pressable>
      ))}
    </Row>
  );
}

/** A secondary action that shouldn't look like a second main button: plain text, still a 44pt target. */
export function LinkButton({ title, onPress, tone = 'teal', icon, disabled }: { title: string; onPress: () => void; tone?: 'teal' | 'danger' | 'muted'; icon?: ReactNode; disabled?: boolean }) {
  const color = tone === 'danger' ? C.danger : tone === 'muted' ? C.muted : C.teal700;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} disabled={disabled} hitSlop={4}
      style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, opacity: disabled ? 0.5 : pressed ? 0.6 : 1 })}>
      {icon}<Text style={{ color, fontSize: 15, fontWeight: '700' }}>{title}</Text>
    </Pressable>
  );
}

/** A pill for picking one of several: list filters, who handles an order. */
export function Chip({ label, selected, onPress, disabled, role = 'radio', style }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean; role?: 'radio' | 'tab'; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ selected, disabled }} onPress={onPress} disabled={disabled}
      style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: selected ? C.teal700 : C.line, backgroundColor: selected ? C.aqua100 : C.white, opacity: disabled ? 0.5 : 1 }, style]}>
      <Text style={{ fontSize: 13, fontWeight: selected ? '700' : '500', color: selected ? C.navy : C.muted }}>{label}</Text>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  card: { backgroundColor: C.white, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 14, gap: 8 },
  h1: { fontSize: 22, fontWeight: '700', color: C.navy },
  h2: { fontSize: 16, fontWeight: '700', color: C.navy },
  p: { fontSize: 15, color: C.ink, lineHeight: 21 },
  small: { fontSize: 12.5, color: C.muted },
  label: { fontSize: 13, color: C.muted, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.ink, backgroundColor: C.white },
  btn: { borderRadius: R.md, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  btnText: { fontSize: 16, fontWeight: '700' },
});
