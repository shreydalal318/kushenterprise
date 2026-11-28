import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, istDateString } from '@kush/core';
import { Grid, Stat } from '@/components/admin/bits';
import { StaffStatusBadge, SurgeryChip, surgeryIn } from '@/components/status';
import { Alert, Button, Card, H2, Loading, P, Small } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorText, rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

type Icon = keyof typeof Ionicons.glyphMap;
// The same lists the Orders tab asks for, so both read one cache and always agree.
const OPEN = ['TO_INVOICE', 'PACKED', 'DISPATCHED', 'ON_HOLD'] as const;
const greeting = () => { const h = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' })); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

/** One line with a count; tapping it opens the list behind the number. */
function Line({ icon, label, value, warn, onPress }: { icon: Icon; label: string; value: string | number; warn?: boolean; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} disabled={!onPress} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={20} color={warn ? C.warn : C.teal700} />
      <Text style={{ flex: 1, fontSize: 16, color: C.ink }}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: warn ? C.warn : C.navy }}>{value}</Text>
      {!!onPress && <Ionicons name="chevron-forward" size={16} color={C.muted} />}
    </Pressable>
  );
}

/**
 * The owner's first screen: today's orders and sales, what is pending (surgery soon first), stock and
 * money, at a glance. Every number opens the list behind it; Orders is the next tab.
 */
