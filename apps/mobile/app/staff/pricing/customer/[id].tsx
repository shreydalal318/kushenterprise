import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { formatDate } from '@kush/core';
import {
  Action, Check, Confirm, DateInput, dayOk, Failed, fieldErrors, Heading, Input, Line, NotAllowed, Note, Pills, SearchBox, SmallButton, Tag, toNumber, useDebounced, Waiting,
} from '@/components/admin/bits';
import { shareFile } from '@/components/admin/files';
import { pct, PRICE_SOURCE } from '@/components/admin/labels';
import { PriceHistory } from '@/components/admin/price-history';
import { Alert, Button, Card, H2, LinkButton, Loading, Screen, Tabs } from '@/components/ui';
import { useAuth, useCan } from '@/lib/auth';
import { errorText, rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type Sheet = RouterOutputs['pricing']['customerSheet'];
type Row = Sheet['rows'][number];
const validity = (from: string | null | undefined, to: string | null | undefined) =>
  (from || to ? `${from ? formatDate(from) : 'any time'} to ${to ? formatDate(to) : 'no end'}` : 'Always');

/** Every product at one customer's price: MRP, normal rate, list rate, special price, what they pay and the margin. The owner can change special prices. */
export default function CustomerPrices() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const { me } = useAuth();
  const owner = me?.role === 'OWNER';
  const allowed = can('VIEW_PRICES_MARGINS');
  const [tab, setTab] = useState<'prices' | 'history'>('prices');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim().slice(0, 100));
  const [onlySpecial, setOnlySpecial] = useState(false);
  const sheet = trpc.pricing.customerSheet.useQuery({ customerId: id!, q: term || undefined, onlySpecial }, { enabled: allowed, placeholderData: (p) => p });
  const [editing, setEditing] = useState<Row | null>(null);
  const [bulk, setBulk] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [xls, setXls] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const title = <Stack.Screen options={{ title: 'Prices' }} />;
  if (!allowed) return <Screen>{title}<NotAllowed what="see prices" /></Screen>;
  if (!sheet.data) return <Screen>{title}<Waiting q={sheet} /></Screen>;
  const d = sheet.data;
  const done = (msg: string) => { setEditing(null); setBulk(false); setFlash(msg); };
  if (editing) return <PriceEditor row={editing} sheet={d} onBack={() => setEditing(null)} onDone={done} />;
  if (bulk) return <BulkEditor rows={d.rows} sheet={d} filtered={!!term || onlySpecial} onBack={() => setBulk(false)} onDone={done} />;

  async function excel() {
    setXls({ busy: true, error: null });
    setFlash(null);
    try { await shareFile(`/api/pricing/export?customerId=${d.customer.id}`, `Prices-${d.customer.code}.xlsx`, 'xlsx'); setXls({ busy: false, error: null }); setFlash(`Excel file of ${d.customer.name}’s prices is ready ✓`); }
    catch (e) { setXls({ busy: false, error: `Could not get the Excel file. ${errorText(e)}` }); }
  }

  const top = (
    <View style={{ gap: 8 }}>
      {title}
      {!!flash && <Alert tone="ok">{flash}</Alert>}
      <Heading>{d.customer.name}</Heading>
      <Note>{`Price list: ${d.customer.priceList ? `${d.customer.priceList.name}${d.customer.priceList.isActive ? '' : ' (not in use)'}` : 'none'} · prices as on ${formatDate(d.onDate)}`}</Note>
      <Tabs big value={tab} onChange={setTab} options={[['prices', 'Prices'], ['history', 'Changes']]} />
    </View>
  );

  if (tab === 'history') return <Screen>{top}<PriceHistory customerId={d.customer.id} /></Screen>;
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.canvas }}>
      <FlatList data={d.rows} keyExtractor={(r) => r.productId} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            {top}
            <SearchBox value={search} onChange={setSearch} placeholder="Find a product" />
            <Check label="Only products with a special or list price" value={onlySpecial} onChange={setOnlySpecial} />
            {sheet.isFetching && <Loading />}
            {sheet.error && <Failed error={sheet.error} busy={sheet.isFetching} onRetry={() => void sheet.refetch()} />}
            {owner && <Note>Tap a product to set or remove its special price.</Note>}
            {owner && d.rows.length > 1 && <Action icon="layers-outline" title={`Change all ${d.rows.length} products shown at once`} onPress={() => { setFlash(null); setBulk(true); }} />}
          </View>
        }
        ListEmptyComponent={<Card><Note style={{ textAlign: 'center' }}>{term ? `No product matches “${term}”.` : onlySpecial ? 'No special or list prices: they pay the normal rate for everything.' : 'No products yet.'}</Note></Card>}
        ListFooterComponent={
          <Card>
            <H2>Excel</H2>
            <Note>Download these prices as an Excel sheet to share or check. To import prices from Excel, use the website.</Note>
            <SmallButton icon="download-outline" title="Download Excel" busy={xls.busy} onPress={() => void excel()} />
            {!!xls.error && <Alert>{xls.error}</Alert>}
          </Card>
        }
        renderItem={({ item: r }) => <PriceCard r={r} onPress={owner ? () => { setFlash(null); setEditing(r); } : undefined} />} />
    </SafeAreaView>
  );
}

