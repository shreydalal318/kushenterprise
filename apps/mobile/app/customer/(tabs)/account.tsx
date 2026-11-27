import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AGEING_BUCKETS, formatDate } from '@kush/core';
import { Button, Card, H2, Loading, Row, Screen } from '@/components/ui';
import { PayBadge } from '@/components/status';
import { usePdf } from '@/customer/actions';
import { useToast } from '@/customer/toast';
import { EmptyState, ErrorBox, Input, Line, Note, Notice, Segments } from '@/customer/ui';
import { useAuth } from '@/lib/auth';
import { docPath } from '@/lib/documents';
import { errorText, rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

export default function AccountScreen() {
  const { me, signOut } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'balance' | 'invoices' | 'profile'>('balance');
  const ledger = trpc.portal.ledger.useQuery();
  const docs = trpc.portal.documents.useQuery(undefined, { enabled: tab === 'invoices' });
  const profile = trpc.portal.profile.useQuery(undefined, { enabled: tab === 'profile' });
  const pdf = usePdf();
  const [msg, setMsg] = useState('');
  const req = trpc.portal.requestChange.useMutation();
  const send = () => req.mutate({ message: msg }, { onSuccess: () => { setMsg(''); toast('Request sent', "We'll update your details and let you know."); } });
  const [leaving, setLeaving] = useState(false);
  const failed = (q: { error: unknown; isFetching: boolean; refetch: () => unknown }) => <ErrorBox text={errorText(q.error)} onRetry={() => void q.refetch()} busy={q.isFetching} />;
  const statement = me?.customerId ? `/api/statement/${me.customerId}` : null;
  const owed = ledger.data?.outstanding ?? 0;
  return (
    <Screen>
      <Segments value={tab} onChange={setTab} options={[['balance', 'Balance'], ['invoices', 'Invoices'], ['profile', 'My details']]} />
      {pdf.failed && <ErrorBox text={pdf.failed.text} onRetry={pdf.failed.retry} />}

      {tab === 'balance' && (ledger.data ? (
        <>
          <Card>
            <Note>{owed < 0 ? 'Paid in advance' : 'Amount you owe'}</Note>
            <Text style={{ fontSize: 28, fontWeight: '800', color: owed > 0 ? C.navy : C.ok }}>{rupees(Math.abs(owed))}</Text>
            {owed === 0 && <Note style={{ color: C.ok }}>Nothing to pay. Thank you!</Note>}
            {ledger.data.overdue > 0 && <Text style={{ fontSize: 15, color: C.danger, fontWeight: '600' }}>{rupees(ledger.data.overdue)} is past its due date. Please pay it soon.</Text>}
            <Note>You have {ledger.data.customer.paymentTermsDays} days to pay each invoice.</Note>
          </Card>
          {statement && <Button title="Download statement (PDF)" icon={<Ionicons name="download-outline" size={20} color={C.white} />} loading={pdf.busy === statement} onPress={() => pdf.open(statement, 'Statement.pdf', 'Statement downloaded')} />}
          {owed > 0 && (
            <Card>
              <H2>How old the unpaid amount is</H2>
              {AGEING_BUCKETS.map((b) => <Line key={b} k={`${b} days old`} v={rupees(ledger.data!.ageing[b])} />)}
            </Card>
          )}
          <H2>Invoices still to pay</H2>
          {ledger.data.openInvoices.length === 0 && <Note>None. You're all paid up.</Note>}
          {ledger.data.openInvoices.map((i) => (
            <Card key={i.id}>
              <Row style={{ justifyContent: 'space-between' }}><Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>{i.number}</Text><PayBadge status={i.status} /></Row>
              <Note>{rupees(i.due)} left to pay (of {rupees(i.total)}) · pay by {formatDate(i.dueDate)}</Note>
            </Card>
          ))}
        </>
      ) : ledger.error ? failed(ledger) : <Loading />)}

      {tab === 'invoices' && (docs.data ? (
        !docs.data.invoices.length && !docs.data.proformas.length ? (
          <EmptyState icon={<Ionicons name="document-text-outline" size={48} color={C.teal700} />} text="No invoices yet. Your invoice shows here once your order is packed." />
        ) : (
          <>
            <Note>Tap Download to open, save, print or send an invoice.</Note>
            {docs.data.invoices.map((i) => (
              <Card key={i.id}>
                <Row style={{ justifyContent: 'space-between' }}><Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>{i.number}</Text><PayBadge status={i.status} /></Row>
                <Note>{[i.date && formatDate(i.date), rupees(i.total), i.due > 0 && `${rupees(i.due)} left to pay`].filter(Boolean).join(' · ')}</Note>
                <Button variant="secondary" title="Download invoice" icon={<Ionicons name="download-outline" size={20} color={C.ink} />} loading={pdf.busy === docPath('invoice', i.id)}
                  onPress={() => pdf.open(docPath('invoice', i.id), `${i.number}.pdf`, `Invoice ${i.number} downloaded`)} />
              </Card>
            ))}
            {docs.data.proformas.map((p) => (
              <Card key={p.id}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>Proforma bill {p.number}</Text>
                <Note>{rupees(p.total)} · {p.status.toLowerCase()}</Note>
                <Button variant="secondary" title="Download proforma" icon={<Ionicons name="download-outline" size={20} color={C.ink} />} loading={pdf.busy === docPath('proforma', p.id)}
                  onPress={() => pdf.open(docPath('proforma', p.id), `${p.number}.pdf`, `Proforma ${p.number} downloaded`)} />
              </Card>
            ))}
          </>
        )
      ) : docs.error ? failed(docs) : <Loading />)}

      {tab === 'profile' && (profile.data ? (
        <>
          <Card>
            <H2>{profile.data.name}</H2>
            <Line k="Account number" v={profile.data.code} />
            {!!profile.data.gstin && <Line k="GSTIN" v={profile.data.gstin} />}
            <Line k="Signed in as" v={profile.data.login.name} />
            {profile.data.contact && <Line k="Your contact at Kush" v={`${profile.data.contact.name}${profile.data.contact.mobile ? ` · ${profile.data.contact.mobile}` : ''}`} />}
          </Card>
          <Card>{profile.data.addresses.map((a) => <View key={a.id}><Note style={{ fontSize: 14 }}>{a.kind === 'BILLING' ? 'Billing address' : 'Delivery address'}{a.isDefault ? ' (usual)' : ''}</Note><Text style={{ fontSize: 15, color: C.ink, lineHeight: 21 }}>{a.text}</Text></View>)}</Card>
          <H2>Need to change something?</H2>
          <Note>We keep your address, GSTIN and contact details. Tell us what to change and we'll do it.</Note>
          <Input label="What should we change?" value={msg} onChangeText={(t) => { setMsg(t); if (req.isSuccess) req.reset(); }} multiline placeholder="For example: our new delivery address is …"
            error={msg.trim() && msg.trim().length < 10 ? 'Write a little more (at least 10 letters).' : null} />
          {req.isSuccess && <Notice tone="ok">Request sent ✓ We'll update your details and let you know.</Notice>}
          {req.error && <ErrorBox text={`Not sent. ${errorText(req.error)}`} onRetry={send} busy={req.isPending} />}
          <Button title="Send request" loading={req.isPending} disabled={msg.trim().length < 10} onPress={send} />
        </>
      ) : profile.error ? failed(profile) : <Loading />)}

      <Button variant="secondary" title="Sign out" loading={leaving} icon={<Ionicons name="log-out-outline" size={20} color={C.danger} />} style={{ marginTop: 12 }}
        onPress={() => { setLeaving(true); void signOut().then(() => router.replace('/login')).finally(() => setLeaving(false)); }} />
    </Screen>
  );
}
