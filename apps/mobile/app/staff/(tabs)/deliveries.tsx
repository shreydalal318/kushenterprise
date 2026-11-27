import { useState } from 'react';
import { Linking, View } from 'react-native';
import { formatDate } from '@kush/core';
import { readableError } from '@/components/errors';
import { Alert, Button, Card, Empty, Field, Loading, P, Row, Screen, Small } from '@/components/ui';
import { rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** For delivery staff: today's drops with the address (open in Maps), a call button and proof of delivery. */
export default function MyDeliveries() {
  const utils = trpc.useUtils();
  const q = trpc.deliveries.mine.useQuery(undefined, { refetchInterval: 60_000 });
  const [open, setOpen] = useState<string | null>(null);
  const [receivedBy, setReceivedBy] = useState('');
  const m = trpc.orders.markDelivered.useMutation({ onSuccess: () => { setOpen(null); setReceivedBy(''); void utils.deliveries.invalidate(); } });
  if (!q.data) return q.error ? <Screen><Alert>{readableError(q.error)}</Alert></Screen> : <Loading />;
  return (
    <Screen>
      {q.data.length === 0 && <Empty>Nothing to deliver right now.</Empty>}
      {q.data.map((d) => (
        <Card key={d.dispatchId}>
          <P style={{ fontWeight: '700', color: C.navy }}>{d.customer}</P>
          <Small>{d.orderNumber} · {d.units} unit(s){d.surgeryDate ? ` · surgery ${formatDate(d.surgeryDate)}` : ''}</Small>
          <P>{d.address}</P>
          {d.invoice && <Small>Invoice {d.invoice.number} · {rupees(d.invoice.total)}{d.invoice.due > 0 ? ` · due ${rupees(d.invoice.due)}` : ' · paid'}</Small>}
          {d.note && <Small>Note: {d.note}</Small>}
          <Row>
            <View style={{ flex: 1 }}><Button variant="secondary" title="Map" onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.address)}`)} /></View>
            {d.phone && <View style={{ flex: 1 }}><Button variant="secondary" title="Call" onPress={() => void Linking.openURL(`tel:${d.phone}`)} /></View>}
          </Row>
          {open === d.orderId ? (
            <View style={{ gap: 8 }}>
              <Field label="Received by" placeholder="e.g. Sister Mary, OT store" value={receivedBy} onChangeText={setReceivedBy} maxLength={80} />
              {m.error && <Alert>{readableError(m.error)}</Alert>}
              <Button title="Confirm delivered" loading={m.isPending} disabled={receivedBy.trim().length < 2} onPress={() => m.mutate({ id: d.orderId, receivedBy: receivedBy.trim() })} />
              <Button variant="secondary" title="Cancel" onPress={() => setOpen(null)} />
            </View>
          ) : <Button title="Delivered" onPress={() => { setOpen(d.orderId); setReceivedBy(''); m.reset(); }} />}
        </Card>
      ))}
    </Screen>
  );
}
