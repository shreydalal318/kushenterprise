import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, formatDateTime } from '@kush/core';
import { readableError } from '@/components/errors';
import { Alert, Button, Card, Field, H2, LinkButton, P, Row, Screen } from '@/components/ui';
import { Confirm, FailedScreen, Line, MoreActions, NoAccess, Note, PoBadge, useFlash, type MoreAction, LoadingScreen } from '@/components/inventory/common';
import { useCan } from '@/lib/auth';
import { openPdf } from '@/lib/documents';
import { errorText, rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';
import { Done } from '@/components/done';

/** The website's PDF route for a purchase order (apps/web/app/api/documents/[kind]/[id]). */
const poPdfPath = (id: string) => `/api/documents/purchase-order/${id}`;

/** One purchase order (web: Purchase orders → PO): items received vs ordered, the PDF, and the one next step. */
export default function PurchaseOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const utils = trpc.useUtils();
  const allowed = can('CREATE_PURCHASE_ORDERS') || can('MANAGE_STOCK');
  const q = trpc.purchaseOrders.get.useQuery({ id: id! }, { enabled: allowed });
  const send = trpc.purchaseOrders.markSent.useMutation();
  const cancel = trpc.purchaseOrders.cancel.useMutation();
  const close = trpc.purchaseOrders.close.useMutation();
  const [flash, setFlash] = useFlash(`po:${id}`);
  const [mode, setModeState] = useState<null | 'cancel' | 'close'>(null);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [pdf, setPdf] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  if (!allowed) return <NoAccess title="Purchase order">Purchase orders need the “Create purchase orders” or “Manage stock” permission. Ask the owner.</NoAccess>;
  if (!q.data) return q.error ? <FailedScreen title="Purchase order" error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} /> : <LoadingScreen title="Purchase order" />;
  const p = q.data;
  const buyer = can('CREATE_PURCHASE_ORDERS');
  const store = can('MANAGE_STOCK');
  const open = p.status === 'SENT' || p.status === 'PARTIALLY_RECEIVED';
  const anyReceived = p.lines.some((l) => l.qtyReceived > 0);
  const ordered = p.lines.reduce((t, l) => t + l.qtyOrdered, 0);
  const received = p.lines.reduce((t, l) => t + Math.min(l.qtyReceived, l.qtyOrdered), 0);
  const pending = p.lines.reduce((t, l) => t + l.pending, 0);
  const forOrders = [...new Map(p.lines.flatMap((l) => (l.salesOrder ? [[l.salesOrder.id, l.salesOrder] as const] : []))).values()];
  const refresh = () => { void utils.purchaseOrders.invalidate(); void utils.orders.invalidate(); };
  const setMode = (m: typeof mode) => { cancel.reset(); close.reset(); send.reset(); setConfirm(false); setReason(''); if (m) setFlash(null); setModeState(m); };

  async function sharePdf() {
    setPdf({ busy: true, error: null });
    try { await openPdf(poPdfPath(p.id), `${p.number}.pdf`); setPdf({ busy: false, error: null }); }
    catch (e) { const t = errorText(e); setPdf({ busy: false, error: /pdf/i.test(t) ? t : `Could not open the PDF. ${t}` }); }
  }

  if (mode) {
    const isCancel = mode === 'cancel';
    const m = isCancel ? cancel : close;
    const ok = reason.trim().length >= 5;
    const save = () => m.mutate({ id: p.id, reason: reason.trim() }, {
      onSuccess: () => { refresh(); setModeState(null); setConfirm(false); setFlash(isCancel ? `Purchase order ${p.number} cancelled.` : 'Short-closed ✓ Nothing more is expected on this PO.'); },
      onError: () => setConfirm(false),
    });
    return (
      <Screen footer={
        <>
          {m.error && <Alert>{readableError(m.error)}</Alert>}
          {confirm ? (
            <Confirm question={isCancel ? `Cancel ${p.number}? It is kept for the record, marked cancelled. This can’t be undone.` : `Short-close ${p.number}? The ${pending} unit${pending === 1 ? '' : 's'} still due will no longer be expected. This can’t be undone.`}
              yes={isCancel ? 'Yes, cancel the PO' : 'Yes, short-close'} busy={m.isPending} onYes={save} onNo={() => setConfirm(false)} />
          ) : (
            <>
              {!ok && <Note style={{ textAlign: 'center' }}>To save: write the reason (at least 5 letters).</Note>}
              <Button variant="danger" title={isCancel ? 'Cancel PO' : 'Short-close PO'} disabled={!ok} onPress={() => setConfirm(true)} />
              <LinkButton tone="muted" title="Back" onPress={() => setMode(null)} />
            </>
          )}
        </>
      }>
        <Stack.Screen options={{ title: p.number }} />
        <H2>{isCancel ? 'Cancel this purchase order' : 'Short-close this purchase order'}</H2>
        <Note>{isCancel ? 'Use this when the order will not go ahead. Write why, so everyone knows.' : 'What has arrived stays in stock; the rest is no longer expected from the supplier. Write why.'}</Note>
        <Field label={isCancel ? 'Why is it cancelled?' : 'Why is it being closed?'} value={reason} onChangeText={setReason} maxLength={300} multiline autoFocus />
      </Screen>
    );
  }

  // The one next step, at the bottom.
  const step: { hint: string; title?: string; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap } | null =
    p.status === 'DRAFT' ? (buyer
      ? { hint: 'Next: share the PDF with the supplier, then mark it as sent.', title: 'Mark as sent', icon: 'paper-plane-outline', onPress: () => { setFlash(null); send.mutate({ id: p.id }, { onSuccess: () => { refresh(); setFlash(`Marked as sent ✓ Next: receive the goods when they arrive.`); } }); } }
      : { hint: 'Draft: not sent to the supplier yet.' })
      : open ? (store
        ? { hint: `Waiting for ${pending} unit${pending === 1 ? '' : 's'}. When they arrive:`, title: 'Receive goods', icon: 'download-outline', onPress: () => router.push(`/staff/receive?supplierId=${p.supplier.id}&poId=${p.id}`) }
        : { hint: `Waiting for ${pending} unit${pending === 1 ? '' : 's'}. The store receives them when they arrive.` })
        : p.status === 'RECEIVED' ? { hint: 'Everything has arrived ✓ Nothing more to do.' } : null;
  const more: MoreAction[] = buyer ? [
    ...(p.status === 'DRAFT' ? [{ icon: 'create-outline' as const, title: 'Edit draft', onPress: () => router.push(`/staff/purchase-orders/edit?id=${p.id}`) }] : []),
    ...(open && anyReceived ? [{ icon: 'remove-circle-outline' as const, title: 'Short-close (no more expected)', danger: true, onPress: () => setMode('close') }] : []),
    ...((p.status === 'DRAFT' || p.status === 'SENT') && !anyReceived ? [{ icon: 'close-circle-outline' as const, title: 'Cancel PO', danger: true, onPress: () => setMode('cancel') }] : []),
  ] : [];

  return (
    <Screen footer={step && (
      <>
        <Text style={{ fontSize: 15, fontWeight: '600', color: C.navy, textAlign: 'center' }}>{step.hint}</Text>
        {send.error && <Alert>{readableError(send.error)}</Alert>}
        {!!(step.title && step.onPress) && <Button title={step.title} loading={send.isPending} icon={step.icon ? <Ionicons name={step.icon} size={20} color={C.white} /> : undefined} onPress={step.onPress} />}
      </>
    )}>
      <Stack.Screen options={{ title: p.number }} />
      <Done message={flash} onShown={() => setFlash(null)} />
      {p.status === 'CANCELLED' && <Alert>Cancelled{p.cancelledAt ? ` on ${formatDateTime(p.cancelledAt)}` : ''}: {p.cancelReason}</Alert>}
      {p.status === 'CLOSED' && <Alert tone="info">Short-closed{p.closedAt ? ` on ${formatDateTime(p.closedAt)}` : ''}: {p.closeReason}. Nothing more is expected.</Alert>}
      {forOrders.length > 0 && (
        <Card style={{ backgroundColor: C.aqua50, borderColor: C.aqua }}>
          <P>Ordered for a customer. The team is told when these goods arrive.</P>
          {forOrders.map((so) => can('VIEW_ORDERS') ? (
            <Pressable key={so.id} accessibilityRole="button" accessibilityLabel={`Open order ${so.number}`} onPress={() => router.push(`/staff/order/${so.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.teal700 }}>{so.number}</Text><Note style={{ flex: 1 }}>{so.customer}</Note><Ionicons name="chevron-forward" size={16} color={C.teal700} />
            </Pressable>
          ) : <P key={so.id}>{so.number} · {so.customer}</P>)}
        </Card>
      )}

      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Supplier ${p.supplier.name}`} onPress={() => router.push(`/staff/suppliers/${p.supplier.id}`)} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy }}>{p.supplier.name}</Text>
          </Pressable>
          <PoBadge status={p.status} />
        </Row>
        <Line k="PO date" v={formatDate(p.date)} />
        {!!p.expectedDate && <Line k="Expected by" v={formatDate(p.expectedDate)} />}
        <Line k="Received" v={`${received} of ${ordered} units`} strong />
        <View style={{ height: 8, borderRadius: 4, backgroundColor: C.line, overflow: 'hidden' }}>
          <View style={{ width: `${ordered ? Math.round((received / ordered) * 100) : 0}%`, height: 8, backgroundColor: received >= ordered ? C.ok : C.teal700 }} />
        </View>
        {p.grandTotal != null && <Line k="Total" v={rupees(p.grandTotal)} strong />}
      </Card>

      {buyer && p.status !== 'CANCELLED' && (
        <>
          <Button variant="secondary" title="Share PDF (WhatsApp, email, print)" loading={pdf.busy} icon={<Ionicons name="document-text-outline" size={20} color={C.ink} />} onPress={() => void sharePdf()} />
          {!!pdf.error && <Alert>{pdf.error}</Alert>}
        </>
      )}

      <H2>Items ({p.lines.length})</H2>
      {p.lines.map((l) => (
        <Card key={l.id}>
          <P style={{ fontWeight: '700' }}>{l.name}</P>
          <Note>{l.label ?? l.sku} · HSN {l.hsnCode} · GST {l.gstRate}%</Note>
          <Row style={{ gap: 6 }}>
            <Qty label="Ordered" n={l.qtyOrdered} />
            <Qty label="Received" n={l.qtyReceived} tone={l.qtyReceived >= l.qtyOrdered ? 'ok' : undefined} />
            <Qty label="Still due" n={l.pending} tone={l.pending > 0 && open ? 'warn' : undefined} />
          </Row>
          {p.canSeeRates && <Note>{rupees(l.rate)} each{l.discPct ? ` less ${l.discPct}%` : ''} · {rupees(l.amount)}</Note>}
          {l.salesOrder && <Note>For order {l.salesOrder.number} · {l.salesOrder.customer}</Note>}
        </Card>
      ))}

      {p.canSeeRates && (
        <Card>
          <Line k="Before tax" v={rupees(p.taxableTotal)} />
          {p.taxType === 'INTER_STATE' ? <Line k="IGST" v={rupees(p.igstTotal)} /> : <><Line k="CGST" v={rupees(p.cgstTotal)} /><Line k="SGST" v={rupees(p.sgstTotal)} /></>}
          {p.roundOff ? <Line k="Round off" v={rupees(p.roundOff)} /> : null}
          <Line k="Total" v={rupees(p.grandTotal)} strong />
        </Card>
      )}

      <H2>Goods received</H2>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {!p.grns.length && <Note style={{ paddingVertical: 10 }}>Nothing received yet.</Note>}
        {p.grns.map((g, i) => (
          <Pressable key={g.id} accessibilityRole="button" accessibilityLabel={`Receipt ${g.number}`} onPress={() => router.push(`/staff/stock-reports/receipt/${g.id}`)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
            <View style={{ flex: 1 }}><P style={{ fontWeight: '700' }}>{g.number}</P><Note>{g.date ? formatDate(g.date) : ''}{g.supplierInvoiceNo ? ` · their invoice ${g.supplierInvoiceNo}` : ''}</Note></View>
            <P style={{ fontWeight: '700' }}>{g.units} units</P>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </Pressable>
        ))}
      </Card>

      <Card>
        <H2>Details</H2>
        <Line k="GST" v={p.taxType === 'INTER_STATE' ? 'IGST (other state)' : 'CGST + SGST (same state)'} />
        <Line k="Payment terms" v={`${p.supplier.paymentTermsDays} days`} />
        {!!p.note && <Line k="Reference" v={p.note} />}
        {!!p.terms && <><Note>Terms</Note><P>{p.terms}</P></>}
        <Note>Made by {p.createdBy} on {formatDateTime(p.createdAt)}{p.sentAt ? ` · sent ${formatDateTime(p.sentAt)}` : ''}</Note>
      </Card>
      <MoreActions actions={more} />
    </Screen>
  );
}

function Qty({ label, n, tone }: { label: string; n: number; tone?: 'ok' | 'warn' }) {
  return (
    <View style={{ flex: 1, padding: 8, borderRadius: R.md, backgroundColor: tone === 'ok' ? C.ok50 : tone === 'warn' ? C.warn50 : C.canvas, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : C.ink }}>{n}</Text>
      <Text style={{ fontSize: 14, color: C.muted }}>{label}</Text>
    </View>
  );
}
