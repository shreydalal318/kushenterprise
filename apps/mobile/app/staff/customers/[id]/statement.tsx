import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { AGEING_BUCKETS, daysUntil, drCr, financialYear, istDateString, tallyDate, tallyLedgerLine } from '@kush/core';
import { DateInput, Grid, Heading, isDay, Line, NotAllowed, Note, Pills, Section, SmallButton, Stat, Tag, Waiting, type Tone } from '@/components/admin/bits';
import { Alert, Button, Card, H2, LinkButton, Screen } from '@/components/ui';
import { useCan } from '@/lib/auth';
import { documentUrls, openPdf, previewHref } from '@/lib/documents';
import { errorText, rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

const PAY: Record<string, [string, Tone]> = { PAID: ['Paid', 'ok'], PARTLY_PAID: ['Part paid', 'warn'], UNPAID: ['Unpaid', 'neutral'], OVERDUE: ['Overdue', 'danger'] };
const LATEST = 60;
const sep = { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line } as const;

/** What a customer owes: total, how old it is, unpaid invoices and the Tally-style ledger, with the ledger PDF to view and share. */
export default function Statement() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const allowed = can('MANAGE_CUSTOMERS') || can('RECORD_PAYMENTS');
  const today = istDateString();
  const [period, setPeriod] = useState<'all' | 'fy' | 'custom'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [all, setAll] = useState(false);
  const range = period === 'fy' ? { from: `${financialYear(today).slice(0, 4)}-04-01`, to: today }
    : period === 'custom' ? { from: isDay(from.trim()) ? from.trim() : undefined, to: isDay(to.trim()) ? to.trim() : undefined } : {};
  const q = trpc.ledger.customer.useQuery({ customerId: id!, ...range }, { enabled: allowed, placeholderData: (p) => p });
  const [pdf, setPdf] = useState<{ busy: string | null; error: string | null }>({ busy: null, error: null });

  async function share(key: string, path: string, filename: string) {
    setPdf({ busy: key, error: null });
    try { await openPdf(path, filename); setPdf({ busy: null, error: null }); }
    catch (e) { const t = errorText(e); setPdf({ busy: null, error: /pdf/i.test(t) ? t : `Could not open the PDF. ${t}` }); }
  }

  const title = <Stack.Screen options={{ title: 'Ledger Account' }} />;
  if (!allowed) return <Screen>{title}<NotAllowed what="see customer statements" /></Screen>;
  if (!q.data) return <Screen>{title}<Waiting q={q} /></Screen>;
  const d = q.data;
  const query = [range.from && `from=${range.from}`, range.to && `to=${range.to}`].filter(Boolean).join('&');
  const rows = all ? d.rows : d.rows.slice(-LATEST);
  const advance = d.outstanding < 0;

  return (
    <Screen footer={
      <>
        {!!pdf.error && <Alert>{pdf.error}</Alert>}
        <Button title="View ledger" onPress={() => router.push(previewHref('statement', d.customer.id, d.customer.name, query || undefined))} />
        <Button variant="secondary" title="Share ledger PDF" loading={pdf.busy === 'statement'} disabled={!!pdf.busy && pdf.busy !== 'statement'}
          onPress={() => void share('statement', documentUrls('statement', d.customer.id, query || undefined).pdf, `Ledger-${d.customer.code}.pdf`)} />
      </>
    }>
      {title}
      <View style={{ gap: 4 }}>
        <Heading>{d.customer.name}</Heading>
        <Note>{`${d.customer.code} · pays in ${d.customer.paymentTermsDays} days${d.customer.creditLimit ? ` · credit limit ${rupees(d.customer.creditLimit)}` : ''}`}</Note>
      </View>

      <Card>
        <Note>{advance ? 'We hold an advance of' : 'They owe us'}</Note>
        <Text style={{ fontSize: 30, fontWeight: '700', color: advance || d.outstanding === 0 ? C.ok : C.navy }}>{rupees(Math.abs(d.outstanding))}</Text>
        {d.overdue > 0 && <Text style={{ fontSize: 16, fontWeight: '700', color: C.danger }}>{`${rupees(d.overdue)} is overdue`}</Text>}
        {d.onAccount > 0 && <Note>{`${rupees(d.onAccount)} received but not yet matched to an invoice`}</Note>}
        {d.outstanding === 0 && <Note>Nothing to collect.</Note>}
      </Card>

      <Section>How old the unpaid money is</Section>
      <Grid>{AGEING_BUCKETS.map((b) => <Stat key={b} label={`${b} days`} value={rupees(d.ageing[b])} />)}</Grid>

      {d.openInvoices.length > 0 && (
        <Card>
          {/* Tally's bill-wise pending bills. */}
          <H2>{`Pending bills (${d.openInvoices.length})`}</H2>
          {d.openInvoices.map((i) => (
            <View key={i.id} style={sep}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.navy }}>{i.number}</Text>
                <Tag label={(PAY[i.status] ?? [i.status, 'neutral'])[0]} tone={(PAY[i.status] ?? [i.status, 'neutral'])[1]} />
              </View>
              <Line k="Date" v={tallyDate(i.date)} />
              <Line k="Due on" v={`${tallyDate(i.dueDate)}${-daysUntil(i.dueDate, d.today) > 0 ? ` · overdue by ${-daysUntil(i.dueDate, d.today)} days` : ''}`} tone={i.status === 'OVERDUE' ? C.danger : undefined} />
              <Line k="Opening amount" v={`${rupees(i.total)} Dr`} />
              <Line k="Pending amount" v={`${rupees(i.due)} Dr`} strong />
              <SmallButton icon="eye-outline" title="View" label={`View invoice ${i.number}`} onPress={() => router.push(previewHref('invoice', i.id, i.number))} />
            </View>
          ))}
        </Card>
      )}

      <Card>
        {/* Tally's ledger: To (debit) / By (credit), voucher type and number, balance Dr / Cr. */}
        <H2>Ledger</H2>
        <Pills value={period} onChange={(p) => { setPeriod(p); setAll(false); }} options={[['all', 'All time'], ['fy', 'This financial year'], ['custom', 'Choose dates']]} />
        {period === 'custom' && (
          <>
            <DateInput label="From (optional)" value={from} onChange={setFrom} />
            <DateInput label="To (optional)" value={to} onChange={setTo} />
          </>
        )}
        {q.isFetching && <Note>Updating…</Note>}
        <Line k={`Opening Balance${range.from ? ` (${tallyDate(range.from)})` : ''}`} v={drCr(d.opening)} strong />
        {d.rows.length > rows.length && (
          <>
            <Note>{`Showing the latest ${LATEST} of ${d.rows.length} entries.`}</Note>
            <LinkButton title="Show all entries" onPress={() => setAll(true)} />
          </>
        )}
        {!d.rows.length && <Note>No entries in this period.</Note>}
        {rows.map((e) => {
          const kind = e.type === 'INVOICE' || e.type === 'CANCELLED_INVOICE' ? 'invoice' as const : e.type === 'CREDIT_NOTE' ? 'credit-note' as const : null;
          const t = tallyLedgerLine(e.type, e.mode);
          return (
            <View key={`${e.type}-${e.id}`} style={[sep, e.type === 'CANCELLED_INVOICE' ? { opacity: 0.6 } : null]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: C.ink }}>{t.particulars}</Text>
                <Note>{tallyDate(e.date)}</Note>
              </View>
              <Note>{`${t.vchType} · ${e.number}`}</Note>
              {e.type !== 'INVOICE' && !!e.narration && <Note style={{ fontStyle: 'italic' }}>{e.narration}</Note>}
              {e.debit > 0 && <Line k="Debit" v={rupees(e.debit)} />}
              {e.credit > 0 && <Line k="Credit" v={rupees(e.credit)} />}
              <Line k="Balance" v={drCr(e.balance)} strong />
              {!!kind && <SmallButton icon="eye-outline" title="View" label={`View ${e.number}`} onPress={() => router.push(previewHref(kind, e.id, e.number))} />}
            </View>
          );
        })}
        <View style={sep}><Line k="Closing Balance" v={drCr(d.closing)} strong /></View>
      </Card>
      {can('RECORD_PAYMENTS') && <Button variant="secondary" title="Record money received" onPress={() => router.push(`/staff/payments/new?customerId=${id}`)} />}
    </Screen>
  );
}
