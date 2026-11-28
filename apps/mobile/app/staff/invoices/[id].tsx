import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, formatDateTime, INVOICE_COPIES, PAYMENT_MODE_LABEL, type InvoiceCopy, type PaymentMode } from '@kush/core';
import { CreditNoteForm } from '@/components/sales/credit-note';
import { Amount, Confirm, Failed, Hint, MoreActions, Muted, PdfPill, Pick, ShareLink, usePdf } from '@/components/sales/common';
import { PayBadge } from '@/components/status';
import { Alert, Button, Card, Field, H2, LinkButton, Loading, P, Row, Screen } from '@/components/ui';
import { useAuth, useCan } from '@/lib/auth';
import { docPath, previewHref } from '@/lib/documents';
import { errorText, rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

const COPY: Record<InvoiceCopy, string> = { ORIGINAL: 'Original', DUPLICATE: 'Duplicate', TRIPLICATE: 'Triplicate' };

/**
 * One tax invoice, like the website's invoice page: what was sold, the amounts, what was received, the PDF
 * (with copies) and a share link; Record payment, Credit note for returns, and (owner only) Cancel with a reason.
 */
export default function InvoiceScreen() {
  const { id, saved } = useLocalSearchParams<{ id: string; saved?: string }>();
  const can = useCan();
  const { me } = useAuth();
  const utils = trpc.useUtils();
  const q = trpc.invoices.get.useQuery({ id: id! });
  const company = trpc.sales.companyReady.useQuery(undefined, { enabled: can('CREATE_TAX_INVOICE') || can('CREATE_PROFORMA') });
  const cancel = trpc.invoices.cancel.useMutation();
  const [mode, setModeState] = useState<null | 'credit' | 'cancel'>(null);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [picked, setPicked] = useState<InvoiceCopy[] | null>(null);
  const [credit, setCredit] = useState<{ id: string; number: string } | null>(null);
  // The green line after each action; an invoice just made from a proforma arrives with ?saved=1.
  const [flash, setFlash] = useState<string | null>(saved ? 'Tax invoice made ✓ Stock is updated.' : null);
  const pdf = usePdf();
  const setMode = (m: typeof mode) => { cancel.reset(); setConfirm(false); setModeState(m); if (m) { setFlash(null); setCredit(null); } };

  if (!q.data) return q.error
    ? <Screen><Stack.Screen options={{ title: 'Tax invoice' }} /><Failed error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} /></Screen>
    : <><Stack.Screen options={{ title: 'Tax invoice' }} /><Loading /></>;
  const i = q.data;
  const cancelled = i.status === 'CANCELLED';
  const owner = me?.role === 'OWNER';
  const inter = i.taxType === 'INTER_STATE';
  const copies = picked ?? ((company.data?.defaultCopies as InvoiceCopy[] | undefined)?.length ? (company.data!.defaultCopies as InvoiceCopy[]) : ['ORIGINAL']);
  const pdfPath = `${docPath('invoice', i.id)}?copies=${copies.join(',')}`;
  const openInvoicePdf = () => void pdf.open(pdfPath, `${i.number}.pdf`);
  // See it as it prints (Share PDF is on that screen too).
  const viewInvoice = () => router.push(previewHref('invoice', i.id, i.number, `copies=${copies.join(',')}`));
  const canPay = !cancelled && i.due > 0 && can('RECORD_PAYMENTS');
  const canShare = !cancelled && (can('CREATE_TAX_INVOICE') || can('RECORD_PAYMENTS'));
  const goPay = () => router.push(`/staff/payments/new?customerId=${i.customer.id}&invoiceId=${i.id}`);

  if (mode === 'credit') {
    return <CreditNoteForm inv={i} onBack={() => setMode(null)} onDone={(r) => { setModeState(null); setCredit({ id: r.id, number: r.number }); setFlash(`Credit note ${r.number} made ✓ ${rupees(r.total)} taken off this invoice.${r.restock ? ' The goods are back in stock.' : ''}`); }} />;
  }

  if (mode === 'cancel') {
    const blocked = i.payments.length > 0 ? 'Payments are applied to this invoice, so it can’t be cancelled.' : i.creditNotes.length > 0 ? 'A credit note was made for this invoice, so it can’t be cancelled.' : null;
    const ok = reason.trim().length >= 5;
    const doCancel = () => cancel.mutate({ id: i.id, reason: reason.trim() }, {
      onSuccess: () => { void utils.invalidate(); setModeState(null); setConfirm(false); setReason(''); setFlash('Invoice cancelled ✓ Its stock is back on the shelf. It stays on record with your reason.'); },
    });
    return (
      <Screen footer={
        <>
          {cancel.error && <Alert>{errorText(cancel.error)}</Alert>}
          {blocked ? <LinkButton tone="muted" title="Back" onPress={() => setMode(null)} /> : confirm ? (
            <Confirm question={`Cancel invoice ${i.number}? This can’t be undone.`} yes="Yes, cancel the invoice" no="No, keep it" busy={cancel.isPending} onYes={doCancel} onNo={() => setConfirm(false)} />
          ) : (
            <>
              {!ok && <Hint tone="muted">To continue: write the reason (at least 5 letters).</Hint>}
              <Button variant="danger" title="Cancel invoice" disabled={!ok} onPress={() => setConfirm(true)} />
              <LinkButton tone="muted" title="Back" onPress={() => setMode(null)} />
            </>
          )}
        </>
      }>
        <Stack.Screen options={{ title: i.number }} />
        <H2>Cancel this invoice</H2>
        <Muted>It is never deleted: it stays on record marked Cancelled, with your reason. Its stock and serial numbers go back on the shelf.</Muted>
        {blocked ? <Alert tone="warn">{blocked}</Alert> : <Field label="Why is it cancelled?" value={reason} onChangeText={(v) => { setReason(v); setConfirm(false); }} maxLength={300} multiline autoFocus />}
      </Screen>
    );
  }

  const more = [
    ...(!cancelled && can('CREATE_TAX_INVOICE') ? [{ icon: 'return-down-back-outline' as const, title: 'Credit note (goods came back)', onPress: () => setMode('credit') }] : []),
    ...(!cancelled && owner ? [{ icon: 'close-circle-outline' as const, title: 'Cancel invoice', danger: true, onPress: () => { setReason(''); setMode('cancel'); } }] : []),
  ];

  return (
    <Screen footer={
      <>
        {canPay ? (
          <>
            <Hint tone={i.paymentStatus === 'OVERDUE' ? 'danger' : 'navy'}>{`${rupees(i.due)} still to receive${i.dueDate ? ` by ${formatDate(i.dueDate)}` : ''}${i.paymentStatus === 'OVERDUE' ? ' (overdue)' : ''}.`}</Hint>
            <Button title="Record payment" icon={<Ionicons name="wallet-outline" size={20} color={C.white} />} onPress={goPay} />
          </>
        ) : <Button title="View invoice" icon={<Ionicons name="eye-outline" size={20} color={C.white} />} onPress={viewInvoice} />}
      </>
    }>
      <Stack.Screen options={{ title: i.number }} />
      {!!flash && <Alert tone="ok">{flash}</Alert>}
      {credit && <Button variant="secondary" title={`Share credit note ${credit.number} PDF`} icon={<Ionicons name="document-text-outline" size={18} color={C.ink} />} loading={pdf.busy === docPath('credit-note', credit.id)} onPress={() => void pdf.open(docPath('credit-note', credit.id), `${credit.number}.pdf`)} />}
      {cancelled && <Alert>{`Cancelled${i.cancelledBy ? ` by ${i.cancelledBy}` : ''}${i.cancelledAt ? ` on ${formatDateTime(i.cancelledAt)}` : ''}: ${i.cancelReason ?? ''}. Stock was returned.`}</Alert>}

      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy }}>{i.customer.name}</Text>
          <Muted>{`${i.number} · ${formatDate(i.date)} · ${inter ? 'IGST' : 'CGST + SGST'}`}</Muted>
        </View>
        <PayBadge status={i.paymentStatus} />
      </Row>

      <Card>
        <H2>Amounts</H2>
        <Amount k="Taxable value" v={rupees(i.taxableTotal)} />
        {inter ? <Amount k="IGST" v={rupees(i.igstTotal)} /> : <><Amount k="CGST" v={rupees(i.cgstTotal)} /><Amount k="SGST" v={rupees(i.sgstTotal)} /></>}
        {i.roundOff !== 0 && <Amount k="Round off" v={rupees(i.roundOff)} />}
        <Amount k="Total" v={rupees(i.grandTotal)} strong />
        <Amount k="Received" v={rupees(i.amountPaid)} tone="ok" />
        {i.credited > 0 && <Amount k="Credit notes" v={rupees(i.credited)} tone="ok" />}
        {!cancelled && <Amount k={`Still to receive${i.dueDate ? ` (by ${formatDate(i.dueDate)})` : ''}`} v={rupees(Math.max(0, i.due))} strong tone={i.due > 0 ? 'danger' : 'ok'} />}
      </Card>

      <Card>
        <H2>PDF</H2>
        <Muted>Copies to print</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {INVOICE_COPIES.map((c) => (
            <Pick key={c} multi label={COPY[c]} selected={copies.includes(c)}
              onPress={() => { const next = copies.includes(c) ? copies.filter((x) => x !== c) : INVOICE_COPIES.filter((x) => x === c || copies.includes(x)); if (next.length) setPicked(next); }} />
          ))}
        </View>
        {canPay && <Button variant="secondary" title="View invoice" icon={<Ionicons name="eye-outline" size={18} color={C.ink} />} onPress={viewInvoice} />}
        <Button variant="secondary" title="Share / print PDF" icon={<Ionicons name="share-outline" size={18} color={C.ink} />} loading={pdf.busy === pdfPath} disabled={!!pdf.busy} onPress={openInvoicePdf} />
        {!!pdf.error && <Alert>{pdf.error}</Alert>}
        {canShare && <ShareLink kind="invoice" id={i.id} />}
      </Card>

      <Card>
        <H2>{`Items (${i.lines.length})`}</H2>
        {i.lines.map((l, n) => (
          <View key={l.id} style={{ gap: 2, paddingTop: n ? 8 : 0, borderTopWidth: n ? 1 : 0, borderTopColor: C.line }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <P style={{ flex: 1, fontWeight: '600' }}>{l.description}</P>
              <P style={{ fontWeight: '700' }}>{rupees(l.amount)}</P>
            </Row>
            {!!(l.powerLabel || (l.batchNo && l.batchNo !== 'NA') || l.expiryDate) && <Muted>{[l.powerLabel, l.batchNo && l.batchNo !== 'NA' ? `Batch ${l.batchNo}` : null, l.expiryDate ? `Expiry ${formatDate(l.expiryDate)}` : null].filter(Boolean).join(' · ')}</Muted>}
            <Muted>{`${l.qty} ${l.unit} × ${rupees(l.rate)}${l.discPct ? ` less ${l.discPct}%` : ''} · GST ${l.gstRate}%`}</Muted>
            {l.serialNos.length > 0 && <Muted>{`Serial no. ${l.serialNos.join(', ')}`}</Muted>}
            {l.creditedQty > 0 && <Text style={{ fontSize: 15, color: C.warn, fontWeight: '600' }}>{`${l.creditedQty} came back (credit note)`}</Text>}
          </View>
        ))}
      </Card>

      {(i.payments.length > 0 || i.creditNotes.length > 0) && (
        <Card>
          <H2>Money received and credit notes</H2>
          {i.payments.map((p) => (
            <Row key={p.id} style={{ justifyContent: 'space-between', minHeight: 44 }}>
              <View style={{ flex: 1 }}><P>{`Receipt ${p.number}`}</P><Muted>{`${formatDate(p.date)} · ${PAYMENT_MODE_LABEL[p.mode as PaymentMode] ?? p.mode}`}</Muted></View>
              <P style={{ fontWeight: '700', color: C.ok }}>{rupees(p.amount)}</P>
            </Row>
          ))}
          {i.creditNotes.map((c) => (
            <Row key={c.id} style={{ justifyContent: 'space-between', minHeight: 44 }}>
              <View style={{ flex: 1 }}><P>{`Credit note ${c.number}`}</P><Muted>{`${formatDate(c.date)} · ${c.reason} · ${rupees(c.grandTotal)}`}</Muted></View>
              <PdfPill label={`View credit note ${c.number}`} busy={false} disabled={false} onPress={() => router.push(previewHref('credit-note', c.id, c.number))} />
            </Row>
          ))}
        </Card>
      )}

      <Card>
        <H2>Details</H2>
        <P><Text style={{ color: C.muted }}>Ship to: </Text>{`${i.consignee.name}${i.consignee.attn ? ` (${i.consignee.attn})` : ''}, ${i.consignee.addressLines.join(', ')}`}</P>
        <P><Text style={{ color: C.muted }}>Bill to: </Text>{`${i.buyer.name}${i.buyer.gstin ? ` · GSTIN ${i.buyer.gstin}` : ''}`}</P>
        {!!i.paymentTerms && <P><Text style={{ color: C.muted }}>Payment terms: </Text>{i.paymentTerms}</P>}
        {i.dispatch && <P><Text style={{ color: C.muted }}>Dispatched: </Text>{[formatDate(i.dispatch.dispatchDate), i.dispatch.courier, i.dispatch.docketNo, i.dispatch.deliveryPersonName].filter(Boolean).join(' · ')}</P>}
        {i.order && (can('VIEW_ORDERS')
          ? <LinkButton title={`Open order ${i.order.number}`} icon={<Ionicons name="cube-outline" size={18} color={C.teal700} />} onPress={() => router.push(`/staff/order/${i.order!.id}`)} />
          : <P><Text style={{ color: C.muted }}>Order: </Text>{i.order.number}</P>)}
        {i.proforma && (can('CREATE_PROFORMA') || can('VIEW_ORDERS')
          ? <LinkButton title={`Made from proforma ${i.proforma.number}`} icon={<Ionicons name="document-text-outline" size={18} color={C.teal700} />} onPress={() => router.push(`/staff/proformas/${i.proforma!.id}`)} />
          : <P><Text style={{ color: C.muted }}>From proforma: </Text>{i.proforma.number}</P>)}
        <Muted>{`Made by ${i.createdBy} on ${formatDateTime(i.createdAt)}`}</Muted>
      </Card>

      {can('CREATE_TAX_INVOICE') && (
        <Card>
          <H2>E-invoice and e-way bill</H2>
          {!!i.irn && <Muted>{`IRN ${i.irn}${i.ackNo ? ` · Ack ${i.ackNo}` : ''}${i.ackDate ? ` · ${formatDate(i.ackDate)}` : ''}`}</Muted>}
          {!!i.ewayBillNo && <Muted>{`E-way bill ${i.ewayBillNo}${i.ewayBillDate ? ` · ${formatDate(i.ewayBillDate)}` : ''}`}</Muted>}
          <P>Use the website for e-invoice / e-way bill.</P>
        </Card>
      )}

      <MoreActions actions={more} />
    </Screen>
  );
}
