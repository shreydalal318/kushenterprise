import { Text, View } from 'react-native';
import { C } from '@/lib/theme';

/**
 * Where an order is, in plain words for doctors and hospitals. Staff screens keep the exact steps
 * (Confirmed, Packed…); a customer only needs placed → invoice → on the way → delivered.
 */
const WORD: Record<string, string> = { PLACED: 'Order placed', CONFIRMED: 'Order placed', PACKED: 'Invoice ready', DISPATCHED: 'On the way', DELIVERED: 'Delivered', ON_HOLD: 'On hold', CANCELLED: 'Cancelled' };
export const statusText = (status: string, pickup = false) => (status === 'DISPATCHED' && pickup ? 'Ready to collect' : WORD[status] ?? status);

export const STEPS = ['Placed', 'Invoice', 'On the way', 'Delivered'] as const;
// A held order shows only "placed": where it stopped is told on the order itself.
const DONE: Record<string, number> = { PLACED: 1, CONFIRMED: 1, ON_HOLD: 1, PACKED: 2, DISPATCHED: 3, DELIVERED: 4, CANCELLED: 0 };
export const stepsDone = (status: string) => DONE[status] ?? 1;

const TONE: Record<string, [string, string]> = { DELIVERED: [C.ok50, C.ok], ON_HOLD: [C.warn50, C.warn], CANCELLED: [C.danger50, C.danger] };
export function StatusPill({ status, pickup }: { status: string; pickup?: boolean }) {
  const [bg, fg] = TONE[status] ?? [C.aqua100, C.teal700];
  return <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}><Text style={{ color: fg, fontSize: 14, fontWeight: '700' }}>{statusText(status, pickup)}</Text></View>;
}

/** Four dots: Placed · Invoice · On the way · Delivered, filled up to where the order is. */
export function Progress({ status }: { status: string }) {
  const done = stepsDone(status);
  const on = status === 'ON_HOLD' ? C.warn : C.teal700;
  const line = (lit: boolean, hidden: boolean) => <View style={{ flex: 1, height: 2, backgroundColor: hidden ? 'transparent' : lit ? on : C.line }} />;
  return (
    <View accessible accessibilityLabel={`${statusText(status)}. ${done} of 4 steps done.`} style={{ flexDirection: 'row' }}>
      {STEPS.map((label, i) => (
        <View key={label} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
            {line(i < done, i === 0)}
            <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: i < done ? on : C.line, backgroundColor: i < done ? on : C.white }} />
            {line(i + 1 < done, i === STEPS.length - 1)}
          </View>
          <Text style={{ fontSize: 12.5, color: i < done ? C.ink : C.muted, fontWeight: i < done ? '600' : '400' }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}
