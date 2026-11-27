import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Alert, Badge, Button, Card, H2, P, Row, s, Screen, Small } from '@/components/ui';
import { useAuth, useCan } from '@/lib/auth';
import { discard, useOutbox } from '@/lib/outbox';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

const STATUS: Record<string, [string, 'ok' | 'warn' | 'danger' | 'teal']> = { IN_STOCK: ['In stock', 'ok'], LOW_STOCK: ['Low', 'warn'], OUT_OF_STOCK: ['Out', 'danger'], EXPIRING_SOON: ['Expiring soon', 'teal'] };

/** Scan and receive, stock check, offline queue, notifications and account. */
export default function More() {
  const { me, signOut } = useAuth();
  const can = useCan();
  const [q, setQ] = useState('');
  const stock = trpc.inventory.overview.useQuery({ q: q || undefined }, { enabled: q.length >= 2 });
  const unread = trpc.notifications.unreadCount.useQuery();
  const outbox = useOutbox();
  return (
    <Screen>
      <Row style={{ gap: 10 }}>
        <Button style={{ flex: 1 }} variant="secondary" title="Scan a barcode" onPress={() => router.push('/staff/scan')} />
        {can('MANAGE_STOCK') && <Button style={{ flex: 1 }} variant="secondary" title="Receive goods" onPress={() => router.push('/staff/receive')} />}
      </Row>
      <H2>Stock check</H2>
      <TextInput accessibilityLabel="Search stock" value={q} onChangeText={setQ} placeholder="Product name or code" style={s.input} placeholderTextColor="#9aa5b1" />
      {stock.data?.slice(0, 20).map((r) => (
        <Card key={r.productId}>
          <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700', flex: 1 }}>{r.name}</P><Badge label={STATUS[r.status]?.[0] ?? r.status} tone={STATUS[r.status]?.[1] ?? 'teal'} /></Row>
          <Small>{r.code} · {r.qty} {r.unit}{r.isLens ? ` · ${r.variantsInStock} of ${r.variantCount} powers in stock` : ''}</Small>
        </Card>
      ))}
      {outbox.length > 0 && (
        <Card style={{ borderColor: C.warn }}>
          <H2>Waiting to send ({outbox.length})</H2>
          {outbox.map((o) => <View key={o.id}><P>{o.label}</P>{o.error ? <><Alert>{o.error}</Alert><Button variant="secondary" title="Discard" onPress={() => void discard(o.id)} /></> : <Small>Sends automatically when online</Small>}</View>)}
        </Card>
      )}
      <Button variant="secondary" title={`Notifications${unread.data ? ` (${unread.data} new)` : ''}`} onPress={() => router.push('/staff/notifications')} />
      <Card><P style={{ fontWeight: '700' }}>{me?.name}</P><Small>{me?.role === 'OWNER' ? 'Owner' : 'Employee'}{me?.email ? ` · ${me.email}` : ''}</Small></Card>
      <Button variant="danger" title="Sign out" onPress={() => void signOut().then(() => router.replace('/login'))} />
    </Screen>
  );
}
