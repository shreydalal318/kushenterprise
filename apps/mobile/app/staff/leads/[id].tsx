import { useState } from 'react';
import { View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { formatDateTime } from '@kush/core';
import { Action, ButtonRow, callNumber, Confirm, Heading, Input, Line, NotAllowed, Note, sendEmail, SmallButton, Tag, useFlash, Waiting, whatsApp, type Tone } from '@/components/admin/bits';
import { LEAD_STATUS, LEAD_TYPE } from '@/components/admin/labels';
import { Alert, Button, Card, H2, P, Screen } from '@/components/ui';
import { useCan } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { Done } from '@/components/done';

/** One website enquiry: ring or WhatsApp them, write what happened, mark it, or make them a customer. */
export default function Lead() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const allowed = can('MANAGE_CUSTOMERS');
  const utils = trpc.useUtils();
  const q = trpc.leads.get.useQuery({ id: id! }, { enabled: allowed });
  const update = trpc.leads.update.useMutation({ onSuccess: () => utils.leads.invalidate() });
  const [flash, setFlash] = useFlash(`lead-${id}`);
  const [notes, setNotes] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const title = <Stack.Screen options={{ title: 'Enquiry' }} />;
  if (!allowed) return <Screen>{title}<NotAllowed what="see website enquiries" /></Screen>;
  if (!q.data) return <Screen>{title}<Waiting q={q} /></Screen>;
  const l = q.data;
  const text = notes ?? l.notes ?? '';
  const [word, tone]: [string, Tone] = LEAD_STATUS[l.status] ?? [l.status, 'neutral'];
  const converted = l.status === 'CONVERTED';
  const save = (status: 'CONTACTED' | 'CLOSED' | undefined, msg: string) => {
    setFlash(null);
    update.mutate({ id: l.id, notes: text, ...(status ? { status } : {}) }, { onSuccess: () => { setConfirmClose(false); setNotes(null); setFlash(msg); } });
  };

  return (
    <Screen footer={converted && l.convertedCustomerId
      ? <Button title="Open the customer" onPress={() => router.push(`/staff/customers/${l.convertedCustomerId}`)} />
      : <Button title="Make them a customer" onPress={() => router.push(`/staff/customers/new?fromLead=${l.id}`)} />}>
      {title}
      <Done message={flash} onShown={() => setFlash(null)} />
      <View style={{ gap: 6 }}>
        <Heading>{l.organisation || l.name}</Heading>
        <Tag label={word} tone={tone} />
      </View>

      <Card>
        <H2>Get in touch</H2>
        <ButtonRow>
          <SmallButton icon="call-outline" title={`Call ${l.mobile}`} label={`Call ${l.mobile}`} onPress={() => callNumber(l.mobile)} />
          <SmallButton icon="logo-whatsapp" title="WhatsApp" onPress={() => whatsApp(l.mobile)} />
          {!!l.email && <SmallButton icon="mail-outline" title="Email" onPress={() => sendEmail(l.email!)} />}
        </ButtonRow>
      </Card>

      <Card>
        <H2>Details</H2>
        <Line k="Name" v={l.name} />
        {!!l.organisation && <Line k="Hospital / clinic" v={l.organisation} />}
        {l.type && <Line k="Type" v={LEAD_TYPE[l.type] ?? l.type} />}
        {!!l.city && <Line k="City" v={l.city} />}
        {!!l.email && <Line k="Email" v={l.email} />}
        <Line k="Received" v={formatDateTime(l.createdAt)} />
        {!!l.sourcePath && <Line k="From page" v={l.sourcePath} />}
        {!!l.handledBy && <Line k="Handled by" v={l.handledBy} />}
      </Card>

      <Card>
        <H2>What they wrote</H2>
        <P>{l.message}</P>
        {l.products.length > 0 && <Note>{`Asked about: ${l.products.map((p) => p.name).join(', ')}`}</Note>}
      </Card>

      <Card>
        <H2>Notes for our team</H2>
        <Input label="What happened (only staff see this)" multiline value={text} onChangeText={setNotes} maxLength={2000} placeholder="Called, wants a quote for 20 lenses…" />
        <SmallButton icon="save-outline" title="Save notes" busy={update.isPending && update.variables?.status === undefined} disabled={notes === null}
          onPress={() => save(undefined, 'Notes saved ✓')} />
        {update.error && !confirmClose && <Alert>{errorText(update.error)}</Alert>}
      </Card>

      {!converted && (
        confirmClose ? (
          <Confirm question="Close this enquiry?" detail="Use this when they don’t need anything from us. It moves to the Closed tab." yes="Yes, close it" no="No, keep it open"
            busy={update.isPending} error={update.error} onYes={() => save('CLOSED', 'Enquiry closed.')} onNo={() => setConfirmClose(false)} />
        ) : (
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {l.status !== 'CONTACTED' && <Action icon="checkmark-circle-outline" title="Mark as contacted" disabled={update.isPending} onPress={() => save('CONTACTED', 'Marked as contacted ✓ Next: make them a customer when they order.')} />}
            {l.status !== 'CLOSED' && <Action icon="close-circle-outline" title="Close this enquiry" danger onPress={() => { update.reset(); setFlash(null); setConfirmClose(true); }} />}
          </Card>
        )
      )}
    </Screen>
  );
}
