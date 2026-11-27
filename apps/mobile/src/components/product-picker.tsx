import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Loading, P, Row, s, Small } from '@/components/ui';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

export interface Picked {
  productId: string; productName: string; trackSerial: boolean;
  variantId: string; label: string | null;
  /** For serial-tracked items: the earliest-expiring serial not already on the bill. */
  serial: string | null;
}

/**
 * Find a product by name or code and add it from live stock: no barcode needed. Lenses add the
 * earliest-expiring serial that isn't on the bill yet (first expiry, first out).
 */
export function ProductPicker({ onPick, taken }: { onPick: (p: Picked) => void; taken: Set<string> }) {
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const found = trpc.inventory.overview.useQuery({ q: q.trim() || undefined }, { enabled: q.trim().length >= 2 });
  const stock = trpc.inventory.productStock.useQuery({ productId: openId ?? '' }, { enabled: !!openId });

  return (
    <View style={{ gap: 8 }}>
      <TextInput accessibilityLabel="Find product" value={q} onChangeText={(t) => { setQ(t); setOpenId(null); }} placeholder="Find product: name or code" style={s.input} placeholderTextColor="#9aa5b1" autoCorrect={false} />
      {q.trim().length > 0 && q.trim().length < 2 && <Small>Type at least 2 letters</Small>}
      {found.isLoading && q.trim().length >= 2 && <Loading />}
      {found.data?.length === 0 && <Small>No product matches “{q}”.</Small>}
      {found.data?.slice(0, 8).map((r) => {
        const open = openId === r.productId;
        return (
          <View key={r.productId} style={{ borderWidth: 1, borderColor: open ? C.teal : C.line, borderRadius: R.md, backgroundColor: C.white }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpenId(open ? null : r.productId)} style={{ padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <P style={{ fontWeight: '700' }} numberOfLines={2}>{r.name}</P>
                <Small>{r.code} · {r.qty} {r.unit} in stock{r.isLens ? ` · ${r.variantsInStock} powers` : ''}</Small>
              </View>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
            </Pressable>
            {open && (
              <View style={{ borderTopWidth: 1, borderTopColor: C.line, padding: 8, gap: 6 }}>
                {!stock.data && <Loading />}
                {stock.data && (() => {
                  const rows = stock.data.variants
                    .map((v) => {
                      const batches = v.batches.filter((b) => !b.expired).sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999'));
                      const serials = batches.flatMap((b) => b.serials).filter((x) => !taken.has(x));
                      const left = stock.data!.product.trackSerial ? serials.length : batches.reduce((t, b) => t + b.qty, 0);
                      return { v, serials, left };
                    })
                    .filter((x) => x.left > 0);
                  if (!rows.length) return <Small>Nothing in stock that hasn't expired.</Small>;
                  return rows.map(({ v, serials, left }) => (
                    <Row key={v.id} style={{ justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: C.ink }}>{v.label ?? stock.data!.product.name}</Text><Small>{left} available</Small></View>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Add ${v.label ?? stock.data!.product.name}`}
                        onPress={() => onPick({ productId: stock.data!.product.id, productName: stock.data!.product.name, trackSerial: stock.data!.product.trackSerial, variantId: v.id, label: v.label, serial: stock.data!.product.trackSerial ? serials[0] ?? null : null })}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.teal700, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                        <Ionicons name="add" size={16} color={C.white} /><Text style={{ color: C.white, fontWeight: '700' }}>Add</Text>
                      </Pressable>
                    </Row>
                  ));
                })()}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
