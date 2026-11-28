import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { formatDate } from '@kush/core';
import {
  Action, Check, Confirm, DateInput, dayOk, fieldErrors, Heading, Input, Line, NotAllowed, Note, SearchBox, SmallButton, Tag, Tap, toNumber, useDebounced, useFlash, Waiting,
} from '@/components/admin/bits';
import { shareFile } from '@/components/admin/files';
import { pct } from '@/components/admin/labels';
import { PriceHistory } from '@/components/admin/price-history';
import { Alert, Button, Card, H2, LinkButton, Loading, Screen } from '@/components/ui';
import { useAuth, useCan } from '@/lib/auth';
import { errorText, rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { Done } from '@/components/done';

type List = RouterOutputs['priceLists']['get'];
interface Draft { productId: string; code: string; name: string; rate: string; validFrom: string; validTo: string; defaultRate: number; mrp: number; purchaseCost: number | null; isNew: boolean }
const validity = (from: string | null, to: string | null) => (from || to ? `${from ? formatDate(from) : 'any time'} to ${to ? formatDate(to) : 'no end'}` : null);

/** One price list: its rates, the customers on it and its change history. The owner edits rates and who is on it. */
export default function PriceList() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const { me } = useAuth();
  const owner = me?.role === 'OWNER';
  const allowed = can('VIEW_PRICES_MARGINS');
  const q = trpc.priceLists.get.useQuery({ id: id! }, { enabled: allowed });
  const [flash, setFlash] = useFlash(`price-list-${id}`);
  const [mode, setMode] = useState<null | 'details' | 'add' | 'assign' | 'history'>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState('');
  const [xls, setXls] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const title = <Stack.Screen options={{ title: 'Price list' }} />;
  if (!allowed) return <Screen>{title}<NotAllowed what="see prices" /></Screen>;
  if (!q.data) return <Screen>{title}<Waiting q={q} /></Screen>;
  const l = q.data;
  const done = (msg: string) => { setDraft(null); setMode(null); setFlash(msg); };
  const go = (m: typeof mode) => { setFlash(null); setMode(m); };
  const back = () => { setDraft(null); setMode(null); };

  if (draft) return <ItemEditor l={l} draft={draft} onBack={back} onDone={done} />;
  if (mode === 'details') return <DetailsEditor l={l} onBack={back} onDone={done} />;
  if (mode === 'add') {
    return <AddProduct l={l} onBack={back} onPick={(p) => setDraft({ productId: p.id, code: p.code, name: p.name, rate: String(p.defaultRate), validFrom: '', validTo: '', defaultRate: p.defaultRate, mrp: p.mrp, purchaseCost: p.purchaseCost ?? null, isNew: true })} />;
  }
  if (mode === 'assign') return <AssignCustomer l={l} onBack={back} onDone={done} />;
  if (mode === 'history') {
    return (
      <Screen footer={<Button variant="secondary" title="Back to the price list" onPress={back} />}>
        {title}
        <Heading>{`Changes to ${l.name}`}</Heading>
        <PriceHistory priceListId={l.id} />
      </Screen>
    );
  }

  async function excel() {
    setXls({ busy: true, error: null });
    setFlash(null);
    try { await shareFile(`/api/pricing/export?priceListId=${l.id}`, `Price-list-${l.name}.xlsx`, 'xlsx'); setXls({ busy: false, error: null }); setFlash(`Excel file of ${l.name} is ready ✓`); }
    catch (e) { setXls({ busy: false, error: `Could not get the Excel file. ${errorText(e)}` }); }
  }
  const term = search.trim().toLowerCase();
  const items = term ? l.items.filter((i) => `${i.name} ${i.code} ${i.category}`.toLowerCase().includes(term)) : l.items;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: C.canvas }}>
      {title}
      <FlatList data={items} keyExtractor={(i) => i.productId} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <Done message={flash} onShown={() => setFlash(null)} />
            <Heading>{l.name}</Heading>
            <Tag label={l.isActive ? 'In use' : 'Not in use'} tone={l.isActive ? 'ok' : 'neutral'} />
            {!!l.description && <Note>{l.description}</Note>}
            {!l.isActive && <Alert tone="warn">This list is not in use: customers on it pay the normal rate.</Alert>}
            <H2>{`Rates (${l.items.length})`}</H2>
            <Note>Products not on the list are sold at the normal rate.{owner ? ' Tap a product to change its rate or take it off the list.' : ''}</Note>
            {l.items.length > 6 && <SearchBox value={search} onChange={setSearch} placeholder="Find a product on this list" />}
          </View>
        }
        ListEmptyComponent={<Card><Note style={{ textAlign: 'center' }}>{term ? `No product matches “${search.trim()}”.` : 'No products on this list yet.'}</Note></Card>}
        renderItem={({ item: i }) => {
          const rate = i.rate;
          const diffPct = i.defaultRate ? ((i.defaultRate - rate) / i.defaultRate) * 100 : 0;
          const margin = rate ? ((rate - i.purchaseCost) / rate) * 100 : null;
          const when = validity(i.validFrom, i.validTo);
          const body = (pressed: boolean) => (
            <Card style={pressed ? { backgroundColor: C.aqua50 } : null}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>{i.name}</Text>
              <Note>{`${i.code} · ${i.category}`}</Note>
              <Line k="List rate" v={rupees(rate)} strong tone={rate > i.mrp ? C.danger : undefined} />
              <Line k="Normal rate" v={rupees(i.defaultRate)} />
              <Line k="MRP" v={rupees(i.mrp)} />
              {!!when && <Line k="Valid" v={when} />}
              {Math.abs(diffPct) >= 0.05 && <Line k="Compared with normal" v={`${pct(Math.abs(diffPct))} ${diffPct > 0 ? 'cheaper' : 'dearer'}`} tone={diffPct > 0 ? C.ok : C.danger} />}
              <Line k="Our margin" v={pct(margin)} tone={(margin ?? 0) < 10 ? C.warn : undefined} />
              {owner && <Note style={{ color: C.teal700, fontWeight: '700' }}>Tap to change</Note>}
            </Card>
          );
          return owner ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${i.name}, list rate ${rupees(rate)}. Tap to change.`} onPress={() => { setFlash(null); setDraft({ ...i, rate: String(i.rate), validFrom: i.validFrom ?? '', validTo: i.validTo ?? '', isNew: false }); }}>
              {({ pressed }) => body(pressed)}
            </Pressable>
          ) : body(false);
        }}
        ListFooterComponent={
          <View style={{ gap: 10 }}>
            <Card>
              <H2>{`Customers on this list (${l.customers.length})`}</H2>
              {!l.customers.length && <Note>No customers use this list yet.</Note>}
              {l.customers.map((c) => <Action key={c.id} icon="person-outline" title={c.name} onPress={() => router.push(`/staff/pricing/customer/${c.id}`)} />)}
              {owner && <Action icon="person-add-outline" title="Put a customer on this list" onPress={() => go('assign')} />}
            </Card>
            <Card style={{ paddingVertical: 4, gap: 0 }}>
              <Action icon="time-outline" title="See the change history" onPress={() => go('history')} />
              {owner && <Action icon="create-outline" title="Change the name, or stop using it" onPress={() => go('details')} />}
            </Card>
            <Card>
              <H2>Excel</H2>
              <Note>Download this list as an Excel sheet. To import rates from Excel, use the website.</Note>
              <SmallButton icon="download-outline" title="Download Excel" busy={xls.busy} onPress={() => void excel()} />
              {!!xls.error && <Alert>{xls.error}</Alert>}
            </Card>
          </View>
        } />
      {owner && (
        <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white }}>
          <Button title="Add a product" onPress={() => go('add')} />
        </View>
      )}
    </SafeAreaView>
  );
}

function ItemEditor({ l, draft, onBack, onDone }: { l: List; draft: Draft; onBack: () => void; onDone: (msg: string) => void }) {
  const utils = trpc.useUtils();
  const [d, setD] = useState(draft);
  const [confirm, setConfirm] = useState(false);
  const save = trpc.priceLists.setItems.useMutation({ onSuccess: () => Promise.all([utils.priceLists.invalidate(), utils.pricing.invalidate()]) });
  const n = toNumber(d.rate);
  const fe = fieldErrors(save.error);
  const problems = [
    n == null && 'write the rate', n != null && n <= 0 && 'the rate must be above zero', (!dayOk(d.validFrom) || !dayOk(d.validTo)) && 'fix the dates',
    dayOk(d.validFrom) && dayOk(d.validTo) && d.validFrom.trim() && d.validTo.trim() && d.validFrom.trim() > d.validTo.trim() && 'the “from” date must be on or before the “to” date',
  ].filter(Boolean);
  const send = (rate: number | null) => save.mutate({
    priceListId: l.id, source: 'ui', rows: [{ productId: d.productId, rate, validFrom: rate == null ? null : d.validFrom.trim() || null, validTo: rate == null ? null : d.validTo.trim() || null }],
  }, { onSuccess: () => onDone(rate == null ? `${d.name} is off the list. Customers on it now pay the normal rate for it.` : `${d.isNew ? 'Added' : 'Rate saved'} ✓ ${d.name}: ${rupees(rate)} on ${l.name}.`) });
  return (
    <Screen footer={confirm ? (
      <Confirm question={`Take ${d.name} off this list?`} detail="Customers on this list go back to the normal rate for it." yes="Yes, take it off" no="No, keep it"
        busy={save.isPending} error={save.error} onYes={() => send(null)} onNo={() => { save.reset(); setConfirm(false); }} />
    ) : (
      <>
        {save.error && <Alert>{errorText(save.error)}</Alert>}
        {problems.length > 0 && <Note style={{ textAlign: 'center' }}>{`To save: ${problems.join(', ')}.`}</Note>}
        <Button title={d.isNew ? 'Add to the list' : 'Save rate'} loading={save.isPending} disabled={problems.length > 0} onPress={() => send(n)} />
        <LinkButton tone="muted" title="Back" onPress={onBack} disabled={save.isPending} />
      </>
    )}>
      <Stack.Screen options={{ title: l.name }} />
      <Heading>{d.name}</Heading>
      <Note>{`${d.code} · on ${l.name}`}</Note>
      <Card>
        <Line k="Normal rate" v={rupees(d.defaultRate)} />
        <Line k="MRP" v={rupees(d.mrp)} />
        {d.purchaseCost != null && <Line k="Our cost" v={rupees(d.purchaseCost)} />}
      </Card>
      <Card>
        <Input label="List rate in ₹ (before GST)" keyboardType="decimal-pad" value={d.rate} onChangeText={(rate) => setD({ ...d, rate })} error={fe['rows.0.rate']} maxLength={12} />
        {n != null && n > d.mrp && <Alert tone="warn">{`This is above the MRP (${rupees(d.mrp)}).`}</Alert>}
        <DateInput label="Starts on (optional)" value={d.validFrom} onChange={(validFrom) => setD({ ...d, validFrom })} hint="Leave empty to start now." />
        <DateInput label="Ends on (optional)" value={d.validTo} onChange={(validTo) => setD({ ...d, validTo })} hint="Leave empty to keep it with no end." />
        {!!(fe['rows.0.validTo']) && <Alert>{fe['rows.0.validTo']}</Alert>}
      </Card>
      {!d.isNew && <Card style={{ paddingVertical: 4, gap: 0 }}><Action icon="trash-outline" title="Take it off this list" danger onPress={() => setConfirm(true)} /></Card>}
    </Screen>
  );
}

type Product = RouterOutputs['products']['list'][number];
function AddProduct({ l, onBack, onPick }: { l: List; onBack: () => void; onPick: (p: Product) => void }) {
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim().slice(0, 100));
  const found = trpc.products.list.useQuery({ q: term }, { enabled: term.length >= 2 });
  const on = new Set(l.items.map((i) => i.productId));
  const rows = (found.data ?? []).filter((p) => !on.has(p.id));
  return (
    <Screen footer={<LinkButton tone="muted" title="Back" onPress={onBack} />}>
      <Stack.Screen options={{ title: l.name }} />
      <Heading>Add a product</Heading>
      <SearchBox value={search} onChange={setSearch} placeholder="Product name or code" />
      {term.length < 2 && <Note>Type at least 2 letters of the product’s name or code.</Note>}
      {term.length >= 2 && found.isLoading && <Loading />}
      {found.error && <Alert>{errorText(found.error)}</Alert>}
      {found.data && !rows.length && <Note>{found.data.length ? 'Those products are already on this list.' : `No product matches “${term}”.`}</Note>}
      {rows.slice(0, 40).map((p) => (
        <Tap key={p.id} label={`Add ${p.name}`} onPress={() => onPick(p)}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>{p.name}</Text>
          <Note>{`${p.code} · normal rate ${rupees(p.defaultRate)} · MRP ${rupees(p.mrp)}`}</Note>
        </Tap>
      ))}
    </Screen>
  );
}

function AssignCustomer({ l, onBack, onDone }: { l: List; onBack: () => void; onDone: (msg: string) => void }) {
  const utils = trpc.useUtils();
  const customers = trpc.pricing.customers.useQuery();
  const [search, setSearch] = useState('');
  const assign = trpc.priceLists.assignCustomers.useMutation({ onSuccess: () => Promise.all([utils.priceLists.invalidate(), utils.pricing.invalidate(), utils.customers.invalidate()]) });
  const term = search.trim().toLowerCase();
  const on = new Set(l.customers.map((c) => c.id));
  const rows = (customers.data ?? []).filter((c) => !on.has(c.id) && (!term || `${c.name} ${c.code}`.toLowerCase().includes(term)));
  return (
    <Screen footer={<LinkButton tone="muted" title="Back" onPress={onBack} disabled={assign.isPending} />}>
      <Stack.Screen options={{ title: l.name }} />
      <Heading>Put a customer on this list</Heading>
      <Note>{`They will pay the ${l.name} rates. A customer is on one list at a time, so this moves them off any other list.`}</Note>
      <SearchBox value={search} onChange={setSearch} placeholder="Find a customer" />
      {assign.isPending && <Loading />}
      {assign.error && <Alert>{errorText(assign.error)}</Alert>}
      {!customers.data && <Waiting q={customers} />}
      {customers.data && !rows.length && <Note>{term ? `No customer matches “${search.trim()}”.` : 'Every customer is already on this list.'}</Note>}
      {rows.slice(0, 60).map((c) => (
        <Tap key={c.id} label={`Put ${c.name} on this list`} onPress={() => { if (!assign.isPending) assign.mutate({ priceListId: l.id, customerIds: [c.id] }, { onSuccess: () => onDone(`${c.name} is now on ${l.name} ✓`) }); }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>{c.name}</Text>
          <Note>{`${c.code}${c.priceList ? ` · now on ${c.priceList.name}` : ' · now on normal prices'}`}</Note>
        </Tap>
      ))}
    </Screen>
  );
}

function DetailsEditor({ l, onBack, onDone }: { l: List; onBack: () => void; onDone: (msg: string) => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ name: l.name, description: l.description ?? '', isActive: l.isActive });
  const [confirm, setConfirm] = useState(false);
  const update = trpc.priceLists.update.useMutation({ onSuccess: () => Promise.all([utils.priceLists.invalidate(), utils.pricing.invalidate()]) });
  const fe = fieldErrors(update.error);
  const turningOff = l.isActive && !v.isActive;
  const send = () => update.mutate({ id: l.id, ...v }, { onSuccess: () => onDone(turningOff ? `${v.name} is no longer in use.` : 'Details saved ✓') });
  return (
    <Screen footer={confirm ? (
      <Confirm question={`Stop using ${l.name}?`} detail={`The ${l.customers.length} customer${l.customers.length === 1 ? '' : 's'} on it go back to normal rates (their own special prices stay). You can turn it on again later.`}
        yes="Yes, stop using it" no="No, keep it in use" busy={update.isPending} error={update.error} onYes={send} onNo={() => { update.reset(); setConfirm(false); }} />
    ) : (
      <>
        {update.error && <Alert>{errorText(update.error)}</Alert>}
        <Button title="Save details" loading={update.isPending} disabled={v.name.trim().length < 2} onPress={() => (turningOff ? setConfirm(true) : send())} />
        <LinkButton tone="muted" title="Back" onPress={onBack} disabled={update.isPending} />
      </>
    )}>
      <Stack.Screen options={{ title: l.name }} />
      <Heading>Price list details</Heading>
      <Card>
        <Input label="Name" value={v.name} onChangeText={(name) => setV({ ...v, name })} error={fe.name} maxLength={80} />
        <Input label="Description (optional)" value={v.description} onChangeText={(description) => setV({ ...v, description })} error={fe.description} maxLength={300} />
        <Check label="In use" hint="Customers on this list pay its rates only while it is in use." value={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} />
      </Card>
    </Screen>
  );
}
