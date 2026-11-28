import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, istDateString } from '@kush/core';
import { readableError } from '@/components/errors';
import { ProductPicker, type Picked } from '@/components/product-picker';
import { Alert, Badge, Button, Card, Field, H2, Loading, P, Row, Screen } from '@/components/ui';
import { Confirm, Failed, flashNext, int, isDay, nameOf, NoAccess, Note, PickList, LoadingScreen, FailedScreen } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { C, R } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';

interface Line { key: string; productId: string; variantId: string; productName: string; label: string | null; trackSerial: boolean; batch: string; qty: string; serials: string[] }
const keyOf = (b: { batchId: string; location: { id: string } }) => `${b.batchId}|${b.location.id}`;

/** Send goods back to a supplier: which supplier, why, and each item's batch and quantity. Stock goes down. */
export default function NewReturn() {
  const can = useCan();
  const utils = trpc.useUtils();
  const suppliers = trpc.suppliers.list.useQuery();
  const [head, setHead] = useState({ supplierId: null as string | null, date: istDateString(), reason: '', note: '' });
  const [lines, setLines] = useState<Line[]>([]);
  const [added, setAdded] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const seq = useRef(0);
  const create = trpc.inventory.returnToSupplier.useMutation();
  // Each line's batches, read from the same query the line's card uses.
  const stocks = trpc.useQueries((t) => lines.map((l) => t.inventory.productStock({ productId: l.productId })));

  if (!can('MANAGE_STOCK')) return <NoAccess title="Return to supplier">Returns to supplier need the “Manage stock” permission. Ask the owner.</NoAccess>;
  if (!suppliers.data) return suppliers.error ? <FailedScreen title="Return to supplier" error={suppliers.error} busy={suppliers.isFetching} onRetry={() => void suppliers.refetch()} /> : <LoadingScreen title="Return to supplier" />;

  const update = (key: string, p: Partial<Line>) => { setConfirm(false); setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...p } : l))); };
  function onPick(p: Picked) {
    setConfirm(false);
    setLines((cur) => [...cur, { key: `l${seq.current++}`, productId: p.productId, variantId: p.variantId, productName: p.productName, label: p.label, trackSerial: p.trackSerial, batch: '', qty: '1', serials: [] }]);
    setAdded(`Added ${nameOf(p)}. Choose its batch below.`);
  }
  const batchOf = (l: Line, i: number) => stocks[i]?.data?.variants.find((v) => v.id === l.variantId)?.batches.find((b) => keyOf(b) === l.batch);
  // Serial-tracked items go back one unit per ticked serial number.
  const qtyOf = (l: Line) => (l.trackSerial ? l.serials.length : int(l.qty));
  const units = lines.reduce((t, l) => t + qtyOf(l), 0);
  const supplier = suppliers.data.find((x) => x.id === head.supplierId);
  const problems = lines.flatMap((l, i) => {
    const b = batchOf(l, i);
    const n = qtyOf(l);
    return [
      !b ? `${nameOf(l)}: choose the batch` : null,
      b && n < 1 ? `${nameOf(l)}: ${l.trackSerial ? 'tick the serial numbers going back' : 'write how many'}` : b && n > b.qty ? `${nameOf(l)}: only ${b.qty} in batch ${b.batchNo}` : null,
    ].filter((x): x is string => !!x);
  });
  const missing = [
    !head.supplierId && 'choose the supplier',
    head.reason.trim().length < 3 && 'write the reason',
    !isDay(head.date.trim()) && 'write the date as YYYY-MM-DD',
    !lines.length && 'add an item',
  ].filter((x): x is string => !!x);

  function save() {
    create.mutate({
      supplierId: head.supplierId!, date: head.date.trim(), reason: head.reason.trim(), note: head.note.trim() || null,
      lines: lines.map((l, i) => { const b = batchOf(l, i)!; return { variantId: l.variantId, batchId: b.batchId, locationId: b.location.id, qty: qtyOf(l), serialNos: l.trackSerial ? l.serials : [] }; }),
    }, {
      onSuccess: (r) => {
        void utils.inventory.invalidate();
        flashNext('supplier-returns', `Debit note ${r.number} saved ✓ ${units} unit${units === 1 ? '' : 's'} returned to ${supplier?.name ?? 'the supplier'}. Stock is updated.`);
        router.replace('/staff/stock-reports/returns');
      },
      onError: () => setConfirm(false),
    });
  }

  return (
    <Screen footer={
      <>
        {create.error && <Alert>{readableError(create.error)}</Alert>}
        {confirm ? (
          <Confirm question={`Return ${units} unit${units === 1 ? '' : 's'} to ${supplier?.name ?? 'the supplier'}? Stock goes down. This can’t be undone.`} yes={`Yes, return ${units}`} busy={create.isPending} onYes={save} onNo={() => setConfirm(false)} />
        ) : (
          <>
            {(missing.length > 0 || problems.length > 0) && <Note style={{ textAlign: 'center' }}>To save: {[...missing, ...problems].join('; ')}.</Note>}
            <Button variant="danger" title={`Return ${units} unit${units === 1 ? '' : 's'}`} disabled={missing.length > 0 || problems.length > 0} loading={create.isPending} onPress={() => setConfirm(true)} />
          </>
        )}
      </>
    }>
      <Stack.Screen options={{ title: 'Return to supplier' }} />
      <Card>
        <PickList label="Supplier" value={head.supplierId} placeholder="Choose the supplier" items={suppliers.data.map((x) => ({ id: x.id, label: x.name, hint: x.code }))} onChange={(id) => { setConfirm(false); setHead({ ...head, supplierId: id }); }} />
        <Field label="Why are they going back?" placeholder="Damaged in transit, near expiry…" value={head.reason} onChangeText={(v) => setHead({ ...head, reason: v })} maxLength={200} />
        <Field label="Date (YYYY-MM-DD)" keyboardType="numbers-and-punctuation" value={head.date} onChangeText={(v) => setHead({ ...head, date: v })} maxLength={10} error={head.date.trim() && !isDay(head.date.trim()) ? 'Use YYYY-MM-DD' : null} />
        <Field label="Note (optional)" value={head.note} onChangeText={(v) => setHead({ ...head, note: v })} maxLength={500} multiline />
      </Card>
      <Card>
        <H2>Add items</H2>
        <ProductPicker allSizes onPick={onPick} />
        {!!added && <Alert tone="ok">{added}</Alert>}
      </Card>
      {lines.map((l, i) => <ReturnLine key={l.key} line={l} stock={stocks[i]} onChange={(p) => update(l.key, p)} onRemove={() => { setConfirm(false); setLines((cur) => cur.filter((x) => x.key !== l.key)); setAdded(null); }} />)}
    </Screen>
  );
}

