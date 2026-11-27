import type { ReactNode } from 'react';
import { Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, s } from '@/components/ui';
import { C, R } from '@/lib/theme';

// Customer screens use a slightly larger type than staff ones: nothing under 15 px that has to be read.

const TONE = { ok: [C.ok50, C.ok, 'checkmark-circle'], warn: [C.warn50, C.warn, 'time-outline'], danger: [C.danger50, C.danger, 'alert-circle'], info: [C.aqua50, C.navy, 'information-circle-outline'] } as const;
/** A message box with an icon: green done, amber waiting, red failed, blue for information. */
export function Notice({ tone = 'info', children }: { tone?: keyof typeof TONE; children: ReactNode }) {
  const [bg, fg, icon] = TONE[tone];
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: bg, borderRadius: R.md, padding: 12 }}>
      <Ionicons name={icon} size={20} color={fg} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, color: fg, fontSize: 15, lineHeight: 21 }}>{children}</Text>
    </View>
  );
}

/** A failure in plain words with the way out right under it. */
export const ErrorBox = ({ text, onRetry, busy }: { text: string; onRetry?: () => void; busy?: boolean }) => (
  <View style={{ gap: 8 }}><Notice tone="danger">{text}</Notice>{onRetry && <Button variant="secondary" title="Try again" loading={busy} onPress={onRetry} />}</View>
);

/** Secondary text that is still easy to read (15 px, grey). */
export const Note = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => <Text style={[{ fontSize: 15, lineHeight: 21, color: C.muted }, style]}>{children}</Text>;

/** "Label ........ value" on one line. */
export const Line = ({ k, v }: { k: string; v: ReactNode }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text style={{ fontSize: 15, color: C.muted, flexShrink: 1 }}>{k}</Text><Text style={{ fontSize: 15, color: C.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{v}</Text></View>
);

export function Input({ label, error, style, ...rest }: { label: string; error?: string | null } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: C.ink }}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor="#8a95a1" style={[s.input, { minHeight: 48 }, rest.multiline && { minHeight: 88, textAlignVertical: 'top' }, !!error && { borderColor: C.danger }, style]} {...rest} />
      {!!error && <Text style={{ color: C.danger, fontSize: 15 }}>{error}</Text>}
    </View>
  );
}

/** Big tabs (each at least 44 px tall) for switching what a screen shows. */
export function Segments<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.white, borderRadius: R.md, padding: 3, borderWidth: 1, borderColor: C.line }}>
      {options.map(([k, l]) => (
        <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: value === k }} onPress={() => onChange(k)} style={{ flex: 1, minHeight: 44, justifyContent: 'center', borderRadius: R.sm, backgroundColor: value === k ? C.teal700 : 'transparent' }}>
          <Text style={{ textAlign: 'center', fontSize: 15, fontWeight: '700', color: value === k ? C.white : C.muted }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** A list with nothing in it yet: says what to do next, with one button that does it. */
export function EmptyState({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 32, paddingHorizontal: 16 }}>
      {icon}
      <Text style={{ fontSize: 17, color: C.navy, fontWeight: '600', textAlign: 'center', lineHeight: 24 }}>{text}</Text>
      {action && <View style={{ alignSelf: 'stretch' }}>{action}</View>}
    </View>
  );
}
