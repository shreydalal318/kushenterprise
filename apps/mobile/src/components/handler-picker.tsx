import { View } from 'react-native';
import { readableError } from '@/components/errors';
import { Alert, Chip, Loading, Small } from '@/components/ui';
import { trpc } from '@/lib/trpc';

const big = { paddingHorizontal: 14, paddingVertical: 9 };

/**
 * Who handles an order: one employee, who invoices (and so packs), dispatches and delivers it, or nobody
 * yet. The owner oversees every order and is never offered. `value` undefined = nothing chosen yet.
 */
export function HandlerPicker({ value, onChange, disabled, noneLabel = 'Not assigned yet' }: { value: string | null | undefined; onChange: (id: string | null) => void; disabled?: boolean; noneLabel?: string }) {
  const staff = trpc.orders.staff.useQuery();
  if (staff.isLoading) return <Loading />;
  const people = (staff.data ?? []).filter((u) => u.role === 'EMPLOYEE');
  return (
    <View style={{ gap: 6 }}>
      {/* The list needs order access; without it the order can still be saved for someone to assign later. */}
      {staff.error && <Alert>{`Couldn’t load the employees. ${readableError(staff.error)}`}</Alert>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {people.map((u) => <Chip key={u.id} label={u.name} selected={value === u.id} disabled={disabled} onPress={() => onChange(u.id)} style={big} />)}
        <Chip label={noneLabel} selected={value === null} disabled={disabled} onPress={() => onChange(null)} style={big} />
      </View>
      {staff.data && !people.length && <Small>No active employees yet. Add them on the website to hand orders to them.</Small>}
    </View>
  );
}
