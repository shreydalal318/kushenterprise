import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LENS_TYPE_LABELS, LENS_TYPES, formatPower, type LensType } from '@kush/core';
import { Badge, Button, Card, Field, LinkButton, Loading, P, Row } from '@/components/ui';
import { Check, decimalText, EmptyCard, Failed, ListScreen, Note, PickList, Pills, SearchBox, TapCard, useDebounced } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Every product with search and filters (web: Products). Tap one for its powers, prices, stock and barcodes. */
export default function Products() {
  const can = useCan();
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const [showFilters, setShowFilters] = useState(false);
  const [f, setF] = useState({ categoryId: null as string | null, brandId: null as string | null, lensType: null as LensType | null, power: '', includeInactive: false });
  const [pulling, setPulling] = useState(false);
  const categories = trpc.settings.categories.useQuery();
  const brands = trpc.brands.list.useQuery();
  const power = f.power.trim() === '' ? undefined : Number(f.power);
  const q = trpc.products.list.useQuery({
    q: term || undefined, categoryId: f.categoryId ?? undefined, brandId: f.brandId ?? undefined, lensType: f.lensType ?? undefined,
    power: power !== undefined && Number.isFinite(power) ? power : undefined, includeInactive: f.includeInactive,
  }, { placeholderData: (p) => p });
  const active = [f.categoryId, f.brandId, f.lensType, f.power.trim(), f.includeInactive].filter(Boolean).length;
  const rows = q.data ?? [];
  return (
    <ListScreen
      top={
        <>
          <Stack.Screen options={{ title: 'Products' }} />
          <SearchBox value={search} onChange={setSearch} placeholder="Name, code, SKU or barcode" label="Search products" />
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFilters }} onPress={() => setShowFilters(!showFilters)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: R.md, borderWidth: 1, borderColor: active ? C.teal700 : C.line, backgroundColor: pressed ? C.aqua50 : C.white })}>
            <Ionicons name="options-outline" size={20} color={C.teal700} />
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: C.ink }}>{active ? `Filters (${active} on)` : 'Filters: category, brand, lens type, power'}</Text>
            <Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
          </Pressable>
          {q.error && <Failed error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} />}
          {!q.data && !q.error && <Loading />}
        </>
      }
      ListHeaderComponent={showFilters ? (
        <View style={{ paddingBottom: 2 }}>
          <Card>
            <PickList label="Category" value={f.categoryId} none="All categories" items={(categories.data ?? []).map((c) => ({ id: c.id, label: c.name }))} onChange={(id) => setF({ ...f, categoryId: id })} />
            <PickList label="Brand" value={f.brandId} none="All brands" items={(brands.data ?? []).map((b) => ({ id: b.id, label: b.name }))} onChange={(id) => setF({ ...f, brandId: id })} />
            <Note>Lens type</Note>
            <Pills options={[['', 'Any'], ...LENS_TYPES.map((t) => [t, LENS_TYPE_LABELS[t]] as [string, string])]} value={f.lensType ?? ''} onChange={(t) => setF({ ...f, lensType: (t || null) as LensType | null })} />
            <Field label="Has this power (D)" placeholder="e.g. 21.5" keyboardType="numbers-and-punctuation" value={f.power} onChangeText={(v) => setF({ ...f, power: decimalText(v, true) })} maxLength={6} />
            <Check label="Show inactive products too" value={f.includeInactive} onChange={(v) => setF({ ...f, includeInactive: v })} />
            <Row style={{ justifyContent: 'space-between' }}>
              {active > 0 ? <LinkButton tone="muted" title="Clear filters" onPress={() => setF({ categoryId: null, brandId: null, lensType: null, power: '', includeInactive: false })} /> : <View />}
              <LinkButton title="Done" onPress={() => setShowFilters(false)} />
            </Row>
          </Card>
        </View>
      ) : undefined}
      footer={can('MANAGE_PRODUCTS') && <Button title="New product" icon={<Ionicons name="add" size={22} color={C.white} />} onPress={() => router.push('/staff/products/new')} />}
      data={rows} keyExtractor={(p) => p.id}
      refreshing={pulling} onRefresh={() => { setPulling(true); void q.refetch().finally(() => setPulling(false)); }}
      ListEmptyComponent={q.data && !q.isPlaceholderData ? <EmptyCard icon="search-outline" title={term || active ? 'No products match' : 'No products yet'} hint={term || active ? 'Try part of the name or the code, or clear the filters.' : can('MANAGE_PRODUCTS') ? 'Tap New product to add the first one.' : undefined} /> : undefined}
      ListFooterComponent={rows.length >= 500 ? <Note style={{ textAlign: 'center' }}>Showing the first 500. Search to find others.</Note> : undefined}
      renderItem={({ item: p }) => (
        <TapCard label={`${p.name}, ${p.code}`} onPress={() => router.push(`/staff/products/${p.id}`)} style={!p.isActive ? { opacity: 0.75 } : undefined}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <P style={{ fontWeight: '700', color: C.navy }} numberOfLines={2}>{p.name}</P>
              <Note>{p.code}{p.brand ? ` · ${p.brand.name}` : ''}</Note>
            </View>
            {!p.isActive && <Badge label="Inactive" tone="danger" />}
          </Row>
          <Note>{p.category.name}{p.lensType ? ` · ${LENS_TYPE_LABELS[p.lensType]}` : ''}</Note>
          {p.isLens && (p.variantCount && p.powerMin != null && p.powerMax != null
            ? <P>{formatPower(p.powerMin)} to {formatPower(p.powerMax)} · {p.variantCount} powers</P>
            : <View><Badge label="No powers yet" tone="warn" /></View>)}
          <P>Rate {rupees(p.defaultRate)} · MRP {rupees(p.mrp)}{p.purchaseCost !== undefined ? <Text style={{ color: C.muted }}> · cost {rupees(p.purchaseCost)}</Text> : null}</P>
        </TapCard>
      )}
    />
  );
}