type StockQuery = { data?: RouterOutputs['inventory']['productStock']; error: unknown; isFetching: boolean; refetch: () => unknown };

function ReturnLine({ line: l, stock, onChange, onRemove }: { line: Line; stock: StockQuery | undefined; onChange: (p: Partial<Line>) => void; onRemove: () => void }) {
  const today = istDateString();
  const batches = stock?.data?.variants.find((v) => v.id === l.variantId)?.batches ?? [];
  const b = batches.find((x) => keyOf(x) === l.batch);
  return (
    <Card>
      <Row style={{ alignItems: 'flex-start' }}>
        <P style={{ fontWeight: '700', flex: 1 }}>{nameOf(l)}</P>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${nameOf(l)}`} onPress={onRemove} hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="trash-outline" size={22} color={C.muted} />
        </Pressable>
      </Row>
      {!stock?.data ? (stock?.error ? <Failed error={stock.error} busy={stock.isFetching} onRetry={() => void stock.refetch()} /> : <Loading />) : (
        <>
          <Note>Which batch?</Note>
          {!batches.length && <Alert tone="warn">Nothing of this item is in stock, so it can’t be returned. Remove it.</Alert>}
          {batches.map((x) => {
            const on = l.batch === keyOf(x);
            const expired = !!x.expiryDate && x.expiryDate < today;
            return (
              <Pressable key={keyOf(x)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Batch ${x.batchNo}, ${x.qty} in stock`} onPress={() => onChange({ batch: keyOf(x), serials: [] })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, padding: 8, borderRadius: R.md, borderWidth: on ? 2 : 1, borderColor: on ? C.teal700 : C.line, backgroundColor: on ? C.aqua50 : C.white }}>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={C.teal700} />
                <View style={{ flex: 1 }}>
                  <P style={{ fontWeight: '700' }}>{x.batchNo} · {x.qty} in stock</P>
                  <Note>{x.expiryDate ? `${expired ? 'Expired' : 'Expires'} ${formatDate(x.expiryDate)}` : 'No expiry'} · {x.location.name}</Note>
                </View>
                {expired && <Badge label="Expired" tone="danger" />}
              </Pressable>
            );
          })}
          {b && !l.trackSerial && <Field label={`How many? (up to ${b.qty})`} keyboardType="number-pad" value={l.qty} onChangeText={(v) => onChange({ qty: v.replace(/\D/g, '') })} maxLength={6} />}
          {b && l.trackSerial && (
            <>
              <Note>Tap the serial numbers going back ({l.serials.length} chosen).</Note>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {b.serials.map((x) => {
                  const on = l.serials.includes(x);
                  return (
                    <Pressable key={x} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Serial ${x}`}
                      onPress={() => { const ss = on ? l.serials.filter((y) => y !== x) : [...l.serials, x]; onChange({ serials: ss, qty: String(ss.length) }); }}
                      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: on ? C.teal700 : C.line, backgroundColor: on ? C.aqua100 : C.white }}>
                      <Text style={{ fontSize: 15, fontWeight: on ? '700' : '500', color: on ? C.navy : C.ink }}>{x}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </>
      )}
    </Card>
  );
}
