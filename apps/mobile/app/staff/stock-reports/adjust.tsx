import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ADJUSTMENT_REASON_LABELS, ADJUSTMENT_REASONS, formatDate, istDateString, type AdjustmentReason } from '@kush/core';
import { readableError } from '@/components/errors';
import { ProductPicker } from '@/components/product-picker';
import { Alert, Badge, Button, Card, Field, H2, LinkButton, Loading, P, Row, s, Screen, Tabs } from '@/components/ui';
import { Confirm, Failed, int, isDay, NoAccess, Note, Pills } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

const NEW = '__new';
const keyOf = (b: { batchId: string; location: { id: string } }) => `${b.batchId}|${b.location.id}`;

/** Add or remove stock with a reason (web: product stock → Adjust). Removing needs the batch, and the serials if tracked. */
export default function Adjust() {
  const params = useLocalSearchParams<{ productId?: string; variantId?: string; batchId?: string }>();
  const can = useCan();
  const utils = trpc.useUtils();
  const [item, setItem] = useState<{ productId: string; variantId: string } | null>(params.productId && params.variantId ? { productId: params.productId, variantId: params.variantId } : null);
  const st = trpc.inventory.productStock.useQuery({ productId: item?.productId ?? '' }, { enabled: !!item });
  const [dir, setDir] = useState<'remove' | 'add'>('remove');
  const [batch, setBatch] = useState('');
  const [newBatch, setNewBatch] = useState({ batchNo: '', expiryDate: '' });
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState<AdjustmentReason | null>(null);
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [serialText, setSerialText] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const adjust = trpc.inventory.adjust.useMutation();

  const product = st.data?.product;
  const variant = st.data?.variants.find((v) => v.id === item?.variantId);
  const batches = variant?.batches ?? [];
  // Opened from a batch, or only one batch: choose it already.
  useEffect(() => {
    if (!variant || batch) return;
    const preset = params.batchId ? batches.find((b) => b.batchId === params.batchId) : batches.length === 1 ? batches[0] : undefined;
    if (preset) setBatch(keyOf(preset));
  }, [variant?.id, batch === '', batches.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!can('MANAGE_STOCK')) return <NoAccess title="Adjust stock">Adjusting stock needs the “Manage stock” permission. Ask the owner.</NoAccess>;

  const chosen = batches.find((b) => keyOf(b) === batch);
  const isNew = dir === 'add' && (batch === NEW || !batches.length);
  const n = int(qty);
  const serials = dir === 'remove' ? picked : serialText.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  const name = variant ? `${product?.name ?? ''}${variant.label ? ` ${variant.label}` : ''}` : '';
  const missing = !variant ? [] : [
    dir === 'remove' && !batches.length ? 'there is no stock of this item to remove' : null,
    !isNew && !chosen && batches.length ? 'choose the batch' : null,
    isNew && product?.trackBatch && !newBatch.batchNo.trim() ? 'write the batch number' : null,
    isNew && product?.trackExpiry && !isDay(newBatch.expiryDate.trim()) ? 'write the expiry as YYYY-MM-DD' : null,
    n < 1 ? 'write how many' : null,
    dir === 'remove' && chosen && n > chosen.qty ? `only ${chosen.qty} in that batch` : null,
    !reason ? 'choose the reason' : null,
    product?.trackSerial && serials.length !== n ? `${dir === 'remove' ? 'tick' : 'write'} ${n} serial number${n === 1 ? '' : 's'} (${serials.length} so far)` : null,
  ].filter((x): x is string => !!x);

  function reset(keepItem: boolean) {
    setQty('1'); setReason(null); setNote(''); setPicked([]); setSerialText(''); setNewBatch({ batchNo: '', expiryDate: '' }); setBatch(''); setConfirm(false); adjust.reset();
    if (!keepItem) setItem(null);
  }
  function save() {
    if (!variant || !reason) return;
    adjust.mutate({
      variantId: variant.id,
      batchId: isNew ? undefined : chosen?.batchId,
      batchNo: isNew ? newBatch.batchNo.trim() || null : undefined,
      expiryDate: isNew ? newBatch.expiryDate.trim() || null : undefined,
      locationId: isNew ? undefined : chosen?.location.id,
      qty: dir === 'remove' ? -n : n,
      reason, note: note.trim() || null,
      serialNos: product?.trackSerial ? serials : [],
    }, {
      onSuccess: () => {
        void utils.inventory.invalidate();
        setFlash(`Stock updated ✓ ${dir === 'remove' ? 'Removed' : 'Added'} ${n} × ${name} (${ADJUSTMENT_REASON_LABELS[reason].toLowerCase()}).`);
        reset(true);
      },
      onError: () => setConfirm(false),
    });
  }

  const today = istDateString();
  return (
    <Screen footer={variant && (
      <>
        {adjust.error && <Alert>{readableError(adjust.error)}</Alert>}
        {confirm ? (
          <Confirm question={`Remove ${n} × ${name} from stock? This can’t be undone.`} yes={`Yes, remove ${n}`} busy={adjust.isPending} onYes={save} onNo={() => setConfirm(false)} />
        ) : (
          <>
            {missing.length > 0 && <Note style={{ textAlign: 'center' }}>To save: {missing.join(', ')}.</Note>}
            <Button variant={dir === 'remove' ? 'danger' : 'primary'} title={dir === 'remove' ? `Remove ${n || ''} from stock` : `Add ${n || ''} to stock`} loading={adjust.isPending} disabled={missing.length > 0}
              onPress={() => (dir === 'remove' ? setConfirm(true) : save())} />
          </>
        )}
      </>
    )}>
      <Stack.Screen options={{ title: 'Adjust stock' }} />
      {!!flash && <Alert tone="ok">{flash}</Alert>}
      <Card>
        <H2>Which item?</H2>
        {!item ? (
          <ProductPicker allSizes onPick={(p) => { setItem({ productId: p.productId, variantId: p.variantId }); reset(true); setFlash(null); }} />
        ) : !st.data ? (st.error ? <Failed error={st.error} busy={st.isFetching} onRetry={() => void st.refetch()} /> : <Loading />) : !variant ? (
          <><Alert>That item could not be found.</Alert><LinkButton title="Choose another item" onPress={() => reset(false)} /></>
        ) : (
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><P style={{ fontWeight: '700' }}>{name}</P><Note>{variant.qty} {product?.unit} in stock now</Note></View>
            <LinkButton title="Change" onPress={() => { reset(false); setFlash(null); }} />
          </Row>
        )}
      </Card>

      {variant && product && (
        <>
          <Tabs big value={dir} onChange={(d) => { setDir(d); setPicked([]); setConfirm(false); if (d === 'add' && !batches.length) setBatch(NEW); if (d === 'remove' && batch === NEW) setBatch(''); }} options={[['remove', 'Remove stock'], ['add', 'Add stock']]} />
          <Card>
            <H2>Which batch?</H2>
            {!batches.length && dir === 'remove' && <Note>Nothing of this item is in stock, so nothing can be removed.</Note>}
            {batches.map((b) => {
              const on = batch === keyOf(b);
              const expired = !!b.expiryDate && b.expiryDate < today;
              return (
                <Pressable key={keyOf(b)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Batch ${b.batchNo}, ${b.qty} in stock`} onPress={() => { setBatch(keyOf(b)); setPicked([]); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, padding: 8, borderRadius: R.md, borderWidth: on ? 2 : 1, borderColor: on ? C.teal700 : C.line, backgroundColor: on ? C.aqua50 : C.white }}>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={C.teal700} />
                  <View style={{ flex: 1 }}>
                    <P style={{ fontWeight: '700' }}>{b.batchNo} · {b.qty} in stock</P>
                    <Note>{b.expiryDate ? `${expired ? 'Expired' : 'Expires'} ${formatDate(b.expiryDate)}` : 'No expiry'} · {b.location.name}</Note>
                  </View>
                  {expired && <Badge label="Expired" tone="danger" />}
                </Pressable>
              );
            })}
            {dir === 'add' && batches.length > 0 && (
              <Pressable accessibilityRole="radio" accessibilityState={{ selected: batch === NEW }} onPress={() => setBatch(NEW)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, padding: 8, borderRadius: R.md, borderWidth: batch === NEW ? 2 : 1, borderColor: batch === NEW ? C.teal700 : C.line, backgroundColor: batch === NEW ? C.aqua50 : C.white }}>
                <Ionicons name={batch === NEW ? 'radio-button-on' : 'radio-button-off'} size={22} color={C.teal700} />
                <P style={{ fontWeight: '700' }}>A batch not listed here</P>
              </Pressable>
            )}
            {isNew && (product.trackBatch || product.trackExpiry) && (
              <>
                {product.trackBatch && <Field label="Batch / lot number" autoCapitalize="characters" value={newBatch.batchNo} onChangeText={(v) => setNewBatch({ ...newBatch, batchNo: v })} maxLength={40} />}
                {product.trackExpiry && <Field label="Expiry (YYYY-MM-DD)" placeholder="2028-06-30" keyboardType="numbers-and-punctuation" value={newBatch.expiryDate} onChangeText={(v) => setNewBatch({ ...newBatch, expiryDate: v })} maxLength={10} />}
              </>
            )}
          </Card>
          <Card>
            <Field label={`How many to ${dir}?`} keyboardType="number-pad" value={qty} onChangeText={(v) => setQty(v.replace(/\D/g, ''))} maxLength={6} />
            <H2>Why?</H2>
            <Pills options={ADJUSTMENT_REASONS.map((r) => [r, ADJUSTMENT_REASON_LABELS[r]] as [AdjustmentReason, string])} value={reason} onChange={setReason} />
          </Card>
          {product.trackSerial && dir === 'remove' && chosen && (
            <Card>
              <H2>Which units? ({picked.length} of {n})</H2>
              <Note>Tap the serial numbers of the units you are removing.</Note>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {chosen.serials.map((x) => {
                  const on = picked.includes(x);
                  return (
                    <Pressable key={x} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Serial ${x}`} onPress={() => { const next = on ? picked.filter((y) => y !== x) : [...picked, x]; setPicked(next); setQty(String(next.length)); }}
                      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: on ? C.teal700 : C.line, backgroundColor: on ? C.aqua100 : C.white }}>
                      <Text style={{ fontSize: 15, fontWeight: on ? '700' : '500', color: on ? C.navy : C.ink }}>{x}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {!chosen.serials.length && <Note>No serial numbers are recorded in this batch.</Note>}
            </Card>
          )}
          {product.trackSerial && dir === 'add' && (
            <Card>
              <Field label={`Serial numbers (${serials.length} of ${n})`} placeholder="One per line, or separated by commas" autoCapitalize="characters" autoCorrect={false} multiline value={serialText} onChangeText={(x) => { setSerialText(x); const c = x.split(/[\s,;]+/).filter(Boolean).length; if (c) setQty(String(c)); }} style={[s.input, { minHeight: 88, textAlignVertical: 'top' }]} />
            </Card>
          )}
          <Field label="Note (optional)" placeholder="What happened? Kept in the stock history." value={note} onChangeText={setNote} multiline maxLength={500} />
        </>
      )}
    </Screen>
  );
}
