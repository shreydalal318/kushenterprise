import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Loading } from '@/components/ui';
import { C, R } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { Failed, Note, SearchBox, useDebounced } from './common';

export type VariantRow = RouterOutputs['products']['search']['rows'][number];

/**
 * Find one exact power or size by typing part of the name, code or power ("akreos 21.5"), like the
 * website's item search. Tapping a row picks it.
 */
export function VariantSearch({ onPick, action = 'Choose', placeholder = 'Name, code or power (e.g. 21.5)' }: { onPick: (v: VariantRow) => void; action?: string; placeholder?: string }) {
  const [q, setQ] = useState('');
  const term = useDebounced(q, 250);
  const res = trpc.products.search.useQuery({ q: term }, { enabled: term.length > 0, placeholderData: (p) => p, staleTime: 30_000 });
  const rows = term ? res.data?.rows ?? [] : [];
  return (
    <View style={{ gap: 6 }}>
      <SearchBox value={q} onChange={setQ} placeholder={placeholder} label="Find a product" />
      {res.error && <Failed error={res.error} busy={res.isFetching} onRetry={() => void res.refetch()} />}
      {!!term && !res.data && !res.error && <Loading />}
      {!!term && res.data && !rows.length && <Note>Nothing matches “{term}”. Try part of the name or code, or a power such as 21.5.</Note>}
      {rows.map((r) => (
        <Pressable key={r.variantId} accessibilityRole="button" accessibilityLabel={`${action} ${r.productName} ${r.label ?? ''}`} onPress={() => onPick(r)}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, padding: 10, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: pressed ? C.aqua50 : C.white })}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy }} numberOfLines={2}>{r.productName}{r.label ? <Text style={{ fontWeight: '500', color: C.ink }}> · {r.label}</Text> : null}</Text>
            <Note numberOfLines={1}>{r.code}{r.sku !== r.code ? ` · ${r.sku}` : ''} · {r.inStock > 0 ? `${r.inStock} in stock` : 'none in stock'}</Note>
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.teal700 }}>{action}</Text>
          <Ionicons name="chevron-forward" size={18} color={C.teal700} />
        </Pressable>
      ))}
      {res.data?.more && !!term && <Note>More items match. Add a word or the power to narrow the list.</Note>}
    </View>
  );
}