function PriceCard({ r, onPress }: { r: Row; onPress?: () => void }) {
  const [word, tone] = PRICE_SOURCE[r.effective.source] ?? ['Normal rate', 'neutral'];
  const body = (pressed: boolean) => (
    <Card style={[!r.isActive ? { opacity: 0.6 } : null, pressed ? { backgroundColor: C.aqua50 } : null]}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>{r.name}</Text>
      <Note>{`${r.code} · ${r.category}${r.isActive ? '' : ' · not sold now'}`}</Note>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: C.ink }}>{`They pay ${rupees(r.effective.rate)}`}</Text>
        <Tag label={word} tone={tone} />
      </View>
      <Line k="MRP" v={rupees(r.mrp)} />
      <Line k="Normal rate" v={rupees(r.defaultRate)} />
      {r.listRate && <Line k="Price list rate" v={`${rupees(r.listRate.rate)}${r.listRate.validFrom || r.listRate.validTo ? ` (${validity(r.listRate.validFrom, r.listRate.validTo)})` : ''}`} />}
      {r.override && <Line k="Special price" v={`${rupees(r.override.rate)}${r.override.validFrom || r.override.validTo ? ` (${validity(r.override.validFrom, r.override.validTo)})` : ''}`} strong />}
      {r.effective.diff !== 0 && <Line k="Compared with normal" v={`${pct(Math.abs(r.effective.diffPct))} ${r.effective.diff > 0 ? 'cheaper' : 'dearer'}`} tone={r.effective.diff > 0 ? C.ok : C.danger} />}
      {r.marginPct !== undefined && <Line k="Our margin" v={pct(r.marginPct)} tone={(r.marginPct ?? 0) < 10 ? C.warn : undefined} />}
      {onPress && <Note style={{ color: C.teal700, fontWeight: '700' }}>Tap to change</Note>}
    </Card>
  );
  if (!onPress) return body(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${r.name}: they pay ${rupees(r.effective.rate)}. Tap to change the special price.`} onPress={onPress}>{({ pressed }) => body(pressed)}</Pressable>;
}

/** Set, change or remove one product's special price for this customer (owner only, like the website). */
function PriceEditor({ row, sheet, onBack, onDone }: { row: Row; sheet: Sheet; onBack: () => void; onDone: (msg: string) => void }) {
  const utils = trpc.useUtils();
  const [rate, setRate] = useState(row.override ? String(row.override.rate) : '');
  const [from, setFrom] = useState(row.override?.validFrom ?? '');
  const [to, setTo] = useState(row.override?.validTo ?? '');
  const [confirm, setConfirm] = useState(false);
  const refresh = () => Promise.all([utils.pricing.customerSheet.invalidate(), utils.pricing.history.invalidate(), utils.customers.get.invalidate({ id: sheet.customer.id }), utils.customers.list.invalidate()]);
  const save = trpc.pricing.setCustomerPrices.useMutation({ onSuccess: refresh });
  const n = toNumber(rate);
  const problems = [
    n == null && 'write the special price',
    n != null && n <= 0 && 'the price must be above zero',
    (!dayOk(from) || !dayOk(to)) && 'fix the dates',
    dayOk(from) && dayOk(to) && from.trim() && to.trim() && from.trim() > to.trim() && 'the “from” date must be on or before the “to” date',
  ].filter(Boolean);
  const fe = fieldErrors(save.error);
  const send = (r: number | null) => save.mutate({
    customerId: sheet.customer.id, source: 'ui',
    rows: [{ productId: row.productId, rate: r, validFrom: r == null ? null : from.trim() || null, validTo: r == null ? null : to.trim() || null, note: row.override?.note ?? null }],
  }, { onSuccess: () => onDone(r == null ? `Special price for ${row.name} removed.` : `Special price saved ✓ ${sheet.customer.name} pays ${rupees(r)} for ${row.name}${from.trim() || to.trim() ? ` (${validity(from.trim() || null, to.trim() || null)})` : ''}.`) });
  return (
    <Screen footer={confirm ? (
      <Confirm question="Remove this special price?" detail="They go back to paying the price list rate or the normal rate." yes="Yes, remove it" no="No, keep it"
        busy={save.isPending} error={save.error} onYes={() => send(null)} onNo={() => { save.reset(); setConfirm(false); }} />
    ) : (
      <>
        {save.error && <Alert>{errorText(save.error)}</Alert>}
        {problems.length > 0 && <Note style={{ textAlign: 'center' }}>{`To save: ${problems.join(', ')}.`}</Note>}
        <Button title="Save special price" loading={save.isPending} disabled={problems.length > 0} onPress={() => send(n)} />
        <LinkButton tone="muted" title="Back" onPress={onBack} disabled={save.isPending} />
      </>
    )}>
      <Stack.Screen options={{ title: 'Special price' }} />
      <Heading>{row.name}</Heading>
      <Note>{`${row.code} · for ${sheet.customer.name}`}</Note>
      <Card>
        <Line k="MRP" v={rupees(row.mrp)} />
        <Line k="Normal rate" v={rupees(row.defaultRate)} />
        {row.listRate && <Line k="Price list rate" v={rupees(row.listRate.rate)} />}
        {row.purchaseCost !== undefined && <Line k="Our cost" v={rupees(row.purchaseCost)} />}
        <Line k="They pay now" v={rupees(row.effective.rate)} strong />
      </Card>
      <Card>
        <H2>Special price</H2>
        <Input label="Special price in ₹ (before GST)" keyboardType="decimal-pad" value={rate} onChangeText={setRate} error={fe['rows.0.rate']} maxLength={12} autoFocus={!row.override} />
        {n != null && n > row.mrp && <Alert tone="warn">This is above the MRP ({rupees(row.mrp)}).</Alert>}
        {n != null && row.purchaseCost !== undefined && n < row.purchaseCost && <Alert tone="warn">This is below our cost ({rupees(row.purchaseCost)}).</Alert>}
        <DateInput label="Starts on (optional)" value={from} onChange={setFrom} hint="Leave empty to start now." />
        <DateInput label="Ends on (optional)" value={to} onChange={setTo} hint="Leave empty to keep it with no end." />
        {!!(fe['rows.0.validTo']) && <Alert>{fe['rows.0.validTo']}</Alert>}
      </Card>
      {row.override && <Card style={{ paddingVertical: 4, gap: 0 }}><Action icon="trash-outline" title="Remove the special price" danger onPress={() => setConfirm(true)} /></Card>}
    </Screen>
  );
}

/** The website's bulk edit: one change for every product shown (owner only). */
function BulkEditor({ rows, sheet, filtered, onBack, onDone }: { rows: Row[]; sheet: Sheet; filtered: boolean; onBack: () => void; onDone: (msg: string) => void }) {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<'PERCENT_OFF_DEFAULT' | 'FIXED' | 'CLEAR'>('PERCENT_OFF_DEFAULT');
  const [value, setValue] = useState('10');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [confirm, setConfirm] = useState(false);
  const bulk = trpc.pricing.bulkAdjust.useMutation({ onSuccess: () => Promise.all([utils.pricing.customerSheet.invalidate(), utils.pricing.history.invalidate(), utils.customers.get.invalidate({ id: sheet.customer.id })]) });
  const n = toNumber(value);
  const problems = [
    mode === 'PERCENT_OFF_DEFAULT' && (n == null || n < -100 || n >= 100) && 'write a percentage below 100',
    mode === 'FIXED' && (n == null || n <= 0) && 'write a price above zero',
    mode !== 'CLEAR' && (!dayOk(from) || !dayOk(to)) && 'fix the dates',
  ].filter(Boolean);
  const count = `${rows.length} product${rows.length === 1 ? '' : 's'}`;
  const run = () => bulk.mutate({
    customerId: sheet.customer.id, productIds: rows.map((r) => r.productId), mode, value: mode === 'CLEAR' ? undefined : n ?? undefined,
    validFrom: mode === 'CLEAR' ? null : from.trim() || null, validTo: mode === 'CLEAR' ? null : to.trim() || null,
  }, { onSuccess: () => onDone(mode === 'CLEAR' ? `Special prices removed for ${count}.` : `Special prices saved for ${count} ✓`) });
  return (
    <Screen footer={confirm ? (
      <Confirm question={mode === 'CLEAR' ? `Remove the special prices on ${count}?` : `Change the special price on ${count}?`}
        detail={mode === 'CLEAR' ? 'They go back to the price list rate or the normal rate.' : 'Any special price these products already have is replaced.'}
        yes={mode === 'CLEAR' ? 'Yes, remove them' : 'Yes, change them'} no="No, go back" busy={bulk.isPending} error={bulk.error} onYes={run} onNo={() => { bulk.reset(); setConfirm(false); }} />
    ) : (
      <>
        {problems.length > 0 && <Note style={{ textAlign: 'center' }}>{`To continue: ${problems.join(', ')}.`}</Note>}
        <Button title={`Change ${count}`} disabled={problems.length > 0} onPress={() => setConfirm(true)} />
        <LinkButton tone="muted" title="Back" onPress={onBack} />
      </>
    )}>
      <Stack.Screen options={{ title: 'Change many prices' }} />
      <Heading>{`Change ${count} at once`}</Heading>
      <Note>{`For ${sheet.customer.name}. ${filtered ? 'Only the products in your search are changed.' : 'Every product is changed. Search first to change only some.'}`}</Note>
      <Card>
        <Pills label="What to do" value={mode} onChange={setMode} options={[['PERCENT_OFF_DEFAULT', '% off the normal rate'], ['FIXED', 'Same price for all'], ['CLEAR', 'Remove special prices']]} />
        {mode !== 'CLEAR' && (
          <>
            <Input label={mode === 'FIXED' ? 'Price in ₹' : 'Discount in %'} keyboardType="decimal-pad" value={value} onChangeText={setValue} maxLength={10}
              hint={mode === 'PERCENT_OFF_DEFAULT' ? 'Rounded to the nearest rupee.' : undefined} />
            <DateInput label="Starts on (optional)" value={from} onChange={setFrom} hint="Leave empty to start now." />
            <DateInput label="Ends on (optional)" value={to} onChange={setTo} hint="Leave empty to keep it with no end." />
          </>
        )}
      </Card>
    </Screen>
  );
}
