import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AGEING_BUCKETS, formatDate } from '@kush/core';
import { Alert, Button, Card, Field, H2, KV, Loading, P, Row, Screen, Small, Tabs } from '@/components/ui';
import { PayBadge } from '@/components/status';
import { useAuth } from '@/lib/auth';
import { docPath, openPdf } from '@/lib/documents';
import { errorText, rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

export default function AccountScreen() {
  const { me, signOut } = useAuth();
  const [tab, setTab] = useState<'balance' | 'invoices' | 'profile'>('balance');
  const ledger = trpc.portal.ledger.useQuery();
  const docs = trpc.portal.documents.useQuery(undefined, { enabled: tab === 'invoices' });
  const profile = trpc.portal.profile.useQuery(undefined, { enabled: tab === 'profile' });
  const [msg, setMsg] = useState('');
  const req = trpc.portal.requestChange.useMutation({ onSuccess: () => setMsg('') });
  const [err, setErr] = useState<string | null>(null);
  const pdf = (path: string, name: string) => { setErr(null); openPdf(path, name).catch((e) => setErr(errorText(e))); };
  return (
    <Screen>
      <Tabs value={tab} onChange={setTab} options={[['balance', 'Balance'], ['invoices', 'Invoices'], ['profile', 'Profile']]} />
      {err && <Alert>{err}</Alert>}
      {tab === 'balance' && (ledger.data ? (
        <>
          <Card>
            <Small>Outstanding</Small>
            <P style={{ fontSize: 24, fontWeight: '700', color: ledger.data.outstanding > 0 ? C.navy : C.ok }}>{rupees(Math.abs(ledger.data.outstanding))}{ledger.data.outstanding < 0 ? ' advance' : ''}</P>
            {ledger.data.overdue > 0 && <Small style={{ color: C.danger }}>{rupees(ledger.data.overdue)} overdue</Small>}
            <Small>Terms {ledger.data.customer.paymentTermsDays} days</Small>
          </Card>
          <Card>{AGEING_BUCKETS.map((b) => <KV key={b} k={`${b} days`} v={rupees(ledger.data!.ageing[b])} />)}</Card>
          <Button title="Statement PDF" onPress={() => me?.customerId && pdf(`/api/statement/${me.customerId}`, 'Statement.pdf')} />
          <H2>Unpaid invoices</H2>
          {ledger.data.openInvoices.length === 0 && <Small>Nothing due. Thank you!</Small>}
          {ledger.data.openInvoices.map((i) => (
            <Card key={i.id}>
              <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700' }}>{i.number}</P><PayBadge status={i.status} /></Row>
              <Small>Due {formatDate(i.dueDate)} · {rupees(i.due)} of {rupees(i.total)}</Small>
            </Card>
          ))}
        </>
      ) : <Loading />)}
      {tab === 'invoices' && (docs.data ? (
        <>
          {docs.data.invoices.map((i) => (
            <Card key={i.id}>
              <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700' }}>{i.number}</P><PayBadge status={i.status} /></Row>
              <Small>{i.date ? formatDate(i.date) : ''} · {rupees(i.total)}{i.due ? ` · due ${rupees(i.due)}` : ''}</Small>
              <Button variant="secondary" title="Open / share PDF" onPress={() => pdf(docPath('invoice', i.id), `${i.number}.pdf`)} />
            </Card>
          ))}
          {docs.data.proformas.map((p) => (
            <Card key={p.id}><P style={{ fontWeight: '700' }}>Proforma {p.number}</P><Small>{rupees(p.total)} · {p.status.toLowerCase()}</Small><Button variant="secondary" title="Open / share PDF" onPress={() => pdf(docPath('proforma', p.id), `${p.number}.pdf`)} /></Card>
          ))}
          {!docs.data.invoices.length && !docs.data.proformas.length && <Small>No invoices yet.</Small>}
        </>
      ) : <Loading />)}
      {tab === 'profile' && (profile.data ? (
        <>
          <Card>
            <H2>{profile.data.name}</H2>
            <KV k="Account" v={profile.data.code} />
            {profile.data.gstin && <KV k="GSTIN" v={profile.data.gstin} />}
            <KV k="Signed in as" v={profile.data.login.name} />
            {profile.data.contact && <KV k="Your contact" v={`${profile.data.contact.name}${profile.data.contact.mobile ? ` · ${profile.data.contact.mobile}` : ''}`} />}
          </Card>
          <Card>{profile.data.addresses.map((a) => <View key={a.id}><Small>{a.kind === 'BILLING' ? 'Billing' : 'Delivery'}{a.isDefault ? ' (default)' : ''}</Small><P>{a.text}</P></View>)}</Card>
          <Field label="Ask for a change (address, GSTIN, contact…)" value={msg} onChangeText={setMsg} multiline />
          {req.isSuccess && <Alert tone="ok">Sent. We will update your account and let you know.</Alert>}
          {req.error && <Alert>{errorText(req.error)}</Alert>}
          <Button variant="secondary" title="Send request" loading={req.isPending} onPress={() => req.mutate({ message: msg })} />
        </>
      ) : <Loading />)}
      <Button variant="danger" title="Sign out" onPress={() => void signOut().then(() => router.replace('/login'))} />
    </Screen>
  );
}
