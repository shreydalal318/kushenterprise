import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { DISPATCH_METHOD_LABEL, DISPATCH_METHODS, formatDate, formatDateTime, istDateString, nextStatuses, type DispatchMethod, type OrderStatus } from '@kush/core';
import { dispatchNext } from '@/components/bill-form';
import { readableError } from '@/components/errors';
import { HandlerPicker } from '@/components/handler-picker';
import { LinkedPos, OrderFromSupplier, StockNote } from '@/components/order-sourcing';
import { StaffStatusBadge, surgeryIn, surgeryText, surgeryTone } from '@/components/status';
import { Alert, Button, Card, Field, H2, KV, LinkButton, Loading, P, Row, Screen, Small } from '@/components/ui';
import { useAuth, useCan } from '@/lib/auth';
import { docPath, openPdf } from '@/lib/documents';
import { errorText, rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type Order = RouterOutputs['orders']['get'];
type Icon = keyof typeof Ionicons.glyphMap;
const SOURCE: Record<string, string> = { STAFF: 'phone / WhatsApp', PORTAL: 'website', MOBILE_APP: 'customer app' };
const METHOD_ICON: Record<DispatchMethod, Icon> = { OWN_DELIVERY: 'bicycle-outline', COURIER: 'cube-outline', TRANSPORT: 'bus-outline', PICKUP: 'storefront-outline' };
/** A real calendar day as YYYY-MM-DD (2026-02-30 is not). */
const isDay = (v: string) => { const d = new Date(`${v}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v); };
const howSent = (x: Order['dispatches'][number]) =>
  x.method === 'OWN_DELIVERY' ? `Our staff: ${x.deliveryPersonName ?? 'someone'}${x.vehicleNo ? ` · vehicle ${x.vehicleNo}` : ''}`
    : x.method === 'COURIER' ? `Courier: ${x.courier ?? ''}${x.docketNo ? ` · docket ${x.docketNo}` : ''}`
      : x.method === 'TRANSPORT' ? `Transport: ${x.courier ?? ''}${x.docketNo ? ` · LR ${x.docketNo}` : ''}`
        : 'Customer collects it from the store';

/** One step of the tracker: a tick or its number, the line down to the next step, and what happened. */
function Step({ n, title, done, lineOn, last, children }: { n: number; title: string; done: boolean; lineOn?: boolean; last?: boolean; children?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: done ? C.teal700 : C.line, backgroundColor: done ? C.teal700 : C.white, alignItems: 'center', justifyContent: 'center' }}>
          {done ? <Ionicons name="checkmark" size={18} color={C.white} /> : <Text style={{ color: C.muted, fontWeight: '700' }}>{n}</Text>}
        </View>
        {!last && <View style={{ flex: 1, width: 2, minHeight: 14, backgroundColor: lineOn ? C.teal700 : C.line }} />}
      </View>
      <View style={{ flex: 1, gap: 3, paddingTop: 3, paddingBottom: last ? 0 : 16 }}>
        <P style={{ fontWeight: '700', color: done ? C.navy : C.muted }}>{title}</P>
        {children}
      </View>
    </View>
  );
}

function ActionRow({ icon, title, onPress, danger }: { icon: Icon; title: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={20} color={danger ? C.danger : C.teal700} />
      <Text style={{ fontSize: 16, fontWeight: '600', color: danger ? C.danger : C.ink }}>{title}</Text>
    </Pressable>
  );
}

/** One order, top to bottom: where it is (Order → Invoice → Dispatch → Done), what to know, and one button for the next step. */
export default function StaffOrder() {
  const { id, saved } = useLocalSearchParams<{ id: string; saved?: string }>();
  const can = useCan();
  const { me } = useAuth();
  const utils = trpc.useUtils();
  const q = trpc.orders.get.useQuery({ id: id! });
  const sq = trpc.orders.shortfall.useQuery({ id: id! });
  const staff = trpc.orders.staff.useQuery();
  const setStatus = trpc.orders.setStatus.useMutation({ onSuccess: () => utils.orders.invalidate() });
  const deliver = trpc.orders.markDelivered.useMutation({ onSuccess: () => { void utils.orders.invalidate(); void utils.deliveries.invalidate(); } });
  // Waits for the refetch, so the picker closes on the new name rather than the old one.
  const assign = trpc.orders.assign.useMutation({ onSuccess: () => utils.orders.invalidate() });
  const [mode, setModeState] = useState<null | 'dispatch' | 'deliver' | 'hold' | 'cancel' | 'source'>(null);
  const [assigning, setAssigning] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [note, setNote] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [d, setD] = useState({ method: '' as '' | DispatchMethod, courier: '', docketNo: '', vehicleNo: '', dispatchDate: istDateString(), personId: '', personName: '', personMobile: '' });
  const [pdf, setPdf] = useState<{ id: string | null; error: string | null }>({ id: null, error: null });
  // The short green line after each action ("Dispatched ✓ Next: …"); a new order arrives with ?saved=1.
  const [flash, setFlash] = useState<string | null>(saved ? 'Order saved ✓' : null);
  // Opening or closing a form starts without the last form's error.
  const setMode = (m: typeof mode) => { setStatus.reset(); deliver.reset(); setConfirmCancel(false); setModeState(m); if (m) setFlash(null); };
  const finish = (msg: string) => { setModeState(null); setShowMore(false); setNote(''); setFlash(msg); };
  // "Dispatch this order" on the invoice just made comes straight back to the dispatch form.
  useFocusEffect(useCallback(() => { if (id && dispatchNext.delete(id)) { setFlash(null); setModeState('dispatch'); } }, [id]));

  if (!q.data) return q.error
    ? <Screen><Alert>{errorText(q.error)}</Alert><Button variant="secondary" title="Try again" loading={q.isFetching} onPress={() => void q.refetch()} /></Screen>
    : <Loading />;
  const o = q.data;
  const next = nextStatuses(o.status);
  const stock = new Map((sq.data?.lines ?? []).map((l) => [l.variantId, l]));
  const toOrder = (sq.data?.lines ?? []).reduce((t, l) => t + l.toOrder, 0);
  const isOpen = !['CANCELLED', 'DELIVERED'].includes(o.status);
  const backorder = o.lines.reduce((t, l) => t + l.backorder, 0);
  const total = o.lines.reduce((t, l) => t + l.amount, 0);
  const hasInvoice = o.invoices.some((i) => i.status === 'ISSUED');
  const sent = o.dispatches.length > 0;
  const delivered = o.status === 'DELIVERED';
  // A back-order invoice raised after the order went out still has to be dispatched.
  const toSend = o.invoices.find((i) => i.status === 'ISSUED' && !o.dispatches.some((x) => x.invoiceId === i.id));
  const canStatus = can('UPDATE_ORDER_STATUS');
  const canDispatch = canStatus && ((o.status === 'PACKED' && hasInvoice) || (o.status === 'DISPATCHED' && !!toSend));
  // Strict: once it is with one of our staff, only that person (or the owner) marks it delivered, even without
  // the status permission. A courier, transport or pickup can be marked by anyone with that permission.
  const drops = o.dispatches.filter((x) => !x.deliveredAt && x.deliveryPersonId);
  const dropNames = drops.map((x) => (x.deliveryPersonId === me?.id ? 'you' : x.deliveryPersonName ?? 'the delivery person')).join(' or ');
  const canDeliver = o.status === 'DISPATCHED' && (drops.length ? me?.role === 'OWNER' || drops.some((x) => x.deliveryPersonId === me?.id) : canStatus);
  const canInvoice = can('CREATE_TAX_INVOICE');
  const canSource = isOpen && backorder > 0 && !!sq.data && can('CREATE_PURCHASE_ORDERS');
  // Once it is out the delivery is with whoever took it (a later dispatch can hand it to someone else).
  const canAssign = isOpen && o.status !== 'DISPATCHED' && (can('CREATE_ORDERS') || canStatus);
  const handlerId = o.assignedTo?.id ?? null;
  const busy = setStatus.isPending;
  // Invoiced goods are packed: an invoiced order resumes as Invoiced, otherwise as New, the way it was.
  const resumeTo: OrderStatus | null = o.status !== 'ON_HOLD' ? null : hasInvoice ? 'PACKED' : o.events.some((e) => e.status === 'CONFIRMED') ? 'CONFIRMED' : 'PLACED';
  const latest = (s: string) => [...o.events].reverse().find((e) => e.status === s);
  const stopped = o.status === 'ON_HOLD' || o.status === 'CANCELLED' ? latest(o.status) : undefined;
  const pastHolds = o.events.filter((e) => e.status === 'ON_HOLD' && e.note && e !== stopped);
  const deliveredBy = [...o.dispatches].filter((x) => x.deliveredAt).sort((a, b) => b.deliveredAt!.getTime() - a.deliveredAt!.getTime())[0];
  const goInvoice = () => router.push(`/staff/invoice?orderId=${o.id}`);
  const openDeliver = () => { setReceivedBy(''); setMode('deliver'); };
  const view = mode === 'dispatch' && !canDispatch ? null : mode;

  async function showPdf(invId: string, number: string) {
    setPdf({ id: invId, error: null });
    try { await openPdf(docPath('invoice', invId), `${number}.pdf`); setPdf({ id: null, error: null }); }
    catch (e) { const t = errorText(e); setPdf({ id: null, error: /pdf/i.test(t) ? t : `Could not open the PDF. ${t}` }); }
  }

  if (view === 'source' && sq.data) return <Screen><Stack.Screen options={{ title: o.number }} /><OrderFromSupplier s={sq.data} onClose={() => setMode(null)} /></Screen>;

  if (view === 'dispatch') {
    const method = d.method || (o.suggestedDispatch as DispatchMethod);
    // Starts with the person chosen on the order; picking someone else makes them the delivery person.
    const personId = d.personId || handlerId || '';
    const other = personId === 'OTHER';
    const missing = [
      method === 'OWN_DELIVERY' && !personId && 'choose who is delivering it',
      method === 'OWN_DELIVERY' && other && !d.personName.trim() && 'write the delivery person’s name',
      method === 'COURIER' && !d.courier.trim() && 'write the courier company',
      method === 'TRANSPORT' && !d.courier.trim() && 'write the transporter',
      !isDay(d.dispatchDate.trim()) && 'write the date as YYYY-MM-DD',
    ].filter(Boolean);
    const save = () => setStatus.mutate({ id: o.id, status: 'DISPATCHED', dispatch: {
      method, dispatchDate: d.dispatchDate.trim(), invoiceId: toSend?.id, vehicleNo: method === 'OWN_DELIVERY' ? d.vehicleNo.trim() || null : null,
      courier: method === 'COURIER' || method === 'TRANSPORT' ? d.courier.trim() : null, docketNo: method === 'COURIER' || method === 'TRANSPORT' ? d.docketNo.trim() || null : null,
      deliveryPersonId: method === 'OWN_DELIVERY' && !other ? personId : null,
      deliveryPersonName: method === 'OWN_DELIVERY' && other ? d.personName.trim() : null, deliveryPersonMobile: method === 'OWN_DELIVERY' && other ? d.personMobile.trim() || null : null,
    } }, { onSuccess: () => finish(method === 'PICKUP' ? 'Ready for pickup ✓ Next: mark it delivered when the customer collects it.' : 'Dispatched ✓ Next: mark it delivered when it reaches the customer.') });
    return (
      <Screen footer={
        <>
          {setStatus.error && <Alert>{readableError(setStatus.error)}</Alert>}
          {missing.length > 0 && <Small style={{ textAlign: 'center' }}>To save: {missing.join(', ')}.</Small>}
          <Button title={method === 'PICKUP' ? 'Mark ready for pickup' : 'Mark dispatched'} loading={busy} disabled={missing.length > 0} onPress={save} />
          <LinkButton tone="muted" title="Back" onPress={() => setMode(null)} />
        </>
      }>
        <Stack.Screen options={{ title: o.number }} />
        <H2>How is it going out?</H2>
        <Small>{sent && toSend ? `Sending invoice ${toSend.number}.` : `${o.customer.name} · ${rupees(total)}`}</Small>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {DISPATCH_METHODS.map((k) => (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: method === k }} accessibilityLabel={DISPATCH_METHOD_LABEL[k]} onPress={() => setD({ ...d, method: k })}
              style={{ width: '48%', minHeight: 64, padding: 10, gap: 4, borderRadius: R.md, borderWidth: method === k ? 2 : 1, borderColor: method === k ? C.teal700 : C.line, backgroundColor: method === k ? C.aqua50 : C.white }}>
              <Ionicons name={METHOD_ICON[k]} size={22} color={method === k ? C.teal700 : C.muted} />
              <P style={{ fontWeight: method === k ? '700' : '500' }}>{DISPATCH_METHOD_LABEL[k]}</P>
              {k === o.suggestedDispatch && <Small style={{ color: C.teal700 }}>Suggested</Small>}
            </Pressable>
          ))}
        </View>
        {method === 'OWN_DELIVERY' && (
          <Card>
            <H2>Who is delivering it?</H2>
            <Small>Only this person (or the owner) can mark it delivered.</Small>
            {[...(staff.data ?? []).map((u) => ({ id: u.id, label: `${u.name}${u.mobile ? ` · ${u.mobile}` : ''}` })), { id: 'OTHER', label: 'Someone else' }].map((u) => (
              <Pressable key={u.id} accessibilityRole="radio" accessibilityState={{ selected: personId === u.id }} accessibilityLabel={u.label} onPress={() => setD({ ...d, personId: u.id })} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 44 }}>
                <Ionicons name={personId === u.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={C.teal700} /><P>{u.label}</P>
              </Pressable>
            ))}
            {other && <><Field label="Name" value={d.personName} onChangeText={(v) => setD({ ...d, personName: v })} maxLength={80} /><Field label="Mobile (optional)" keyboardType="phone-pad" value={d.personMobile} onChangeText={(v) => setD({ ...d, personMobile: v })} maxLength={20} /></>}
            <Field label="Vehicle no. (optional)" autoCapitalize="characters" value={d.vehicleNo} onChangeText={(v) => setD({ ...d, vehicleNo: v })} maxLength={30} />
          </Card>
        )}
        {(method === 'COURIER' || method === 'TRANSPORT') && (
          <Card>
            <Field label={method === 'COURIER' ? 'Courier company' : 'Transporter'} value={d.courier} onChangeText={(v) => setD({ ...d, courier: v })} maxLength={80} />
            <Field label={method === 'COURIER' ? 'Docket no. (optional)' : 'LR no. (optional)'} value={d.docketNo} onChangeText={(v) => setD({ ...d, docketNo: v })} maxLength={60} />
          </Card>
        )}
        {method === 'PICKUP' && <Alert tone="info">The customer collects it from the store. Mark it delivered when they do.</Alert>}
        <Field label="Date sent (YYYY-MM-DD)" value={d.dispatchDate} onChangeText={(v) => setD({ ...d, dispatchDate: v })} keyboardType="numbers-and-punctuation" maxLength={10} />
      </Screen>
    );
  }

  if (view === 'deliver') {
    const ok = receivedBy.trim().length >= 2;
    return (
      <Screen footer={
        <>
          {deliver.error && <Alert>{readableError(deliver.error)}</Alert>}
          {!ok && <Small style={{ textAlign: 'center' }}>To save: write who received it.</Small>}
          <Button title="Mark delivered" loading={deliver.isPending} disabled={!ok} onPress={() => deliver.mutate({ id: o.id, receivedBy: receivedBy.trim() }, { onSuccess: () => finish('Delivered ✓ This order is done.') })} />
          <LinkButton tone="muted" title="Back" onPress={() => setMode(null)} />
        </>
      }>
        <Stack.Screen options={{ title: o.number }} />
        <H2>Who received it?</H2>
        <Small>{o.customer.name}</Small>
        <Field label="Received by (name)" placeholder="e.g. Sister Mary, OT store" value={receivedBy} onChangeText={setReceivedBy} maxLength={80} autoFocus />
      </Screen>
    );
  }

  if (view === 'hold' || view === 'cancel') {
    const cancel = view === 'cancel';
    const save = () => setStatus.mutate({ id: o.id, status: cancel ? 'CANCELLED' : 'ON_HOLD', note: note.trim() }, { onSuccess: () => finish(cancel ? 'Order cancelled.' : 'Put on hold ✓ Resume it when it can go ahead.') });
    return (
      <Screen footer={
        <>
          {setStatus.error && <Alert>{readableError(setStatus.error)}</Alert>}
          {confirmCancel ? (
            <>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.danger, textAlign: 'center' }}>Cancel this order? This can’t be undone.</Text>
              <Button variant="danger" title="Yes, cancel the order" loading={busy} onPress={save} />
              <LinkButton tone="muted" title="No, keep it" onPress={() => setConfirmCancel(false)} />
            </>
          ) : (
            <>
              {!note.trim() && <Small style={{ textAlign: 'center' }}>To save: write the reason.</Small>}
              <Button variant={cancel ? 'danger' : 'primary'} title={cancel ? 'Cancel order' : 'Put on hold'} loading={busy} disabled={!note.trim()} onPress={() => (cancel ? setConfirmCancel(true) : save())} />
              <LinkButton tone="muted" title="Back" onPress={() => setMode(null)} />
            </>
          )}
        </>
      }>
        <Stack.Screen options={{ title: o.number }} />
        <H2>{cancel ? 'Cancel this order' : 'Put this order on hold'}</H2>
        <Small>{cancel ? 'Write why, so everyone knows.' : 'Nothing more happens to it until someone resumes it. Write why, so everyone knows.'}</Small>
        <Field label={cancel ? 'Why is it cancelled?' : 'Why is it on hold?'} value={note} onChangeText={setNote} maxLength={300} multiline autoFocus />
      </Screen>
    );
  }

  // The one next step, at the bottom. A step this person may not do says who can.
  const ask = 'You can’t do this yourself: ask the owner.';
  const step: { hint: string; title?: string; onPress?: () => void } | null =
    o.status === 'PLACED' || o.status === 'CONFIRMED' ? (canInvoice ? { hint: 'Next: make the invoice.', title: 'Make invoice', onPress: goInvoice } : { hint: `Next: make the invoice. ${ask}` })
      : o.status === 'PACKED' ? (canDispatch ? { hint: 'Next: send it out.', title: 'Dispatch order', onPress: () => setMode('dispatch') } : { hint: `Next: send it out. ${ask}` })
        : o.status === 'DISPATCHED' && toSend && canDispatch ? { hint: `Next: send out invoice ${toSend.number}.`, title: `Dispatch invoice ${toSend.number}`, onPress: () => setMode('dispatch') }
          : o.status === 'DISPATCHED' ? (canDeliver ? { hint: 'Next: mark it delivered when it reaches the customer.', title: 'Mark delivered', onPress: openDeliver } : { hint: drops.length ? `On its way with ${dropNames}. Only ${dropNames} can mark it delivered.` : 'On its way. Ask the owner to mark it delivered when it arrives.' })
            : o.status === 'ON_HOLD' ? (canStatus && resumeTo ? { hint: 'On hold. Next: resume it when it can go ahead.', title: 'Resume order', onPress: () => setStatus.mutate({ id: o.id, status: resumeTo }, { onSuccess: () => finish('Order resumed ✓') }) } : { hint: `On hold. ${ask}` })
              : delivered ? { hint: 'Delivered ✓ Nothing more to do.' } : null;
  const invoiceRest = isOpen && hasInvoice && backorder > 0 && ['PACKED', 'DISPATCHED'].includes(o.status) && canInvoice;
  const more: { icon: Icon; title: string; onPress: () => void; danger?: boolean }[] = [
    ...(canSource ? [{ icon: 'cart-outline' as Icon, title: 'Order from supplier', onPress: () => setMode('source') }] : []),
    // When a later invoice is waiting to go out, delivering what already went is the less likely step.
    ...(toSend && canDeliver ? [{ icon: 'checkmark-done-outline' as Icon, title: 'Mark delivered', onPress: openDeliver }] : []),
    ...(next.includes('ON_HOLD') && canStatus ? [{ icon: 'pause-circle-outline' as Icon, title: 'Put on hold', onPress: () => { setNote(''); setMode('hold'); } }] : []),
    // The server refuses to cancel an order with an issued invoice; that invoice is cancelled first (web).
    ...(next.includes('CANCELLED') && !hasInvoice && canStatus ? [{ icon: 'close-circle-outline' as Icon, title: 'Cancel order', danger: true, onPress: () => { setNote(''); setMode('cancel'); } }] : []),
  ];
  const tone = o.surgeryDate ? surgeryTone(o.surgeryDate, !isOpen) : 'neutral';

  return (
    <Screen footer={(step || invoiceRest) && (
      <>
        {step && <Text style={{ fontSize: 15, fontWeight: '600', color: C.navy, textAlign: 'center' }}>{step.hint}</Text>}
        {setStatus.error && <Alert>{readableError(setStatus.error)}</Alert>}
        {step?.title && step.onPress && <Button title={step.title} loading={busy} onPress={step.onPress} />}
        {invoiceRest && <LinkButton title="Invoice remaining items" icon={<Ionicons name="receipt-outline" size={18} color={C.teal700} />} onPress={goInvoice} />}
      </>
    )}>
      <Stack.Screen options={{ title: o.number }} />
      {flash && <Alert tone="ok">{flash}</Alert>}
      {stopped && <Alert tone={o.status === 'CANCELLED' ? 'danger' : 'warn'}>{o.status === 'CANCELLED' ? 'Cancelled' : 'On hold'}{stopped.note ? `: ${stopped.note}` : ''} ({stopped.by}, {formatDate(stopped.at)})</Alert>}
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy }}>{o.customer.name}</Text>
          {o.forDoctor && <Small>For {o.forDoctor.name}</Small>}
        </View>
        <StaffStatusBadge status={o.status} />
      </Row>

      <Card>
        <Step n={1} title="Order received" done lineOn={hasInvoice}>
          <Small>{formatDateTime(o.createdAt)}</Small>
          <Small>{o.source === 'STAFF' ? `Entered by ${o.placedBy?.name ?? 'staff'} · ${SOURCE.STAFF}` : `Placed by ${o.placedBy?.name ?? o.customer.name} on the ${SOURCE[o.source] ?? 'app'}`}</Small>
        </Step>
        <Step n={2} title="Invoiced" done={hasInvoice} lineOn={sent}>
          {!o.invoices.length && <Small>Not yet</Small>}
          {o.invoices.map((i) => (
            <Row key={i.id} style={{ justifyContent: 'space-between' }}>
              <Small style={[{ flex: 1 }, i.status !== 'ISSUED' && { textDecorationLine: 'line-through' }]}>{i.number} · {formatDate(i.date)} · {rupees(i.grandTotal)}{i.status !== 'ISSUED' ? ' (cancelled)' : ''}</Small>
              {i.status === 'ISSUED' && (
                <Pressable accessibilityRole="button" accessibilityLabel={`Open the PDF of invoice ${i.number}`} hitSlop={6} disabled={!!pdf.id} onPress={() => void showPdf(i.id, i.number)}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.teal700, opacity: pressed ? 0.6 : 1 })}>
                  {pdf.id === i.id ? <ActivityIndicator size="small" color={C.teal700} /> : <Ionicons name="document-text-outline" size={16} color={C.teal700} />}
                  <Text style={{ color: C.teal700, fontWeight: '700' }}>PDF</Text>
                </Pressable>
              )}
            </Row>
          ))}
          {pdf.error && <Alert>{pdf.error}</Alert>}
        </Step>
        <Step n={3} title="Dispatched" done={sent} lineOn={delivered}>
          {!sent && <Small>Not yet</Small>}
          {o.dispatches.map((x) => <Small key={x.id}>{howSent(x)} · {formatDate(x.dispatchDate)}{o.invoices.length > 1 && x.invoice ? ` · invoice ${x.invoice.number}` : ''}</Small>)}
          {sent && toSend && isOpen && <Small style={{ color: C.warn }}>Invoice {toSend.number} is not sent out yet</Small>}
        </Step>
        <Step n={4} title="Delivered" done={delivered} last>
          {delivered
            ? <Small>{formatDateTime(deliveredBy?.deliveredAt ?? latest('DELIVERED')?.at)}{deliveredBy?.receivedBy ? ` · received by ${deliveredBy.receivedBy}` : ''}</Small>
            : <Small>Not yet</Small>}
        </Step>
        {pastHolds.map((e) => <Small key={e.id}>Was on hold {formatDate(e.at)} ({e.by}): {e.note}</Small>)}
      </Card>

      {o.surgeryDate && (
        <Alert tone={tone === 'danger' ? 'danger' : tone === 'warn' ? 'warn' : 'info'}>
          {surgeryText(o.surgeryDate)}{surgeryIn(o.surgeryDate) >= 0 ? ` · ${formatDate(o.surgeryDate)}` : ''}{o.patientName ? ` · Patient: ${o.patientName}` : ''}
        </Alert>
      )}
      {!o.surgeryDate && o.patientName && <Alert tone="info">Patient: {o.patientName}</Alert>}
      {o.customerNote && <Alert tone="info">Note: {o.customerNote}</Alert>}

      {(o.assignedTo || isOpen) && !assigning && (
        <Row style={{ justifyContent: 'space-between', minHeight: 44 }}>
          <Row style={{ flex: 1 }}>
            <Ionicons name="person-circle-outline" size={22} color={o.assignedTo ? C.teal700 : C.warn} />
            {o.assignedTo ? <P style={{ flex: 1 }}>Delivery by <Text style={{ fontWeight: '700' }}>{o.assignedTo.id === me?.id ? 'you' : o.assignedTo.name}</Text></P> : <P style={{ color: C.warn, fontWeight: '700' }}>Not assigned</P>}
          </Row>
          {canAssign && <LinkButton title={o.assignedTo ? 'Change' : 'Assign'} onPress={() => { assign.reset(); setFlash(null); setAssigning(true); }} />}
        </Row>
      )}
      {canAssign && assigning && (
        <Card>
          <H2>Who will deliver it?</H2>
          <Small>Only they can mark it delivered. Anyone can make the invoice and pack it meanwhile.</Small>
          <HandlerPicker value={handlerId} noneLabel="Not assigned" disabled={assign.isPending}
            onChange={(v) => (v === handlerId ? setAssigning(false) : assign.mutate({ id: o.id, assignedToId: v }, {
              onSuccess: () => { setAssigning(false); setFlash(v ? `${staff.data?.find((u) => u.id === v)?.name ?? 'They'} will deliver it ✓` : 'Set to not assigned.'); },
            }))} />
          {assign.isPending && <Small>Saving…</Small>}
          {assign.error && <Alert>{readableError(assign.error)}</Alert>}
          <LinkButton tone="muted" title="Back" disabled={assign.isPending} onPress={() => setAssigning(false)} />
        </Card>
      )}

      <Card>
        <H2>Items</H2>
        {o.lines.map((l) => (
          <Row key={l.id} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><P>{l.variant.product.name}</P><Small>{l.variant.label ?? l.variant.sku}</Small>{isOpen && <StockNote line={stock.get(l.variant.id)} />}</View>
            <View style={{ alignItems: 'flex-end' }}>
              <P style={{ fontWeight: '700' }}>× {l.qty}</P>
              {isOpen && hasInvoice && l.backorder > 0 && <Small style={{ color: C.warn }}>{l.backorder} not invoiced yet</Small>}
            </View>
          </Row>
        ))}
        <KV k="Total" v={rupees(total)} />
      </Card>
      {isOpen && toOrder > 0 && <Alert tone="warn">{toOrder} item{toOrder === 1 ? ' is' : 's are'} not in stock.{canSource ? ' Order from the supplier under More actions.' : ''}</Alert>}
      {sq.data && <LinkedPos s={sq.data} />}

      {more.length > 0 && (
        <View>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showMore }} onPress={() => setShowMore(!showMore)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 }}>
            <Text style={{ color: C.teal700, fontWeight: '700', fontSize: 15 }}>More actions</Text>
            <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={18} color={C.teal700} />
          </Pressable>
          {showMore && <Card style={{ gap: 0, paddingVertical: 4 }}>{more.map((a) => <ActionRow key={a.title} {...a} />)}</Card>}
        </View>
      )}
    </Screen>
  );
}
