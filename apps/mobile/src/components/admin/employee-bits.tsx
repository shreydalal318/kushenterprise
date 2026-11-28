import { PERMISSION_GROUPS, PERMISSIONS } from '@kush/core';
import { Text, View } from 'react-native';
import { C } from '@/lib/theme';
import { Note, type Tone } from './bits';

/** One word for where an employee's login stands. */
export function employeeStatus(e: { isActive: boolean; lockedUntil: Date | string | null; mustChangePassword: boolean }): [string, Tone] {
  if (!e.isActive) return ['Deactivated', 'danger'];
  if (e.lockedUntil && new Date(e.lockedUntil) > new Date()) return ['Locked for now', 'warn'];
  if (e.mustChangePassword) return ['Not signed in yet', 'warn'];
  return ['Active', 'ok'];
}

/** The ticked permissions, grouped like the website's boxes. */
export function PermissionSummary({ value }: { value: string[] }) {
  const groups = PERMISSION_GROUPS.map((g) => ({ group: g.group, items: g.permissions.filter((p) => value.includes(p)) })).filter((g) => g.items.length);
  if (!groups.length) return <Note>Nothing ticked yet: they can sign in but can’t see or do anything.</Note>;
  return (
    <View style={{ gap: 8 }}>
      {groups.map((g) => (
        <View key={g.group} style={{ gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy }}>{g.group}</Text>
          {g.items.map((p) => <Text key={p} style={{ fontSize: 15, color: C.ink }}>{`✓ ${PERMISSIONS[p].label}`}</Text>)}
        </View>
      ))}
    </View>
  );
}
