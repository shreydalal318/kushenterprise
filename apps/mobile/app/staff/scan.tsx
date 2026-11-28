import { useState } from 'react';
import { View } from 'react-native';
import { formatDate } from '@kush/core';
import { Scanner } from '@/components/scanner';
import { Alert, Badge, Card, H2, KV, P, Row, Screen, Small } from '@/components/ui';
import { rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type Hit = Extract<RouterOutputs['scan']['resolve'], { found: true }>;
const WARN: Record<string, [string, 'danger' | 'warn']> = {
  EXPIRED: ['Expired batch', 'danger'], NEAR_EXPIRY: ['Expires within 30 days', 'warn'], OUT_OF_STOCK: ['Out of stock', 'danger'],
  BATCH_NOT_IN_STOCK: ['That batch is not in stock', 'warn'], SERIAL_NOT_IN_STOCK: ['Serial not in stock (sold / returned)', 'danger'], INACTIVE: ['Inactive item', 'warn'],
};

/** Scan to look up: product, power, batch and expiry, stock by batch and location. */
export default function ScanLookup() {
  const utils = trpc.useUtils();
  const [hit, setHit] = useState<Hit | null>(null);
  const [miss, setMiss] = useState<string | null>(null);
  async function onScan(code: string) {
    const r = await utils.scan.resolve.fetch({ code }, { staleTime: 0 }).catch(() => null);
    if (!r) { setMiss('No connection. Try again when you have signal.'); setHit(null); return; }
    if (!r.found) { setMiss(`Unknown barcode ${code}. Link it to the product on the web app (Scan screen).`); setHit(null); return; }
    setMiss(null); setHit(r);
  }
  return (
    <Screen>
      <Scanner onScan={onScan} height={240} />
      {!!miss && <Alert>{miss}</Alert>}
      {hit && (
        <Card>
          <H2>{hit.product.name}</H2>
          <Small>{[hit.variant.label, hit.variant.sku].filter(Boolean).join(' · ')}</Small>
          <Row style={{ flexWrap: 'wrap' }}>{hit.warnings.map((w) => <Badge key={w} label={WARN[w]?.[0] ?? w} tone={WARN[w]?.[1] ?? 'warn'} />)}{!hit.warnings.length && <Badge label="OK to sell" tone="ok" />}</Row>
          {hit.batch && <KV k="Batch" v={`${hit.batch.batchNo}${hit.batch.expiryDate ? ` · exp ${formatDate(hit.batch.expiryDate)}` : ''}`} />}
          {hit.serial && <KV k="Serial" v={`${hit.serial.serialNo} (${hit.serial.status.toLowerCase().replace(/_/g, ' ')})`} />}
          <KV k="MRP" v={rupees(hit.variant.mrp)} />
          <KV k="In stock" v={`${hit.stock.total} ${hit.product.unit}`} />
          {hit.suggested && <Small style={{ color: C.teal700 }}>Pick first (FEFO): batch {hit.suggested.batchNo}{hit.suggested.expiryDate ? `, exp ${formatDate(hit.suggested.expiryDate)}` : ''}</Small>}
          {hit.stock.batches.length > 0 && <View style={{ gap: 4, marginTop: 4 }}>
            {hit.stock.batches.map((b) => <Row key={`${b.batchId}-${b.location.id}`} style={{ justifyContent: 'space-between' }}><Small>{b.batchNo}{b.expiryDate ? ` · ${formatDate(b.expiryDate)}` : ''} · {b.location.name}</Small><P style={{ fontWeight: '700' }}>{b.qty}</P></Row>)}
          </View>}
        </Card>
      )}
    </Screen>
  );
}
