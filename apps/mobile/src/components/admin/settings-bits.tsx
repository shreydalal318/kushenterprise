import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Button, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { Input, Note, SmallButton, Waiting } from './bits';

export type Settings = RouterOutputs['settings']['get'];

/** Owner-only screens: everyone else gets a plain note. */
export function OwnerOnly({ title, children }: { title: string; children: ReactNode }) {
  const { me } = useAuth();
  const head = <Stack.Screen options={{ title }} />;
  if (me?.role !== 'OWNER') return <Screen>{head}<Alert tone="warn">Only the owner can change settings.</Alert></Screen>;
  return <>{head}{children}</>;
}

/** Loads the company settings, then shows the section's form. */
export function WithSettings({ title, children }: { title: string; children: (s: Settings) => ReactNode }) {
  const { me } = useAuth();
  const q = trpc.settings.get.useQuery(undefined, { enabled: me?.role === 'OWNER' });
  return (
    <OwnerOnly title={title}>
      {q.data ? children(q.data) : <Screen><Waiting q={q} /></Screen>}
    </OwnerOnly>
  );
}

/** Form values plus whether anything changed since the last save. */
export function useForm<T extends object>(initial: T) {
  const [v, setV] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const set = <K extends keyof T>(k: K, val: T[K]) => { setV((p) => ({ ...p, [k]: val })); setDirty(true); };
  return { v, set, dirty, saved: () => setDirty(false) };
}

/** The bottom of every settings form: what went wrong, and one Save button. */
export function SaveBar({ error, saving, dirty, onSave }: { error: unknown; saving: boolean; dirty: boolean; onSave: () => void }) {
  return (
    <>
      {error ? <Alert>{errorText(error)}</Alert> : null}
      {!dirty && !saving && <Note style={{ textAlign: 'center' }}>Nothing changed yet.</Note>}
      <Button title="Save changes" loading={saving} disabled={!dirty} onPress={onSave} />
    </>
  );
}

/** A short editable list (GST rates, units, alert days): tap × to remove, type and tap Add to add. */
export function ChipEditor<T extends string | number>({ label, values, onChange, format = String, numeric, placeholder, max }: {
  label: string; values: T[]; onChange: (v: T[]) => void; format?: (v: T) => string; numeric?: boolean; placeholder?: string; max?: number;
}) {
  const [draft, setDraft] = useState('');
  const t = draft.trim();
  const parsed = (numeric ? (t && /^\d+(\.\d+)?$/.test(t) ? Number(t) : null) : t || null) as T | null;
  const full = max != null && values.length >= max;
  const add = () => { if (parsed == null || full) return; onChange([...values, parsed]); setDraft(''); };
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: C.ink }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {values.map((v, i) => (
          <Pressable key={`${v}-${i}`} accessibilityRole="button" accessibilityLabel={`Remove ${format(v)}`} onPress={() => onChange(values.filter((_, j) => j !== i))}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingLeft: 14, paddingRight: 10, borderRadius: 999, borderWidth: 1, borderColor: C.aqua, backgroundColor: pressed ? C.aqua100 : C.aqua50 })}>
            <Text style={{ fontSize: 15, color: C.ink }}>{format(v)}</Text>
            <Ionicons name="close" size={18} color={C.muted} />
          </Pressable>
        ))}
        {!values.length && <Note>None yet.</Note>}
      </View>
      {!full && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input label={`Add to ${label.toLowerCase()}`} value={draft} onChangeText={setDraft} placeholder={placeholder} keyboardType={numeric ? 'decimal-pad' : 'default'}
              autoCapitalize="none" onSubmitEditing={add} returnKeyType="done" maxLength={20} style={{ borderRadius: R.md }} />
          </View>
          <View style={{ paddingBottom: 2 }}><SmallButton icon="add" title="Add" disabled={parsed == null} onPress={add} /></View>
        </View>
      )}
      {full && <Note>{`At most ${max}. Remove one to add another.`}</Note>}
    </View>
  );
}
