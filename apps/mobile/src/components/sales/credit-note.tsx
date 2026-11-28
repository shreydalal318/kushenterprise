import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { istDateString } from '@kush/core';
import { Alert, Button, Card, Field, H2, LinkButton, P, Row, Screen } from '@/components/ui';
import { errorText, rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { Choice, Hint, int, isDay, Muted, Pick, Stepper } from './common';

type Inv = RouterOutputs['invoices']['get'];

/**
 * Goods came back: a credit note against this invoice at the invoice's own rates and GST (the website's
 * "Credit note (return)"). Choose how many of each item came back, and for lenses which serial numbers.
 */
export function CreditNoteForm({ inv, onDone, onBack }: { inv: Inv; onDone: (r: { id: string; number: string; total: number; restock: boolean }) => void; onBack: () => void }) {
  const utils = trpc.useUtils();
  const [date, setDate] = useState(istDateString());
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [serials, setSerials] = useState<Record<string, string[]>>({});
  const create = trpc.creditNotes.create.useMutation();
  const saving = useRef(false);

  const n = (id: string) => int(qty[id] ?? '');
  const leftOf = (l: Inv['lines'][number]) => Math.max(0, l.qty - l.creditedQty);
  const setLineQty = (l: Inv['lines'][number], v: string) => {
    setQty({ ...qty, [l.id]: v });
    // Fewer coming back than serials ticked: keep only as many serials as units.
    const keep = Math.min(int(v), leftOf(l));
    if ((serials[l.id] ?? []).length > keep) setSerials({ ...serials, [l.id]: (serials[l.id] ?? []).slice(0, keep) });
  };
  const toggleSerial = (lineId: string, s: string, max: number) => {
    const cur = serials[lineId] ?? [];
    setSerials({ ...serials, [lineId]: cur.includes(s) ? cur.filter((x) => x !== s) : cur.length < max ? [...cur, s] : cur });
  };
  // Same estimate as the website: quantity × rate, less discount, plus GST.
  const total = inv.lines.reduce((t, l) => t + Math.min(n(l.id), leftOf(l)) * l.rate * (1 - l.discPct / 100) * (1 + l.gstRate / 100), 0);
  const tooMany = inv.lines.some((l) => n(l.id) > leftOf(l));
  const anyQty = inv.lines.some((l) => n(l.id) > 0);
  const serialShort = inv.lines.filter((l) => l.serialNos.length > 0 && n(l.id) > 0 && (serials[l.id] ?? []).length !== n(l.id));
  const missing = [
    !isDay(date.trim()) && 'write the date as YYYY-MM-DD',
    reason.trim().length < 3 && 'write why the goods came back',
    !anyQty && 'choose how many came back',
    tooMany && 'lower a quantity to what is left',
    serialShort.length > 0 && 'tick the serial numbers that came back',
  ].filter(Boolean);

  function save() {
    if (missing.length || saving.current) return;
    saving.current = true;
    create.mutate({ invoiceId: inv.id, date: date.trim(), reason: reason.trim(), restock, lines: inv.lines.map((l) => ({ invoiceLineId: l.id, qty: n(l.id), serialNos: serials[l.id] ?? [] })) }, {
      onSuccess: (r) => { void utils.invalidate(); onDone({ id: r.id, number: r.number, total: r.total, restock }); },
      onSettled: () => { saving.current = false; },
    });
  }

  return (
    <Screen footer={
      <>
        {create.error && <Alert>{errorText(create.error)}</Alert>}
        {missing.length > 0 && <Hint tone="muted">{`To save: ${missing.join(', ')}.`}</Hint>}
        <Button title={`Make credit note${anyQty && !tooMany ? ` · about ${rupees(Math.round(total))}` : ''}`} loading={create.isPending} disabled={missing.length > 0} onPress={save} />
        <LinkButton tone="muted" title="Back" disabled={create.isPending} onPress={onBack} />
      </>
    }>
      <Stack.Screen options={{ title: inv.number }} />
      <H2>Goods came back: credit note</H2>
      <Muted>{`Against invoice ${inv.number} for ${inv.customer.name}. Same rates and GST as the invoice.`}</Muted>
      <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" maxLength={10} error={date.trim() && !isDay(date.trim()) ? 'Use a real date as YYYY-MM-DD' : null} />
      <Field label="Why did it come back?" placeholder="Wrong power, damaged, not used…" value={reason} onChangeText={setReason} maxLength={200} />
      <Card>
        <H2>What happens to the goods?</H2>
        <Choice label="Put them back in stock" selected={restock} onPress={() => setRestock(true)} />
        <Choice label="Don’t put back (damaged)" hint="They are written off." selected={!restock} onPress={() => setRestock(false)} />
      </Card>
      <H2>How many came back?</H2>
      {inv.lines.map((l) => {
        const left = leftOf(l);
        const chosen = serials[l.id] ?? [];
        return (
          <Card key={l.id}>
            <P style={{ fontWeight: '700' }}>{l.description}</P>
            {!!(l.powerLabel || (l.batchNo && l.batchNo !== 'NA')) && <Muted>{[l.powerLabel, l.batchNo && l.batchNo !== 'NA' ? `Batch ${l.batchNo}` : null].filter(Boolean).join(' · ')}</Muted>}
            <Muted>{`Sold ${l.qty}${l.creditedQty ? ` · already returned ${l.creditedQty}` : ''} · ${rupees(l.rate)} each`}</Muted>
            {left === 0 ? <P style={{ color: C.muted }}>All of these are already returned.</P> : (
              <Row style={{ justifyContent: 'space-between' }}>
                <P>Came back</P>
                <Stepper label={l.description} value={qty[l.id] ?? '0'} onChange={(v) => setLineQty(l, v)} min={0} max={left} />
              </Row>
            )}
            {n(l.id) > left && <P style={{ color: C.danger }}>{`Only ${left} left to return.`}</P>}
            {l.serialNos.length > 0 && n(l.id) > 0 && n(l.id) <= left && (
              <View style={{ gap: 6 }}>
                <Muted>{`Tick the ${n(l.id)} serial number${n(l.id) === 1 ? '' : 's'} that came back (${chosen.length} ticked)`}</Muted>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {l.serialNos.map((s) => <Pick key={s} multi label={s} selected={chosen.includes(s)} onPress={() => toggleSerial(l.id, s, n(l.id))} />)}
                </View>
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
