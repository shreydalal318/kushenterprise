import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { readableError } from '@/components/errors';
import { Alert, Button, Card, Field, H2, Loading, P, Row, Screen } from '@/components/ui';
import { decimalText, FailedScreen, flashNext, NoAccess, Note, numOrNull, SearchBox, useDebounced, LoadingScreen } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

interface Entry { productId: string; code: string; name: string; supplierSku: string; rate: string }

/** Which products this supplier supplies, their code for each and the last price paid (web: Products supplied). */
export default function SupplierProducts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const utils = trpc.useUtils();
  const buyer = can('CREATE_PURCHASE_ORDERS');
  const q = trpc.suppliers.get.useQuery({ id: id! }, { enabled: buyer });
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const found = trpc.products.list.useQuery({ q: term }, { enabled: buyer && term.length > 0 });
  const save = trpc.suppliers.setProducts.useMutation();
  useEffect(() => {
    if (q.data && !rows) setRows(q.data.products.map((p) => ({ productId: p.productId, code: p.product.code, name: p.product.name, supplierSku: p.supplierSku ?? '', rate: p.lastPurchaseRate == null ? '' : String(p.lastPurchaseRate) })));
  }, [q.data, rows]);

  if (!buyer) return <NoAccess title="Products they supply">Changing a supplier’s products needs the “Create purchase orders” permission. Ask the owner.</NoAccess>;
  if (!q.data || !rows) return q.error ? <FailedScreen title="Products they supply" error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} /> : <LoadingScreen title="Products they supply" />;
  const s = q.data;
  const have = new Set(rows.map((r) => r.productId));
  const results = term ? (found.data ?? []).filter((p) => !have.has(p.id)).slice(0, 8) : [];
  const bad = rows.filter((r) => { const n = numOrNull(r.rate); return n != null && !Number.isFinite(n); });
  const update = (pid: string, p: Partial<Entry>) => setRows(rows.map((r) => (r.productId === pid ? { ...r, ...p } : r)));

  return (
    <Screen footer={
      <>
        {save.error && <Alert>{readableError(save.error)}</Alert>}
        {bad.length > 0 && <Note style={{ textAlign: 'center' }}>To save: write the price for {bad.map((r) => r.code).join(', ')} as a number.</Note>}
        <Button title={`Save ${rows.length} product${rows.length === 1 ? '' : 's'}`} loading={save.isPending} disabled={bad.length > 0}
          onPress={() => save.mutate({ supplierId: s.id, rows: rows.map((r) => ({ productId: r.productId, supplierSku: r.supplierSku.trim() || null, lastPurchaseRate: numOrNull(r.rate) })) }, {
            onSuccess: () => { void utils.suppliers.invalidate(); void utils.products.invalidate(); flashNext(`supplier:${s.id}`, 'Products saved ✓ They are suggested on purchase orders to this supplier.'); router.back(); },
          })} />
      </>
    }>
      <Stack.Screen options={{ title: 'Products they supply' }} />
      <Card>
        <H2>{s.name}</H2>
        <Note>Products linked here are suggested on purchase orders to {s.name}, at the last price paid.</Note>
      </Card>
      <Card>
        <H2>Add a product</H2>
        <SearchBox value={search} onChange={setSearch} placeholder="Find product: name or code" label="Find a product to add" />
        {!!term && found.isLoading && <Loading />}
        {!!term && found.data && !results.length && <Note>{(found.data ?? []).length ? 'Those products are already on the list.' : `No product matches “${term}”.`}</Note>}
        {results.map((p) => (
          <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Add ${p.name}`} onPress={() => { setRows([...rows, { productId: p.id, code: p.code, name: p.name, supplierSku: '', rate: '' }]); setSearch(''); }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, padding: 10, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: pressed ? C.aqua50 : C.white })}>
            <View style={{ flex: 1 }}><P style={{ fontWeight: '600' }} numberOfLines={2}>{p.name}</P><Note>{p.code}</Note></View>
            <Ionicons name="add-circle" size={24} color={C.teal700} />
            <Text style={{ color: C.teal700, fontWeight: '700', fontSize: 15 }}>Add</Text>
          </Pressable>
        ))}
      </Card>
      {!rows.length && <Card><Note style={{ textAlign: 'center' }}>No products yet. Find one above to add it.</Note></Card>}
      {rows.map((r) => (
        <Card key={r.productId}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><P style={{ fontWeight: '700' }}>{r.name}</P><Note>{r.code}</Note></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Take ${r.name} off the list`} onPress={() => setRows(rows.filter((x) => x.productId !== r.productId))} hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="trash-outline" size={22} color={C.muted} />
            </Pressable>
          </Row>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><Field label="Their code (optional)" autoCapitalize="characters" value={r.supplierSku} onChangeText={(x) => update(r.productId, { supplierSku: x })} maxLength={60} /></View>
            <View style={{ flex: 1 }}><Field label="Last price paid ₹" keyboardType="decimal-pad" value={r.rate} onChangeText={(x) => update(r.productId, { rate: decimalText(x) })} maxLength={12} /></View>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
