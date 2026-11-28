import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { formatDate, istDateString, PAYMENT_MODE_LABEL, PAYMENT_MODES, type PaymentMode } from '@kush/core';
import { amountOf, ChosenCustomer, CustomerPicker, Failed, Hint, isDay, Muted, Pick, round2, Tick } from '@/components/sales/common';
import { PayBadge } from '@/components/status';
import { Alert, Button, Card, Field, H2, LinkButton, Loading, P, Row, s, Screen, Tabs } from '@/components/ui';
import { useCan } from '@/lib/auth';
import { errorText, rupees } from '@/lib/format';
import { C, R } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

interface Done { number: string; customer: string; amount: number; allocated: number; onAccount: number }

/**
 * Record money received, like the website's Record payment: customer, date, amount, how it was paid and
 * the UTR / cheque number; applied to the oldest invoices first, or to the invoices you tick.
 * Opened from an invoice (?customerId=…&invoiceId=…) it starts with that invoice ticked for what is due.
 */
export default function RecordPayment() {
  const { customerId: startCustomer, invoiceId } = useLocalSearchParams<{ customerId?: string; invoiceId?: string }>();
  const can = useCan();
  const utils = trpc.useUtils();
  const customers = trpc.sales.customers.useQuery();
  const [customerId, setCustomerId] = useState<string | null>(startCustomer ?? null);
  const ledger = trpc.ledger.customer.useQuery({ customerId: customerId ?? '' }, { enabled: !!customerId });
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(istDateString());
  const [mode, setMode] = useState<PaymentMode>('NEFT_RTGS');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [how, setHow] = useState<'auto' | 'pick'>(invoiceId ? 'pick' : 'auto');
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Done | null>(null);
  const record = trpc.payments.record.useMutation();
  const saving = useRef(false);
  const prefilled = useRef(false);

  // From an invoice's "Record payment": tick that invoice for what is still due on it.
  useEffect(() => {
    if (prefilled.current || !invoiceId || !ledger.data || customerId !== startCustomer) return;
    prefilled.current = true;
    const inv = ledger.data.openInvoices.find((i) => i.id === invoiceId);
    if (inv) { setAlloc({ [inv.id]: String(inv.due) }); setAmount((a) => a || String(inv.due)); }
  }, [ledger.data, invoiceId, customerId, startCustomer]);

  const customer = customers.data?.find((c) => c.id === customerId);
  const amt = amountOf(amount);
  const open = ledger.data?.openInvoices ?? [];
  const ticked = Object.entries(alloc).filter(([invId]) => open.some((i) => i.id === invId));
  const allocated = round2(ticked.reduce((t, [, a]) => t + (amountOf(a) || 0), 0));
  const badLine = ticked.some(([invId, a]) => { const v = amountOf(a); const due = open.find((i) => i.id === invId)?.due ?? 0; return Number.isNaN(v) || v > due + 0.001; });
  // What "oldest first" will do with this amount (the server applies it the same way: earliest due date first).
  const preview: { number: string; take: number; full: boolean }[] = [];
  if (how === 'auto' && amt > 0) {
    let left = amt;
    for (const i of [...open].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.date.localeCompare(b.date))) {
      if (left <= 0) break;
      const take = round2(Math.min(i.due, left));
      preview.push({ number: i.number, take, full: take >= i.due });
      left = round2(left - take);
    }
  }
  const missing = [
    !customer && 'choose the customer',
    !(amt > 0) && 'write the amount received',
    !isDay(date.trim()) && 'write the date as YYYY-MM-DD',
    how === 'pick' && badLine && 'fix an amount applied to an invoice',
    how === 'pick' && amt > 0 && allocated > amt + 0.001 && 'apply no more than the amount received',
  ].filter(Boolean);

  function toggle(invId: string, due: number) {
    if (alloc[invId] !== undefined) { const { [invId]: _gone, ...rest } = alloc; setAlloc(rest); return; }
    const room = amt > 0 ? round2(amt - allocated) : due;
    setAlloc({ ...alloc, [invId]: String(round2(Math.max(0, Math.min(due, room > 0 ? room : due)))) });
  }

  function save() {
    if (missing.length || !customer || saving.current) return;
    saving.current = true;
    record.mutate({
      customerId: customer.id, date: date.trim(), amount: amt, mode, reference: reference.trim() || null, note: note.trim() || null, autoAllocate: how === 'auto',
      allocations: how === 'auto' ? [] : ticked.map(([invId, a]) => ({ invoiceId: invId, amount: amountOf(a) })).filter((a) => a.amount > 0),
    }, {
      onSuccess: (r) => { void utils.invalidate(); setDone({ number: r.number, customer: customer.name, amount: amt, allocated: r.allocated, onAccount: r.onAccount }); },
      onSettled: () => { saving.current = false; },
    });
  }

  function another() {
    setDone(null); record.reset(); setAmount(''); setReference(''); setNote(''); setAlloc({}); setHow('auto'); setDate(istDateString());
    setCustomerId(null); prefilled.current = true;
  }

  const title = <Stack.Screen options={{ title: 'Record payment' }} />;
  if (!can('RECORD_PAYMENTS')) return <Screen>{title}<Alert tone="warn">You can’t record payments. Ask the owner to give you that permission.</Alert></Screen>;
  if (done) return (
    <Screen footer={
      <>
        <Button title="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace('/staff/payments'))} />
        <LinkButton title="Record another payment" onPress={another} />
      </>
    }>
      {title}
      <Alert tone="ok">{`Receipt ${done.number} saved ✓ ${rupees(done.amount)} from ${done.customer}.`}</Alert>
      <P>{done.allocated > 0 ? `${rupees(done.allocated)} applied to invoices.` : 'Not applied to any invoice.'}{done.onAccount > 0 ? ` ${rupees(done.onAccount)} kept on the customer’s account.` : ''}</P>
    </Screen>
  );
  if (!customers.data) return customers.error ? <Screen>{title}<Failed error={customers.error} busy={customers.isFetching} onRetry={() => void customers.refetch()} /></Screen> : <>{title}<Loading /></>;

  return (
    <Screen footer={
      <>
        {record.error && <Alert>{errorText(record.error)}</Alert>}
        {missing.length > 0 && <Hint tone="muted">{`To save: ${missing.join(', ')}.`}</Hint>}
        <Button title={`Save receipt${amt > 0 ? ` · ${rupees(amt)}` : ''}`} loading={record.isPending} disabled={missing.length > 0} onPress={save} />
      </>
    }>
      {title}
      {!customer ? <CustomerPicker customers={customers.data} onPick={(cid) => { setCustomerId(cid); setAlloc({}); }} /> : (
        <ChosenCustomer customer={customer} onChange={() => { setCustomerId(null); setAlloc({}); }}>
          {ledger.error ? <><Alert>{errorText(ledger.error)}</Alert><Button variant="secondary" title="Try again" onPress={() => void ledger.refetch()} /></>
            : !ledger.data ? <Loading />
              : (
                <P>
                  {ledger.data.outstanding < 0 ? `Paid in advance ${rupees(-ledger.data.outstanding)}` : `Owes ${rupees(ledger.data.outstanding)}`}
                  {ledger.data.overdue > 0 ? <Text style={{ color: C.danger, fontWeight: '700' }}>{` · overdue ${rupees(ledger.data.overdue)}`}</Text> : null}
                  {ledger.data.onAccount > 0 ? ` · ${rupees(ledger.data.onAccount)} on account` : ''}
                </P>
              )}
        </ChosenCustomer>
      )}

      <Card>
        <H2>Money received</H2>
        <View style={{ gap: 4 }}>
          <Text style={s.label}>Amount (₹)</Text>
          <TextInput accessibilityLabel="Amount received in rupees" value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, '').slice(0, 13))} keyboardType="decimal-pad" placeholder="0"
            placeholderTextColor="#9aa5b1" style={[s.input, { fontSize: 22, fontWeight: '700' }, amount.trim() !== '' && Number.isNaN(amt) && { borderColor: C.danger }]} />
          {amount.trim() !== '' && Number.isNaN(amt) && <Text style={{ color: C.danger, fontSize: 15 }}>Write the amount like 1500 or 1500.50</Text>}
        </View>
        <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" maxLength={10} error={date.trim() && !isDay(date.trim()) ? 'Use a real date as YYYY-MM-DD' : null} />
        <Text style={s.label}>How was it paid?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PAYMENT_MODES.map((m) => <Pick key={m} label={PAYMENT_MODE_LABEL[m]} selected={mode === m} onPress={() => setMode(m)} />)}
        </View>
        <Field label={mode === 'CHEQUE' ? 'Cheque no. (optional)' : 'UTR / reference no. (optional)'} value={reference} onChangeText={setReference} maxLength={80} autoCapitalize="characters" />
        <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={300} />
      </Card>

      {customer && (
        <Card>
          <H2>Which invoices does it pay?</H2>
          <Tabs big value={how} onChange={setHow} options={[['auto', 'Oldest first'], ['pick', 'I’ll choose']]} />
          {!ledger.data ? null : !open.length ? <Muted>No unpaid invoices. The money stays on the customer’s account.</Muted> : how === 'auto' ? (
            <>
              <Muted>The money pays the oldest unpaid invoices first. Anything left stays on the customer’s account.</Muted>
              {preview.map((p) => <Row key={p.number} style={{ justifyContent: 'space-between' }}><P>{p.number}</P><P style={{ fontWeight: '600' }}>{`${rupees(p.take)}${p.full ? ' (paid in full)' : ' (part)'}`}</P></Row>)}
              {amt > 0 && preview.length > 0 && round2(amt - preview.reduce((t, p) => t + p.take, 0)) > 0 && <Muted>{`${rupees(round2(amt - preview.reduce((t, p) => t + p.take, 0)))} stays on account.`}</Muted>}
            </>
          ) : (
            <>
              <Muted>Tick the invoices this money pays. You can change how much goes to each.</Muted>
              {open.map((i) => {
                const on = alloc[i.id] !== undefined;
                const v = amountOf(alloc[i.id] ?? '');
                const bad = on && (Number.isNaN(v) || v > i.due + 0.001);
                return (
                  <View key={i.id} style={{ gap: 6, padding: 10, borderRadius: R.md, borderWidth: 1, borderColor: on ? C.teal700 : C.line, backgroundColor: on ? C.aqua50 : C.white }}>
                    <Tick label={`${i.number} · ${formatDate(i.date)}`} hint={`${rupees(i.due)} to receive${i.status === 'OVERDUE' ? ' · overdue' : ''}`} checked={on} onPress={() => toggle(i.id, i.due)} />
                    {i.status !== 'UNPAID' && <PayBadge status={i.status} />}
                    {on && (
                      <Row style={{ justifyContent: 'space-between' }}>
                        <P>Apply ₹</P>
                        <TextInput accessibilityLabel={`Amount to apply to ${i.number}`} value={alloc[i.id]} onChangeText={(t) => setAlloc({ ...alloc, [i.id]: t.replace(/[^\d.]/g, '').slice(0, 13) })} keyboardType="decimal-pad"
                          style={{ height: 44, minWidth: 120, paddingHorizontal: 10, fontSize: 16, textAlign: 'right', color: C.ink, borderWidth: 1, borderRadius: R.sm, borderColor: bad ? C.danger : C.line, backgroundColor: C.white }} />
                      </Row>
                    )}
                    {bad && <Text style={{ color: C.danger, fontSize: 15 }}>{`At most ${rupees(i.due)}`}</Text>}
                  </View>
                );
              })}
              <P style={{ color: amt > 0 && allocated > amt + 0.001 ? C.danger : C.ink, fontWeight: '600' }}>
                {`Applied ${rupees(allocated)} of ${rupees(amt > 0 ? amt : 0)}${amt > 0 && amt - allocated > 0.001 ? `; ${rupees(round2(amt - allocated))} stays on account` : ''}.`}
              </P>
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}
