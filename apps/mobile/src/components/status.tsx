import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { daysUntil, formatDate, istDateString } from '@kush/core';
import { C } from '@/lib/theme';
import { Badge, Small } from './ui';

/** Same as StaffStatusBadge: one set of words and colours everywhere. */
export const OrderStatusBadge = ({ status }: { status: string }) => <StaffStatusBadge status={status} />;

/**
 * Staff see four words for four steps. The server's Placed / Confirmed / Packed mean nothing to someone
 * who just wants to know what to do next: the tax invoice is what packs an order, so Packed = Invoiced.
 */
const STAFF_WORD: Record<string, string> = { PLACED: 'New', CONFIRMED: 'New', PACKED: 'Invoiced', DISPATCHED: 'Dispatched', DELIVERED: 'Delivered', ON_HOLD: 'On hold', CANCELLED: 'Cancelled' };
export const staffStatus = (s: string) => STAFF_WORD[s] ?? '';
export const STEPS = ['Order', 'Invoice', 'Dispatch', 'Done'] as const;
const STEP: Record<string, number> = { PLACED: 1, CONFIRMED: 1, PACKED: 2, DISPATCHED: 3, DELIVERED: 4 };
/** Steps reached, 1–4; 0 for an order on hold or cancelled, which is off the line. */
export const stepOf = (s: string) => STEP[s] ?? 0;
export const StaffStatusBadge = ({ status }: { status: string }) => <Badge label={staffStatus(status)} tone={status === 'DELIVERED' ? 'ok' : stepOf(status) ? 'teal' : 'neutral'} />;

/** ●──●──○──○ Order · Invoice · Dispatch · Done. On hold and cancelled have no place on it: a grey word instead. */
export function StepDots({ status }: { status: string }) {
  const at = stepOf(status);
  if (!at) return <Badge label={staffStatus(status)} tone="neutral" />;
  const line = (on: boolean, hidden: boolean) => <View style={{ flex: 1, height: 2, backgroundColor: hidden ? 'transparent' : on ? C.teal700 : C.line }} />;
  return (
    <View accessible accessibilityLabel={`${staffStatus(status)}, step ${at} of 4`} style={{ flexDirection: 'row' }}>
      {STEPS.map((label, i) => (
        <View key={label} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
            {line(i < at, i === 0)}
            <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: i < at ? C.teal700 : C.line, backgroundColor: i < at ? C.teal700 : C.white }} />
            {line(i + 1 < at, i === STEPS.length - 1)}
          </View>
          <Text style={{ fontSize: 12.5, color: i < at ? C.navy : C.muted, fontWeight: i + 1 === at ? '700' : '500' }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Days from today (IST) to a surgery date; negative once it has passed. */
export const surgeryIn = (date: string) => daysUntil(date, istDateString());
export const surgeryText = (date: string) => {
  const d = surgeryIn(date);
  return d < 0 ? `Surgery was ${formatDate(date)}` : d === 0 ? 'Surgery today' : d === 1 ? 'Surgery tomorrow' : `Surgery in ${d} days`;
};
/** Red for today, tomorrow or already past; amber within 3 days. A delivered order is no longer urgent. */
export const surgeryTone = (date: string, done = false) => { const d = surgeryIn(date); return done ? 'neutral' : d <= 1 ? 'danger' : d <= 3 ? 'warn' : 'neutral'; };
export function SurgeryChip({ date, done }: { date: string | null; done?: boolean }) {
  if (!date) return null;
  const tone = surgeryTone(date, done);
  const [bg, fg] = tone === 'danger' ? [C.danger50, C.danger] : tone === 'warn' ? [C.warn50, C.warn] : [C.canvas, C.muted];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Ionicons name="medkit-outline" size={14} color={fg} />
      <Text style={{ color: fg, fontSize: 13, fontWeight: '700' }}>{surgeryText(date)}</Text>
    </View>
  );
}

/** Who handles an order. Only an open order with nobody on it is a warning; a closed one simply shows nothing. */
export const HandlerTag = ({ name, open = true, you = false }: { name: string | null; open?: boolean; you?: boolean }) => (name ? <Small>Handled by {you ? 'you' : name}</Small> : open ? <Badge label="Not assigned" tone="warn" /> : null);
const STOCK: Record<string, [string, 'ok' | 'warn' | 'neutral']> = { AVAILABLE: ['Available', 'ok'], LIMITED: ['Limited', 'warn'], ON_REQUEST: ['On request', 'neutral'] };
export const StockBadge = ({ stock }: { stock: string }) => <Badge label={(STOCK[stock] ?? STOCK.ON_REQUEST!)[0]} tone={(STOCK[stock] ?? STOCK.ON_REQUEST!)[1]} />;
const PAY: Record<string, [string, 'ok' | 'warn' | 'danger' | 'neutral']> = { PAID: ['Paid', 'ok'], PARTLY_PAID: ['Part paid', 'warn'], UNPAID: ['Unpaid', 'neutral'], OVERDUE: ['Overdue', 'danger'], CANCELLED: ['Cancelled', 'neutral'] };
export const PayBadge = ({ status }: { status: string }) => <Badge label={(PAY[status] ?? [status, 'neutral'])[0]} tone={(PAY[status] ?? [status, 'neutral'])[1] as 'neutral'} />;
export const LENS_TYPE_LABEL: Record<string, string> = { MONOFOCAL: 'Monofocal', TORIC: 'Toric', MULTIFOCAL: 'Multifocal', EDOF: 'EDOF' };
export const fmtPower = (p: number) => `${p > 0 ? '+' : ''}${p.toFixed(2)}`;
