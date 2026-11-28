import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { readableError } from '@/components/errors';
import { Alert, Button, Card, Field, H2, Screen, Tabs } from '@/components/ui';
import { decimalText, FailedScreen, flashNext, NoAccess, Note, numOrNull, LoadingScreen } from '@/components/inventory/common';
import { emptyRange, PowerRangeFields, rangePreview, toRangeInput, type PowerRange } from '@/components/inventory/power-range';
import { useCan } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

/** Add powers to a lens: many at once from a range, or a single one (web: Generate powers / Add one). */
export default function GeneratePowers() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const utils = trpc.useUtils();
  const q = trpc.products.get.useQuery({ id: id! });
  const [mode, setMode] = useState<'range' | 'one'>('range');
  const [range, setRange] = useState<PowerRange>(emptyRange);
  const [one, setOne] = useState({ powerSph: '', cylinder: '', addPower: '', gtin: '' });
  const gen = trpc.products.generateVariants.useMutation();
  const add = trpc.products.addVariant.useMutation();
  if (!can('MANAGE_PRODUCTS')) return <NoAccess title="Add powers">Adding powers needs the “Manage products” permission. Ask the owner.</NoAccess>;
  if (!q.data) return q.error ? <FailedScreen title="Add powers" error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} /> : <LoadingScreen title="Add powers" />;
  const p = q.data;
  if (!p.isLens) return <NoAccess title="Add powers">Powers are only for lenses. This product has a single size.</NoAccess>;
  const done = (msg: string) => { void utils.products.invalidate(); void utils.inventory.invalidate(); flashNext(`product:${p.id}`, msg); router.back(); };
  const rp = rangePreview(range);
  const sph = numOrNull(one.powerSph), cyl = numOrNull(one.cylinder), addP = numOrNull(one.addPower);
  const oneMissing = [
    (sph == null || !Number.isFinite(sph)) && 'write the power',
    p.lensType === 'TORIC' && cyl != null && !Number.isFinite(cyl) && 'write the cylinder as a number',
    p.lensType === 'MULTIFOCAL' && addP != null && !Number.isFinite(addP) && 'write the add power as a number',
  ].filter((x): x is string => !!x);
  const m = mode === 'range' ? gen : add;
  return (
    <Screen footer={
      <>
        {m.error && <Alert>{readableError(m.error)}</Alert>}
        {mode === 'range' ? (
          <Button title={'count' in rp ? `Make ${rp.count} power${rp.count === 1 ? '' : 's'}` : 'Make powers'} loading={gen.isPending} disabled={'error' in rp}
            onPress={() => gen.mutate({ productId: p.id, range: toRangeInput(range)! }, { onSuccess: (r) => done(`Made ${r.created} new power${r.created === 1 ? '' : 's'} ✓${r.skipped ? ` ${r.skipped} were already there.` : ''}`) })} />
        ) : (
          <>
            {oneMissing.length > 0 && <Note style={{ textAlign: 'center' }}>To save: {oneMissing.join(', ')}.</Note>}
            <Button title="Add this power" loading={add.isPending} disabled={oneMissing.length > 0}
              onPress={() => add.mutate({ productId: p.id, powerSph: sph, cylinder: p.lensType === 'TORIC' ? cyl : null, addPower: p.lensType === 'MULTIFOCAL' ? addP : null, gtin: one.gtin.trim() || null }, { onSuccess: () => done('Power added ✓') })} />
          </>
        )}
      </>
    }>
      <Stack.Screen options={{ title: 'Add powers' }} />
      <Card>
        <H2>{p.name}</H2>
        <Note>{p.variants.length} power{p.variants.length === 1 ? '' : 's'} so far. Each power has its own stock and barcode.</Note>
      </Card>
      <Tabs big value={mode} onChange={(x) => { gen.reset(); add.reset(); setMode(x); }} options={[['range', 'Many at once'], ['one', 'Just one']]} />
      <Card>
        {mode === 'range' ? <PowerRangeFields value={range} onChange={setRange} lensType={p.lensType} /> : (
          <>
            <Field label="Power (D)" placeholder="e.g. 21.5" keyboardType="numbers-and-punctuation" value={one.powerSph} onChangeText={(x) => setOne({ ...one, powerSph: decimalText(x, true) })} maxLength={6} autoFocus />
            {p.lensType === 'TORIC' && <Field label="Cylinder (D)" keyboardType="decimal-pad" value={one.cylinder} onChangeText={(x) => setOne({ ...one, cylinder: decimalText(x) })} maxLength={5} />}
            {p.lensType === 'MULTIFOCAL' && <Field label="Add power (D)" keyboardType="decimal-pad" value={one.addPower} onChangeText={(x) => setOne({ ...one, addPower: decimalText(x) })} maxLength={5} />}
            <Field label="Barcode number on the box (GTIN / EAN, optional)" keyboardType="number-pad" value={one.gtin} onChangeText={(x) => setOne({ ...one, gtin: x.replace(/\D/g, '') })} maxLength={14} />
          </>
        )}
      </Card>
    </Screen>
  );
}
