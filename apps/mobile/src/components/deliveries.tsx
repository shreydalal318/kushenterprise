import { useState } from 'react';
import { FlatList, Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { readableError } from '@/components/errors';
import { SurgeryChip } from '@/components/status';
import { Alert, Button, Card, Field, LinkButton, Loading, P, Row, Small } from '@/components/ui';
import { errorText, rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

const openMaps = (address: string) => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);

/** For delivery staff (no order access): what to deliver, the address (opens Maps), a call button and who received it. */
export function MyDeliveries() {
  const utils = trpc.useUtils();
  const q = trpc.deliveries.mine.useQuery(undefined, { refetchInterval: 60_000 });
  const [open, setOpen] = useState<string | null>(null);
  const [receivedBy, setReceivedBy] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const m = trpc.orders.markDelivered.useMutation({ onSuccess: (_r, v) => {
    const d = q.data?.find((x) => x.orderId === v.id);
    setDone(`${d?.orderNumber ?? 'Order'} delivered ✓ Received by ${v.receivedBy}.`);
    setOpen(null); setReceivedBy(''); void utils.deliveries.invalidate();
  } });
  if (!q.data) return q.error
    ? <View style={{ padding: 16, gap: 12 }}><Alert>{errorText(q.error)}</Alert><Button variant="secondary" title="Try again" loading={q.isFetching} onPress={() => void q.refetch()} /></View>
    : <Loading />;
  return (
    <FlatList data={q.data} keyExtractor={(d) => d.dispatchId} style={{ backgroundColor: C.canvas }} contentContainerStyle={{ padding: 12, gap: 10 }} keyboardShouldPersistTaps="handled"
      refreshing={pulling} onRefresh={() => { setPulling(true); void q.refetch().finally(() => setPulling(false)); }}
      ListHeaderComponent={done ? <Alert tone="ok">{done}</Alert> : undefined}
      ListEmptyComponent={
        <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
          <Ionicons name="bicycle-outline" size={36} color={C.teal700} />
          <P style={{ fontWeight: '700' }}>Nothing to deliver right now</P>
          <Small style={{ textAlign: 'center' }}>When someone gives you an order to deliver, it shows up here.</Small>
        </Card>
      }
      renderItem={({ item: d }) => (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <P style={{ fontWeight: '700', color: C.navy, flex: 1 }}>{d.customer}</P>
            <Small>{d.orderNumber}</Small>
          </Row>
          {!!d.contact && <Small>Ask for {d.contact}</Small>}
          <SurgeryChip date={d.surgeryDate} />
          {!!d.address && (
            <Pressable accessibilityRole="link" accessibilityLabel={`Open ${d.address} in Maps`} onPress={() => openMaps(d.address)}
              style={({ pressed }) => ({ flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: R.md, backgroundColor: pressed ? C.aqua100 : C.aqua50 })}>
              <Ionicons name="location-outline" size={20} color={C.teal700} />
              <View style={{ flex: 1 }}><P>{d.address}</P><Text style={{ color: C.teal700, fontWeight: '700', fontSize: 13 }}>Open in Maps</Text></View>
            </Pressable>
          )}
          <P>{d.units} item{d.units === 1 ? '' : 's'}{d.invoice ? ` · ${d.invoice.due > 0 ? `amount due ${rupees(d.invoice.due)}` : 'paid'}` : ''}</P>
          {!!d.note && <Small>Note: {d.note}</Small>}
          {!!d.phone && <LinkButton title={`Call ${d.phone}`} icon={<Ionicons name="call-outline" size={18} color={C.teal700} />} onPress={() => void Linking.openURL(`tel:${d.phone}`)} />}
          {open === d.orderId ? (
            <View style={{ gap: 8 }}>
              <Field label="Received by (name)" placeholder="e.g. Sister Mary, OT store" value={receivedBy} onChangeText={setReceivedBy} maxLength={80} autoFocus />
              {m.error && <Alert>{readableError(m.error)}</Alert>}
              {receivedBy.trim().length < 2 && <Small style={{ textAlign: 'center' }}>Write who took the parcel, then tap Mark delivered.</Small>}
              <Button title="Mark delivered" loading={m.isPending} disabled={receivedBy.trim().length < 2} onPress={() => m.mutate({ id: d.orderId, receivedBy: receivedBy.trim() })} />
              <LinkButton tone="muted" title="Back" onPress={() => setOpen(null)} />
            </View>
          ) : <Button title="Mark delivered" onPress={() => { setOpen(d.orderId); setReceivedBy(''); setDone(null); m.reset(); }} />}
        </Card>
      )} />
  );
}
