import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, istDateString } from '@kush/core';
import { Amount, Confirm, Failed, Hint, isDay, MoreActions, Muted, Pick, ProformaBadge, ShareLink, usePdf } from '@/components/sales/common';
import { Alert, Button, Card, Field, H2, LinkButton, Loading, P, Row, Screen } from '@/components/ui';
import { useCan } from '@/lib/auth';
import { docPath, previewHref } from '@/lib/documents';
import { errorText, rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { Done } from '@/components/done';

type Pf = RouterOutputs['proformas']['get'];
type Line = Pf['lines'][number];

/** Lenses go out by serial number: tick exactly as many as the proforma has, from what is in stock. */
function SerialPick({ line, value, onChange }: { line: Line; value: string[]; onChange: (v: string[]) => void }) {
  const stock = trpc.inventory.productStock.useQuery({ productId: line.productId });
  const v = stock.data?.variants.find((x) => x.id === line.variantId);
  const available = (v?.batches ?? []).filter((b) => !b.expired).sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999')).flatMap((b) => b.serials);
  return (
    <Card>
      <P style={{ fontWeight: '700' }}>{`${line.description}${line.label ? ` ${line.label}` : ''}`}</P>
      <Muted>{`Tick ${line.qty} serial number${line.qty === 1 ? '' : 's'} (${value.length} ticked). Earliest expiry first.`}</Muted>
      {stock.error ? <><Alert>{errorText(stock.error)}</Alert><Button variant="secondary" title="Try again" onPress={() => void stock.refetch()} /></>
        : !stock.data ? <Loading />
          : !available.length ? <P style={{ color: C.danger }}>None in stock. Receive the goods first.</P>
            : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {available.map((s) => {
                  const on = value.includes(s);
                  return <Pick key={s} multi label={s} selected={on} onPress={() => onChange(on ? value.filter((x) => x !== s) : value.length < line.qty ? [...value, s] : value)} />;
                })}
              </View>
            )}
      {stock.data && available.length > 0 && available.length < line.qty && <P style={{ color: C.danger }}>{`Only ${available.length} in stock.`}</P>}
    </Card>
  );
}

/**
 * One proforma, like the website: what was quoted, the PDF and a share link, Mark as sent,
 * Convert to tax invoice (same customer, quantities and quoted rates) and Cancel.
 */
