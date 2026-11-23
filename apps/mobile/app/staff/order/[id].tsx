import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { formatDate, formatDateTime, istDateString, nextStatuses, ORDER_STATUS_LABEL, type OrderStatus } from '@kush/core';
import { Scanner } from '@/components/scanner';
import { Alert, Button, Card, Field, H2, KV, Loading, P, Row, Screen, Small } from '@/components/ui';
import { OrderStatusBadge } from '@/components/status';
import { useCan } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** Order detail for staff: status steps, scan-to-pack, dispatch details. */
export default function StaffOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const utils = trpc.useUtils();
  const q = trpc.orders.get.useQuery({ id: id! });
  const setStatus = trpc.orders.setStatus.useMutation({ onSuccess: () => utils.orders.invalidate() });
  const verify = trpc.orders.verifyPacked.useMutation({ onSuccess: (r) => { if (r.ok) void utils.orders.invalidate(); } });
  const [mode, setMode] = useState<null | 'pack' | 'dispatch' | 'note'>(null);
  const [noteFor, setNoteFor] = useState<OrderStatus | null>(null);
  const [note, setNote] = useState('');
  const [d, setD] = useState({ courier: '', docketNo: '', vehicleNo: '', dispatchDate: istDateString() });
  const counts = useRef<Record<string, number>>({});
  const [packed, setPacked] = useState<Record<string, number>>({});
  const [packMsg, setPackMsg] = useState<string | null>(null);
  if (!q.data) return q.error ? <Screen><Alert>{errorText(q.error)}</Alert></Screen> : <Loading />;
  const o = q.data;
  const next = nextStatuses(o.status);

  async function onPackScan(code: string) {
    const r = await utils.scan.resolve.fetch({ code }, { staleTime: 0 }).catch(() => null);
    if (!r?.found) { setPackMsg(`Unknown barcode ${code}`); return; }
    const line = o.lines.find((l) => l.variant.id === r.variant.id);
    if (!line) { setPackMsg(`${r.product.name} ${r.variant.label ?? ''} is NOT on this order`); return; }
    const n = (counts.current[line.variant.id] ?? 0) + 1;
    if (n > line.qty) { setPackMsg(`Too many: only ${line.qty} ordered`); return; }
    counts.current = { ...counts.current, [line.variant.id]: n };
    setPacked(counts.current); setPackMsg(null);
  }
  const allPacked = o.lines.every((l) => (packed[l.variant.id] ?? 0) >= l.qty);

  function go(s: OrderStatus) {
    if (s === 'DISPATCHED') return setMode('dispatch');
    if (s === 'CANCELLED' || s === 'ON_HOLD') { setNoteFor(s); setMode('note'); return; }
    setStatus.mutate({ id: o.id, status: s });
  }
  return (
    <Screen>
      <Stack.Screen options={{ title: o.number }} />
      <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700' }}>{o.customer.name}</P><OrderStatusBadge status={o.status} /></Row>
      {o.forDoctor && <Small>For {o.forDoctor.name}</Small>}
      {o.surgeryDate && <Alert tone="warn">Surgery {formatDate(o.surgeryDate)}{o.patientName ? ` · ${o.patientName}` : ''}</Alert>}
      {o.customerNote && <Alert tone="info">Customer note: {o.customerNote}</Alert>}
      <Card>
        {o.lines.map((l) => (
          <Row key={l.id} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}><P>{l.variant.product.name}</P><Small>{l.variant.label ?? l.variant.sku}</Small></View>
            <View style={{ alignItems: 'flex-end' }}>
              <P style={{ fontWeight: '700' }}>{mode === 'pack' ? `${packed[l.variant.id] ?? 0} / ${l.qty}` : l.qty}</P>
              {l.backorder > 0 && o.status !== 'PLACED' && <Small style={{ color: C.warn }}>{l.backorder} to send</Small>}
            </View>
          </Row>
        ))}
      </Card>
      {setStatus.error && <Alert>{errorText(setStatus.error)}</Alert>}
      {mode === null && can('UPDATE_ORDER_STATUS') && next.length > 0 && (
        <View style={{ gap: 8 }}>
          {can('SCAN_DISPATCH') && ['PLACED', 'CONFIRMED'].includes(o.status) && <Button title="Pack & verify by scanning" onPress={() => setMode('pack')} />}
          {next.map((s) => <Button key={s} variant={s === 'CANCELLED' ? 'danger' : 'secondary'} loading={setStatus.isPending && setStatus.variables?.status === s} title={s === 'ON_HOLD' ? 'Put on hold' : s === 'CANCELLED' ? 'Cancel order' : `Mark ${ORDER_STATUS_LABEL[s].toLowerCase()}`} onPress={() => go(s)} />)}
        </View>
      )}
      {mode === 'pack' && (
        <Card>
          <H2>Scan each box into the parcel</H2>
          <Scanner onScan={onPackScan} height={200} />
          {packMsg && <Alert>{packMsg}</Alert>}
          {verify.data && !verify.data.ok && <Alert>{verify.data.problems.join('; ')}</Alert>}
          <Button title="Mark packed" disabled={!allPacked} loading={verify.isPending} onPress={() => verify.mutate({ id: o.id, scanned: Object.entries(packed).map(([variantId, qty]) => ({ variantId, qty })) }, { onSuccess: (r) => { if (r.ok) setMode(null); } })} />
          <Button variant="secondary" title="Close" onPress={() => setMode(null)} />
        </Card>
      )}
      {mode === 'dispatch' && (
        <Card>
          <H2>Dispatch details</H2>
          {!o.invoices.some((i) => i.status === 'ISSUED') && <Alert tone="warn">Raise the tax invoice first (Bill tab or web).</Alert>}
          <Field label="Courier / transporter" value={d.courier} onChangeText={(v) => setD({ ...d, courier: v })} />
          <Field label="Docket / LR no." value={d.docketNo} onChangeText={(v) => setD({ ...d, docketNo: v })} />
          <Field label="Vehicle no. (optional)" value={d.vehicleNo} onChangeText={(v) => setD({ ...d, vehicleNo: v })} />
          <Field label="Dispatch date" value={d.dispatchDate} onChangeText={(v) => setD({ ...d, dispatchDate: v })} />
          <Button title="Mark dispatched" loading={setStatus.isPending} onPress={() => setStatus.mutate({ id: o.id, status: 'DISPATCHED', dispatch: d }, { onSuccess: () => setMode(null) })} />
          <Button variant="secondary" title="Back" onPress={() => setMode(null)} />
        </Card>
      )}
      {mode === 'note' && noteFor && (
        <Card>
          <Field label={noteFor === 'CANCELLED' ? 'Why is the order cancelled?' : 'Why is it on hold?'} value={note} onChangeText={setNote} />
          <Button variant={noteFor === 'CANCELLED' ? 'danger' : 'primary'} title={noteFor === 'CANCELLED' ? 'Cancel order' : 'Put on hold'} disabled={!note.trim()} onPress={() => setStatus.mutate({ id: o.id, status: noteFor, note }, { onSuccess: () => { setMode(null); setNote(''); } })} />
          <Button variant="secondary" title="Back" onPress={() => setMode(null)} />
        </Card>
      )}
      <H2>History</H2>
      <Card>{o.events.map((e) => <KV key={e.id} k={`${ORDER_STATUS_LABEL[e.status as OrderStatus]} · ${e.by}`} v={formatDateTime(e.at)} />)}</Card>
      {o.dispatches.map((x) => <Small key={x.id}>Dispatched {x.dispatchDate ? formatDate(x.dispatchDate) : ''} {x.courier ?? ''} {x.docketNo ?? ''}</Small>)}
    </Screen>
  );
}