export function OwnerHome() {
  const { me } = useAuth();
  const home = trpc.analytics.home.useQuery(undefined, { refetchInterval: 5 * 60_000 });
  const open = trpc.useQueries((t) => OPEN.map((status) => t.orders.list({ status }, { refetchInterval: 60_000 })));
  const [pulling, setPulling] = useState(false);
  const refresh = () => { setPulling(true); void Promise.all([home.refetch(), ...open.map((x) => x.refetch())]).finally(() => setPulling(false)); };

  const orders = open.flatMap((x) => x.data ?? []);
  const ordersLoaded = open.every((x) => x.data);
  const count = (...statuses: string[]) => orders.filter((o) => statuses.includes(o.status)).length;
  const soon = orders.filter((o) => !!o.surgeryDate && surgeryIn(o.surgeryDate) <= 3).sort((a, b) => a.surgeryDate!.localeCompare(b.surgeryDate!));
  const notAssigned = orders.filter((o) => !o.assignedTo).length;
  const toOrders = () => router.push('/staff/orders');
  const d = home.data?.owner;
  const t = d?.tiles;
  const change = t && t.prevMonthToDate.sales ? Math.round(((t.month.sales - t.prevMonthToDate.sales) / Math.abs(t.prevMonthToDate.sales)) * 100) : null;
  const error = home.error ?? open.find((x) => x.error)?.error;

  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={pulling} onRefresh={refresh} />}>
        <View>
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.navy }}>{`${greeting()}${me?.name && me.name !== 'Owner' ? `, ${me.name.split(' ')[0]}` : ''}`}</Text>
          <Small>{formatDate(istDateString())} · pull down to refresh</Small>
        </View>
        {!!error && <Alert>{errorText(error)}</Alert>}
        {!!error && <Button variant="secondary" title="Try again" onPress={refresh} />}

        {!t ? (!error && <Loading />) : (
          <Grid>
            <Stat label="Orders today" value={String(t.today.orders)} sub={t.today.orders === 1 ? 'new order' : 'new orders'} onPress={toOrders} />
            <Stat label="Sales today" value={rupees(t.today.sales)} sub={`${t.today.invoices} invoice${t.today.invoices === 1 ? '' : 's'}`} onPress={() => router.push('/staff/invoices')} />
            <Stat label="This month" value={rupees(t.month.sales)} sub={change == null ? undefined : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% vs last month`} subTone={change == null ? undefined : change >= 0 ? C.ok : C.danger} onPress={() => router.push('/staff/reports')} />
            <Stat label="Money owed to us" value={rupees(d!.outstanding)} sub={d!.overdue > 0 ? `${rupees(d!.overdue)} overdue` : 'Nothing overdue'} subTone={d!.overdue > 0 ? C.danger : undefined} onPress={() => router.push('/staff/payments')} />
          </Grid>
        )}

        <Card style={{ gap: 0 }}>
          <H2>Pending orders</H2>
          {!ordersLoaded ? <Loading /> : (
            <>
              <Line icon="medkit-outline" label="Surgery in the next 3 days" value={soon.length} warn={soon.length > 0} onPress={toOrders} />
              <Line icon="person-add-outline" label="Not assigned" value={notAssigned} warn={notAssigned > 0} onPress={toOrders} />
              <Line icon="receipt-outline" label="New (to invoice)" value={count('PLACED', 'CONFIRMED')} onPress={toOrders} />
              <Line icon="cube-outline" label="Invoiced (to dispatch)" value={count('PACKED')} onPress={toOrders} />
              <Line icon="bicycle-outline" label="Dispatched (on the way)" value={count('DISPATCHED')} onPress={() => router.push('/staff/deliveries')} />
              <Line icon="pause-circle-outline" label="On hold" value={count('ON_HOLD')} onPress={toOrders} />
            </>
          )}
        </Card>

        {soon.length > 0 && (
          <Card style={{ gap: 0 }}>
            <H2>Surgery soon</H2>
            {soon.slice(0, 5).map((o) => (
              <Pressable key={o.id} accessibilityRole="button" accessibilityLabel={`Order ${o.number}, ${o.customer.name}`} onPress={() => router.push(`/staff/order/${o.id}`)}
                style={({ pressed }) => ({ gap: 4, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <P style={{ flex: 1, fontWeight: '700' }} numberOfLines={1}>{o.customer.name}</P>
                  <StaffStatusBadge status={o.status} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <SurgeryChip date={o.surgeryDate} />
                  <Small>{o.number}{o.assignedTo ? ` · ${o.assignedTo}` : ' · not assigned'}</Small>
                </View>
              </Pressable>
            ))}
            {soon.length > 5 && <Line icon="list-outline" label="See all in Orders" value={soon.length} onPress={toOrders} />}
          </Card>
        )}

        {!!d && (
          <Card style={{ gap: 0 }}>
            <H2>Stock</H2>
            <Line icon="trending-down-outline" label="Low stock" value={d.stock.lowCount} warn={d.stock.lowCount > 0} onPress={() => router.push('/staff/stock-reports/low')} />
            <Line icon="close-circle-outline" label="Out of stock" value={d.stock.outCount} warn={d.stock.outCount > 0} onPress={() => router.push('/staff/stock-reports/low')} />
            <Line icon="time-outline" label={`Expiring in ${d.stock.expiryWindowDays} days (units)`} value={d.stock.expiringUnits} onPress={() => router.push('/staff/stock-reports/expiring')} />
            {d.stock.expiredUnits > 0 && <Alert tone="danger">{`${d.stock.expiredUnits} expired unit${d.stock.expiredUnits === 1 ? ' is' : 's are'} still on the shelf.`}</Alert>}
          </Card>
        )}

        {!!d && d.topOverdue.length > 0 && (
          <Card style={{ gap: 0 }}>
            <H2>Most overdue</H2>
            {d.topOverdue.slice(0, 3).map((c) => (
              <Line key={c.customerId} icon="alert-circle-outline" label={c.name} value={rupees(c.overdue)} warn onPress={() => router.push(`/staff/customers/${c.customerId}/statement`)} />
            ))}
          </Card>
        )}
        <Button variant="secondary" title="All sales & reports" icon={<Ionicons name="bar-chart-outline" size={18} color={C.ink} />} onPress={() => router.push('/staff/reports')} />
      </ScrollView>
      <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white }}>
        <Button title="New order" icon={<Ionicons name="add" size={22} color={C.white} />} onPress={() => router.push('/staff/new-order')} />
      </View>
    </View>
  );
}