export default function ProformaScreen() {
  const { id, saved } = useLocalSearchParams<{ id: string; saved?: string }>();
  const can = useCan();
  const utils = trpc.useUtils();
  const q = trpc.proformas.get.useQuery({ id: id! });
  const markSent = trpc.proformas.markSent.useMutation();
  const cancel = trpc.proformas.cancel.useMutation();
  const convert = trpc.proformas.convert.useMutation();
  const [mode, setModeState] = useState<null | 'convert'>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [date, setDate] = useState(istDateString());
  const [serials, setSerials] = useState<Record<string, string[]>>({});
  const [flash, setFlash] = useState<string | null>(saved ? 'Proforma saved ✓ Next: send it to the customer.' : null);
  const pdf = usePdf();
  const setMode = (m: typeof mode) => { convert.reset(); markSent.reset(); cancel.reset(); setConfirmCancel(false); setModeState(m); if (m) setFlash(null); };

  if (!q.data) return q.error
    ? <Screen><Stack.Screen options={{ title: 'Proforma' }} /><Failed error={q.error} busy={q.isFetching} onRetry={() => void q.refetch()} /></Screen>
    : <><Stack.Screen options={{ title: 'Proforma' }} /><Loading /></>;
  const p = q.data;
  const converted = !!p.invoice && p.invoice.status === 'ISSUED';
  const isCancelled = p.status === 'CANCELLED';
  const expired = (p.status === 'DRAFT' || p.status === 'SENT') && !!p.validUntil && p.validUntil < istDateString();
  const status = converted ? 'CONVERTED' : expired ? 'EXPIRED' : p.status;
  const canConvert = !converted && !isCancelled && can('CREATE_TAX_INVOICE');
  const canEdit = can('CREATE_PROFORMA');
  const canMarkSent = p.status === 'DRAFT' && canEdit && !converted;
  const canCancel = !converted && !isCancelled && canEdit;
  const pdfPath = docPath('proforma', p.id);
  const openProformaPdf = () => void pdf.open(pdfPath, `${p.number}.pdf`);
  // See it as it prints (Share PDF is on that screen too).
  const viewProforma = () => router.push(previewHref('proforma', p.id, p.number));
  const inter = p.taxType === 'INTER_STATE';

  if (mode === 'convert') {
    const serialLines = p.lines.filter((l) => l.trackSerial);
    const short = serialLines.filter((l) => (serials[l.variantId] ?? []).length !== l.qty);
    const missing = [!isDay(date.trim()) && 'write the date as YYYY-MM-DD', short.length > 0 && 'tick the serial numbers'].filter(Boolean);
    const save = () => convert.mutate({ id: p.id, date: date.trim(), lines: serialLines.map((l) => ({ variantId: l.variantId, serialNos: serials[l.variantId] ?? [] })) }, {
      onSuccess: (r) => { void utils.invalidate(); router.replace(`/staff/invoices/${r.id}?saved=1`); },
    });
    return (
      <Screen footer={
        <>
          {convert.error && <Alert>{errorText(convert.error)}</Alert>}
          {missing.length > 0 && <Hint tone="muted">{`To save: ${missing.join(', ')}.`}</Hint>}
          <Button title={`Make tax invoice · ${rupees(p.grandTotal)}`} loading={convert.isPending || convert.isSuccess} disabled={missing.length > 0} onPress={save} />
          <LinkButton tone="muted" title="Back" disabled={convert.isPending} onPress={() => setMode(null)} />
        </>
      }>
        <Stack.Screen options={{ title: p.number }} />
        <H2>Make the tax invoice</H2>
        <Muted>{`For ${p.customer.name}. The quantities and quoted rates are copied as they are. Stock is taken from the earliest-expiring batches.`}</Muted>
        <Field label="Invoice date (YYYY-MM-DD)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" maxLength={10} error={date.trim() && !isDay(date.trim()) ? 'Use a real date as YYYY-MM-DD' : null} />
        {serialLines.map((l) => <SerialPick key={l.id} line={l} value={serials[l.variantId] ?? []} onChange={(v) => setSerials({ ...serials, [l.variantId]: v })} />)}
      </Screen>
    );
  }

  const doMarkSent = () => markSent.mutate({ id: p.id }, { onSuccess: () => { void utils.proformas.invalidate(); setFlash(canConvert ? 'Marked as sent ✓ Next: when the customer says yes, make the tax invoice.' : 'Marked as sent ✓'); } });
  const doCancel = () => cancel.mutate({ id: p.id }, { onSuccess: () => { void utils.proformas.invalidate(); setConfirmCancel(false); setFlash('Proforma cancelled ✓ It stays on record.'); } });
  // The next step at the bottom: a new proforma goes to the customer first; a sent one becomes the invoice.
  const sendFirst = p.status === 'DRAFT' && !converted;
  const primary: 'pdf' | 'convert' = !sendFirst && canConvert ? 'convert' : 'pdf';
  const more = [
    ...(canConvert && primary !== 'convert' ? [{ icon: 'receipt-outline' as const, title: 'Make tax invoice', onPress: () => setMode('convert') }] : []),
    ...(canCancel ? [{ icon: 'close-circle-outline' as const, title: 'Cancel proforma', danger: true, onPress: () => { setFlash(null); setConfirmCancel(true); } }] : []),
  ];

  return (
    <Screen footer={confirmCancel ? (
      <>
        {cancel.error && <Alert>{errorText(cancel.error)}</Alert>}
        <Confirm question={`Cancel proforma ${p.number}? This can’t be undone.`} yes="Yes, cancel it" no="No, keep it" busy={cancel.isPending} onYes={doCancel} onNo={() => { cancel.reset(); setConfirmCancel(false); }} />
      </>
    ) : (
      <>
        {markSent.error && <Alert>{errorText(markSent.error)}</Alert>}
        {sendFirst && <Hint>Next: send it to the customer.</Hint>}
        {primary === 'convert' && <Hint>Next: when the customer says yes, make the tax invoice.</Hint>}
        {primary === 'convert'
          ? <Button title="Make tax invoice" icon={<Ionicons name="receipt-outline" size={20} color={C.white} />} onPress={() => setMode('convert')} />
          : <Button title="View proforma" icon={<Ionicons name="eye-outline" size={20} color={C.white} />} onPress={viewProforma} />}
        {canMarkSent && <LinkButton title="I have sent it: mark as sent" icon={<Ionicons name="checkmark-circle-outline" size={18} color={C.teal700} />} disabled={markSent.isPending} onPress={doMarkSent} />}
      </>
    )}>
      <Stack.Screen options={{ title: p.number }} />
      <Done message={flash} onShown={() => setFlash(null)} />
      {converted && <Alert tone="info">{`Tax invoice ${p.invoice!.number} was made from this proforma.`}</Alert>}
      {converted && <LinkButton title={`Open invoice ${p.invoice!.number}`} icon={<Ionicons name="receipt-outline" size={18} color={C.teal700} />} onPress={() => router.push(`/staff/invoices/${p.invoice!.id}`)} />}
      {isCancelled && <Alert>This proforma is cancelled.</Alert>}

      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy }}>{p.customer.name}</Text>
          <Muted>{`${p.number} · ${formatDate(p.date)}`}</Muted>
          <Muted style={expired ? { color: C.warn, fontWeight: '600' } : undefined}>{`Valid until ${formatDate(p.validUntil)}`}</Muted>
        </View>
        <ProformaBadge status={status} />
      </Row>

      <Card>
        <H2>{`Items (${p.lines.length})`}</H2>
        {p.lines.map((l, n) => (
          <View key={l.id} style={{ gap: 2, paddingTop: n ? 8 : 0, borderTopWidth: n ? 1 : 0, borderTopColor: C.line }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <P style={{ flex: 1, fontWeight: '600' }}>{`${l.description}${l.label ? ` ${l.label}` : ''}`}</P>
              <P style={{ fontWeight: '700' }}>{rupees(l.amount)}</P>
            </Row>
            <Muted>{`${l.qty} ${l.unit} × ${rupees(l.rate)}${l.discPct ? ` less ${l.discPct}%` : ''} · GST ${l.gstRate}%`}</Muted>
          </View>
        ))}
      </Card>

      <Card>
        <H2>Amounts</H2>
        <Amount k="Taxable value" v={rupees(p.taxableTotal)} />
        <Amount k={inter ? 'IGST' : 'CGST + SGST'} v={rupees(p.taxTotal)} />
        {p.roundOff !== 0 && <Amount k="Round off" v={rupees(p.roundOff)} />}
        <Amount k="Total" v={rupees(p.grandTotal)} strong />
      </Card>

      {!!p.terms && <Card><H2>Terms</H2><P>{p.terms}</P></Card>}
      {p.order && (can('VIEW_ORDERS')
        ? <LinkButton title={`Open order ${p.order.number}`} icon={<Ionicons name="cube-outline" size={18} color={C.teal700} />} onPress={() => router.push(`/staff/order/${p.order!.id}`)} />
        : <Muted>{`For order ${p.order.number}`}</Muted>)}

      <Card>
        <H2>PDF</H2>
        {primary !== 'pdf' && <Button variant="secondary" title="View proforma" icon={<Ionicons name="eye-outline" size={18} color={C.ink} />} onPress={viewProforma} />}
        <Button variant="secondary" title="Share / print PDF" icon={<Ionicons name="share-outline" size={18} color={C.ink} />} loading={pdf.busy === pdfPath} disabled={!!pdf.busy} onPress={openProformaPdf} />
        {!!pdf.error && <Alert>{pdf.error}</Alert>}
        {!isCancelled && canEdit && <ShareLink kind="proforma" id={p.id} />}
      </Card>

      {!confirmCancel && <MoreActions actions={more} />}
    </Screen>
  );
}
