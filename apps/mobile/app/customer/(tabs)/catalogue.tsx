import { useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Alert, Card, Loading, P, Row, s, Small } from '@/components/ui';
import { fmtPower, LENS_TYPE_LABEL, StockBadge } from '@/components/status';
import { rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

export default function CatalogueScreen() {
  const [q, setQ] = useState('');
  const [power, setPower] = useState('');
  const list = trpc.portal.catalogue.useQuery({ q: q || undefined, power: power === '' || Number.isNaN(Number(power)) ? undefined : Number(power) });
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <Row style={{ padding: 12, gap: 8 }}>
        <View style={{ flex: 1 }}><TextInput accessibilityLabel="Search products" value={q} onChangeText={setQ} placeholder="Search lens, brand, code" style={s.input} placeholderTextColor="#9aa5b1" /></View>
        <TextInput accessibilityLabel="Power (D)" value={power} onChangeText={setPower} placeholder="Power" keyboardType="numbers-and-punctuation" style={[s.input, { width: 90 }]} placeholderTextColor="#9aa5b1" />
      </Row>
      {list.isLoading && <Loading />}
      {list.error && !list.data && <View style={{ padding: 12 }}><Alert>No connection and nothing saved yet. Try again when you have signal.</Alert></View>}
      <FlatList data={list.data ?? []} keyExtractor={(p) => p.id} contentContainerStyle={{ padding: 12, gap: 10 }}
        ListEmptyComponent={list.data ? <P muted style={{ textAlign: 'center' }}>Nothing matches.</P> : undefined}
        renderItem={({ item: p }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={p.name} onPress={() => router.push(`/customer/product/${p.id}`)}>
            <Card>
              <View style={{ flex: 1, gap: 2 }}>
                <Small>{[p.brand ?? p.category, p.lensType && LENS_TYPE_LABEL[p.lensType], p.preloaded && 'Preloaded'].filter(Boolean).join(' · ')}</Small>
                <P style={{ fontWeight: '700', color: C.navy }} numberOfLines={2}>{p.name}</P>
                {p.powerRange && <Small>{fmtPower(p.powerRange.min)} to {fmtPower(p.powerRange.max)} D</Small>}
                <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700' }}>{rupees(p.price)}</P><StockBadge stock={p.stock} /></Row>
              </View>
            </Card>
          </Pressable>
        )} />
    </View>
  );
}
