import { useState } from 'react';
import { Text, View } from 'react-native';
import { formatDate, formatDateTime } from '@kush/core';
import { Card } from '@/components/ui';
import { rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';
import { Line, Note, SearchBox, Waiting } from './bits';
import { PRICE_SCOPE } from './labels';

/** Who changed which price, when, from what to what (newest first), for one customer or one price list. */
export function PriceHistory({ customerId, priceListId }: { customerId?: string; priceListId?: string }) {
  const q = trpc.pricing.history.useQuery({ customerId, priceListId, limit: 200 });
  const [search, setSearch] = useState('');
  if (!q.data) return <Waiting q={q} />;
  if (!q.data.length) return <Note>No price changes yet.</Note>;
  const term = search.trim().toLowerCase();
  const rows = term ? q.data.filter((h) => `${h.product.name} ${h.product.code} ${h.changedBy.name}`.toLowerCase().includes(term)) : q.data;
  return (
    <View style={{ gap: 10 }}>
      <SearchBox value={search} onChange={setSearch} placeholder="Find a product or person" />
      {!rows.length && <Note>Nothing matches “{search}”.</Note>}
      {rows.map((h) => (
        <Card key={h.id}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{h.product.name}</Text>
          <Note>{`${formatDateTime(h.createdAt)} · ${PRICE_SCOPE[h.scope] ?? h.scope}${h.source && h.source !== 'ui' ? ` (${h.source})` : ''} · by ${h.changedBy.name}`}</Note>
          <Line k="Was" v={rupees(h.oldRate)} />
          <Line k="Now" v={h.newRate == null ? 'Removed' : rupees(h.newRate)} strong tone={h.newRate == null ? C.danger : undefined} />
          {!!(h.validFrom || h.validTo) && <Line k="Valid" v={`${h.validFrom ? formatDate(h.validFrom) : 'any time'} to ${h.validTo ? formatDate(h.validTo) : 'no end'}`} />}
        </Card>
      ))}
    </View>
  );
}
