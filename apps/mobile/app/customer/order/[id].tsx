import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, formatDateTime, ORDER_FLOW, ORDER_STATUS_LABEL } from '@kush/core';
import { Alert, Button, Card, H2, KV, Loading, P, Row, Screen, Small } from '@/components/ui';
import { OrderStatusBadge } from '@/components/status';
import { docPath, openPdf } from '@/lib/documents';
import { errorCode, errorText, rupees } from '@/lib/format';
import { useReorder } from '@/lib/reorder';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

export default function OrderScreen() {
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const q = trpc.portal.order.useQuery({ id: id! });
  const reorder = useReorder();
  const [pulling, setPulling] = useState(false);
  const [pdfErr, setPdfErr] = useState<string | null>(null);
  if (!q.data) {
    if (!q.error) return <Loading />;
    return (
      <Screen>
        {errorCode(q.error) === 'NOT_FOUND' ? <Alert>Order not found.</Alert>
          : <><Alert>{errorText(q.error)}</Alert><Button variant="secondary" title="Try again" loading={q.isFetching} onPress={() => void q.refetch()} /></>}
      </Screen>
    );
  }
  const o = q.data;
  const at = (s: string) => o.events.filter((e) => e.status === s).at(-1)?.at;
  const held = o.events.filter((e) => e.status === 'ON_HOLD' || e.status === 'CANCELLED').at(-1);
  const refresh = () => { setPulling(true); void q.refetch().finally(() => setPulling(false)); };
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.canvas }}>
      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={pulling} onRefresh={refresh} colors={[C.teal700]} tintColor={C.teal700} />}>
        <View style={{ gap: 12, padding: 16 }}>
          <Stack.Screen options={{ title: o.number }} />
          {!!placed && <Alert tone="ok">Order placed. We will confirm it shortly; every update shows here and in your notifications.</Alert>}
          {q.error && <Alert tone="warn">{errorText(q.error)}</Alert>}
          <Row style={{ justifyContent: 'space-between' }}><Small>Placed {formatDateTime(o.createdAt)}</Small><OrderStatusBadge status={o.status} /></Row>
          {(o.status === 'ON_HOLD' || o.status === 'CANCELLED') && <Alert tone={o.status === 'ON_HOLD' ? 'warn' : 'danger'}>{o.status === 'ON_HOLD' ? 'On hold' : 'Cancelled'}{held?.note ? `: ${held.note}` : '.'}</Alert>}
          <Card>
            {ORDER_FLOW.map((s) => { const t = at(s); return (
              <Row key={s} style={{ gap: 10 }}>
                <Ionicons name={t ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={t ? C.teal : C.line} />
                <View style={{ flex: 1 }}><P style={{ fontWeight: t ? '700' : '400', color: t ? C.ink : C.muted }}>{ORDER_STATUS_LABEL[s]}</P>{t && <Small>{formatDateTime(t)}</Small>}</View>
              </Row>
            ); })}
          </Card>
          {o.dispatches.map((d, i) => (
            <Alert key={i} tone={d.deliveredAt ? 'ok' : 'info'}>
              {d.method === 'OWN_DELIVERY' ? `Out for delivery${d.person ? ` with ${d.person}${d.personMobile ? ` (${d.personMobile})` : ''}` : ''}` : d.method === 'PICKUP' ? 'Ready for pickup at our store' : `Sent${d.courier ? ` via ${d.courier}` : ''}${d.docketNo ? `, ${d.method === 'TRANSPORT' ? 'LR' : 'docket'} ${d.docketNo}` : ''}`}
              {d.date ? ` · ${formatDate(d.date)}` : ''}{d.deliveredAt ? `\nDelivered${d.receivedBy ? `, received by ${d.receivedBy}` : ''}` : ''}
            </Alert>
          ))}
          <H2>Items</H2>
          <Card>
            {o.lines.map((l) => (
              <Row key={l.id} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}><P>{l.name}</P><Small>{l.label ?? ''} · {rupees(l.rate)}</Small></View>
                <View style={{ alignItems: 'flex-end' }}><P style={{ fontWeight: '700' }}>{l.qty}</P>{l.backorder > 0 && o.status !== 'PLACED' && o.status !== 'CANCELLED' && <Small style={{ color: C.warn }}>{l.backorder} to come</Small>}</View>
              </Row>
            ))}
          </Card>
          {(o.patientName || o.surgeryDate || o.shipTo) && (
            <Card>
              {o.shipTo && <KV k="Deliver to" v={o.shipTo.addressLines[0] ?? o.shipTo.name} />}
              {o.patientName && <KV k="Patient" v={o.patientName} />}
              {o.surgeryDate && <KV k="Surgery" v={formatDate(o.surgeryDate)} />}
            </Card>
          )}
          <H2>Invoices</H2>
          {pdfErr && <Alert>{pdfErr}</Alert>}
          {o.invoices.length === 0 ? <Small>The tax invoice appears here once your order is packed.</Small> : o.invoices.map((i) => (
            <Button key={i.id} variant="secondary" title={`${i.number} · ${rupees(i.total)} (PDF)`} onPress={() => { setPdfErr(null); openPdf(docPath('invoice', i.id), `${i.number}.pdf`).catch((e) => setPdfErr(errorText(e))); }} />
          ))}
          {reorder.error && <Alert>{reorder.error}</Alert>}
          <Button variant="secondary" title="Order the same again" loading={reorder.pending === o.id} disabled={!!reorder.pending} onPress={() => void reorder.run(o.id)} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
