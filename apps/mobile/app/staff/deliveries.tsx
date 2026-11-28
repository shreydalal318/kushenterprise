import { useState } from 'react';
import { Linking, Pressable, SectionList, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDateTime } from '@kush/core';
import { EmptyCard, Failed, Hint, ListShell, Muted, SearchBox } from '@/components/sales/common';
import { StaffStatusBadge, SurgeryChip } from '@/components/status';
import { Alert, Button, Card, Field, LinkButton, Loading, P, Row } from '@/components/ui';
import { useAuth, useCan } from '@/lib/auth';
import { errorText, rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type Mine = RouterOutputs['deliveries']['mine'][number];
interface Item {
  dispatchId: string; orderId: string; orderNumber: string; customer: string; address: string; invoice: string | null;
  pickup: boolean; person: string | null; personId: string | null; mobile: string | null; since: Date | null;
  /** Filled in when it was handed to me: phone, how many items, amount to collect. */
  mine?: Mine;
}
interface Group { key: string; title: string; icon: keyof typeof Ionicons.glyphMap; mobile: string | null; data: Item[] }

const openMaps = (address: string) => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`).catch(() => {});
const call = (phone: string) => void Linking.openURL(`tel:${phone}`).catch(() => {});

/**
 * Like the website's Deliveries page: everything out with our own delivery staff, person by person
 * (what was handed to me first), and orders waiting for the customer to collect. "Mark delivered"
 * asks who received it; only someone with the order-status permission, or the person it was handed to, may.
 */
export default function Deliveries() {
  const { me } = useAuth();
  const can = useCan();
  const utils = trpc.useUtils();
  const seesBoard = can('VIEW_ORDERS');
  const board = trpc.deliveries.board.useQuery(undefined, { enabled: seesBoard, refetchInterval: 60_000 });
  const mine = trpc.deliveries.mine.useQuery(undefined, { refetchInterval: 60_000 });
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [receivedBy, setReceivedBy] = useState('');
  const [note, setNote] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const deliver = trpc.orders.markDelivered.useMutation();

  const main = seesBoard ? board : mine;
  const refresh = () => { setPulling(true); void Promise.all([mine.refetch(), seesBoard ? board.refetch() : null]).finally(() => setPulling(false)); };
  const title = <Stack.Screen options={{ title: 'Deliveries' }} />;
  if (!main.data || (seesBoard && !mine.data && !mine.error)) {
    return main.error ? <ListShell>{title}<Failed padded error={main.error} busy={main.isFetching} onRetry={() => void main.refetch()} /></ListShell> : <>{title}<Loading /></>;
  }

  // Everything out, from the board; what was handed to me also carries the address, phone and amount due.
  const mineById = new Map((mine.data ?? []).map((d) => [d.dispatchId, d]));
  const items: Item[] = (board.data ?? []).map((d) => ({
    dispatchId: d.dispatchId, orderId: d.orderId, orderNumber: d.orderNumber, customer: d.customer, address: mineById.get(d.dispatchId)?.address || d.address,
    invoice: d.invoice, pickup: d.method === 'PICKUP', person: d.person, personId: d.personId, mobile: d.mobile, since: d.since, mine: mineById.get(d.dispatchId),
  }));
  for (const d of mine.data ?? []) {
    if (items.some((x) => x.dispatchId === d.dispatchId)) continue;
    items.push({ dispatchId: d.dispatchId, orderId: d.orderId, orderNumber: d.orderNumber, customer: d.customer, address: d.address, invoice: d.invoice?.number ?? null, pickup: false, person: me?.name ?? null, personId: me?.id ?? null, mobile: null, since: null, mine: d });
  }
  const term = search.trim().toLowerCase();
  const shown = term ? items.filter((x) => `${x.orderNumber} ${x.customer} ${x.address} ${x.person ?? ''} ${x.invoice ?? ''}`.toLowerCase().includes(term)) : items;

  const groups = new Map<string, Group>();
  for (const x of shown) {
    const you = !x.pickup && !!me && (x.personId === me.id || !!x.mine);
    const key = x.pickup ? '~pickup' : you ? '!you' : x.person ? `p:${x.person}` : '~~nobody';
    const g = groups.get(key) ?? {
      key, mobile: you || x.pickup ? null : x.mobile, icon: x.pickup ? 'storefront-outline' : 'bicycle-outline',
      title: x.pickup ? 'Waiting for the customer to collect' : you ? 'Given to you to deliver' : x.person ?? 'No delivery person written',
      data: [],
    };
    g.data.push(x);
    groups.set(key, g);
  }
  // Mine first, then each person by name, then pickups, then anything without a name.
  const sections = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
  // Strict: something with one of our staff is theirs to mark delivered (the owner can step in); pickups by anyone allowed.
  const mayDeliver = (x: Item) => !!x.mine || (x.personId ? !!me && (me.role === 'OWNER' || x.personId === me.id) : can('UPDATE_ORDER_STATUS'));
  const startDeliver = (x: Item) => { setOpen(x.dispatchId); setReceivedBy(''); setNote(''); setFlash(null); deliver.reset(); };
  const save = (x: Item) => deliver.mutate({ id: x.orderId, receivedBy: receivedBy.trim() || null, note: note.trim() || null }, {
    onSuccess: (_r, v) => {
      setFlash(`${x.orderNumber} delivered ✓${v.receivedBy ? ` Received by ${v.receivedBy}.` : ''}`);
      setOpen(null); setReceivedBy(''); setNote('');
      void utils.deliveries.invalidate(); void utils.orders.invalidate();
    },
  });

  return (
    <ListShell top={items.length > 5 ? <SearchBox value={search} onChange={setSearch} placeholder="Search order, customer or person" /> : undefined}>
      {title}
      <SectionList sections={sections} keyExtractor={(x) => x.dispatchId} stickySectionHeadersEnabled={false} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 12, gap: 10 }} refreshing={pulling} onRefresh={refresh}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            {!!flash && <Alert tone="ok">{flash}</Alert>}
            {seesBoard && mine.error && <Alert>{`Couldn’t load what was given to you. ${errorText(mine.error)}`}</Alert>}
            <Muted>{seesBoard ? 'Orders out with our own delivery staff, and orders waiting for the customer to collect.' : 'Orders handed to you to deliver.'}</Muted>
          </View>
        }
        ListEmptyComponent={term
          ? <EmptyCard icon="search-outline" title={`Nothing matches “${search.trim()}”`} hint="Check the order number or the name." />
          : <EmptyCard icon="bicycle-outline" title="Nothing is out right now" hint="Orders show up here when they are sent with our delivery staff or kept for the customer to collect." />}
        renderSectionHeader={({ section: g }) => (
          <Row style={{ justifyContent: 'space-between', minHeight: 44, marginTop: 6 }}>
            <Row style={{ flex: 1 }}>
              <Ionicons name={g.icon} size={20} color={C.teal700} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy, flexShrink: 1 }}>{g.title}</Text>
              <View style={{ minWidth: 26, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: C.aqua100 }}><Text style={{ color: C.navy, fontWeight: '700', textAlign: 'center', fontSize: 15 }}>{g.data.length}</Text></View>
            </Row>
            {!!g.mobile && <LinkButton title={`Call ${g.mobile}`} icon={<Ionicons name="call-outline" size={18} color={C.teal700} />} onPress={() => call(g.mobile!)} />}
          </Row>
        )}
        renderItem={({ item: x }) => (
          <Card>
            <Pressable accessibilityRole={seesBoard ? 'button' : undefined} accessibilityLabel={`Order ${x.orderNumber}, ${x.customer}`} disabled={!seesBoard} onPress={() => router.push(`/staff/order/${x.orderId}`)} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <P style={{ fontWeight: '700', color: C.navy }}>{x.orderNumber}</P>
                <StaffStatusBadge status="DISPATCHED" />
              </Row>
              <Row style={{ alignItems: 'flex-start' }}>
                <P style={{ flex: 1, fontWeight: '600' }}>{x.customer}</P>
                {seesBoard && <Ionicons name="chevron-forward" size={18} color={C.muted} />}
              </Row>
              {!!x.mine?.contact && <Muted>Ask for {x.mine.contact}</Muted>}
            </Pressable>
            <SurgeryChip date={x.mine?.surgeryDate ?? null} />
            {!!x.address && (
              <Pressable accessibilityRole="link" accessibilityLabel={`Open ${x.address} in Maps`} onPress={() => openMaps(x.address)}
                style={({ pressed }) => ({ flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, minHeight: 44, borderRadius: R.md, backgroundColor: pressed ? C.aqua100 : C.aqua50 })}>
                <Ionicons name="location-outline" size={20} color={C.teal700} />
                <View style={{ flex: 1 }}><P>{x.address}</P><Text style={{ color: C.teal700, fontWeight: '700', fontSize: 15 }}>Open in Maps</Text></View>
              </Pressable>
            )}
            {x.mine && <P>{x.mine.units} item{x.mine.units === 1 ? '' : 's'}{x.mine.invoice ? ` · ${x.mine.invoice.due > 0 ? `collect ${rupees(x.mine.invoice.due)}` : 'already paid'}` : ''}</P>}
            {!!x.mine?.note && <Muted>Note: {x.mine.note}</Muted>}
            {!!(x.since || x.invoice) && <Muted>{[x.since ? `${x.pickup ? 'Ready since' : 'Out since'} ${formatDateTime(x.since)}` : null, x.invoice ? `invoice ${x.invoice}` : null].filter(Boolean).join(' · ')}</Muted>}
            {!!x.mine?.phone && <LinkButton title={`Call ${x.mine.phone}`} icon={<Ionicons name="call-outline" size={18} color={C.teal700} />} onPress={() => call(x.mine!.phone!)} />}
            {mayDeliver(x) && (open === x.dispatchId ? (
              <View style={{ gap: 8 }}>
                <Field label={x.pickup ? 'Collected by (optional)' : 'Received by (optional)'} placeholder="e.g. Sister Mary, OT store" value={receivedBy} onChangeText={setReceivedBy} maxLength={80} />
                <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={300} />
                {deliver.error && <Alert>{errorText(deliver.error)}</Alert>}
                <Button title="Mark delivered" loading={deliver.isPending} onPress={() => save(x)} />
                <LinkButton tone="muted" title="Back" disabled={deliver.isPending} onPress={() => setOpen(null)} />
              </View>
            ) : <Button variant="secondary" title="Mark delivered" icon={<Ionicons name="checkmark-done-outline" size={18} color={C.ink} />} onPress={() => startDeliver(x)} />)}
          </Card>
        )} />
    </ListShell>
  );
}
