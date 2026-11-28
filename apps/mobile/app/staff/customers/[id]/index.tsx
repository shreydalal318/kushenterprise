import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { formatDateTime, stateByCode } from '@kush/core';
import {
  Action, ButtonRow, callNumber, Check, Confirm, fieldErrors, Heading, Input, Line, NotAllowed, Note, sendEmail, SmallButton, subErrors, Tag, useFlash, Waiting, whatsApp,
} from '@/components/admin/bits';
import { AddressFields, addressValue, CustomerForm, emptyAddress, TYPE_LABEL, type AddressValue } from '@/components/admin/customer-form';
import { Picker } from '@/components/admin/pickers';
import { Alert, Button, Card, H2, LinkButton, P, Screen } from '@/components/ui';
import { useAuth, useCan } from '@/lib/auth';
import { API_URL } from '@/lib/config';
import { errorText, rupees } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type Customer = RouterOutputs['customers']['get'];
interface Draft { id?: string; kind: 'BILLING' | 'SHIPPING'; isDefault: boolean; value: AddressValue }
const SAVED: Record<string, string> = { new: 'Customer saved ✓', lead: 'Customer saved ✓ The website enquiry now shows as a customer.' };
const sep = { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line } as const;

/** One customer, top to bottom: contact, tax, credit, prices, addresses, doctors, logins. Edit or deactivate from here (website: customer page). */
export default function CustomerDetail() {
  const { id, saved } = useLocalSearchParams<{ id: string; saved?: string }>();
  const can = useCan();
  const allowed = can('MANAGE_CUSTOMERS');
  const utils = trpc.useUtils();
  const q = trpc.customers.get.useQuery({ id: id! }, { enabled: allowed });
  const active = trpc.customers.setActive.useMutation({ onSuccess: () => Promise.all([utils.customers.get.invalidate({ id }), utils.customers.list.invalidate()]) });
  const [flash, setFlash] = useFlash(`customer-${id}`, saved ? SAVED[saved] ?? null : null);
  const [mode, setMode] = useState<null | 'edit' | 'address' | 'login' | 'deactivate'>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  if (!allowed) return <Screen><Stack.Screen options={{ title: 'Customer' }} /><NotAllowed what="see customers" /></Screen>;
  if (!q.data) return <Screen><Stack.Screen options={{ title: 'Customer' }} /><Waiting q={q} /></Screen>;
  const c = q.data;
  const go = (m: typeof mode) => { setFlash(null); active.reset(); setMode(m); };
  const finish = (msg: string) => { setMode(null); setFlash(msg); };
  const openAddress = (d: Draft) => { setDraft(d); go('address'); };
  const title = <Stack.Screen options={{ title: c.name }} />;

  if (mode === 'edit') {
    return (
      <CustomerForm customer={c} onBack={() => setMode(null)} onSaved={() => finish('Details saved ✓')}>
        {title}
        <Heading>Edit details</Heading>
      </CustomerForm>
    );
  }
  if (mode === 'address' && draft) return <AddressEditor c={c} draft={draft} onBack={() => setMode(null)} onDone={finish} />;
  if (mode === 'login') return <LoginForm c={c} onBack={() => setMode(null)} onDone={finish} />;

  const place = c.type === 'CLINIC' ? 'clinic' : 'hospital';
  return (
    <Screen footer={mode === 'deactivate' ? (
      <Confirm question={`Deactivate ${c.name}?`} detail="They drop off the lists for new orders and invoices, and their app and website logins stop working. You can activate them again later."
        yes="Yes, deactivate" no="No, keep them" busy={active.isPending} error={active.error}
        onYes={() => active.mutate({ id: c.id, isActive: false }, { onSuccess: () => finish(`${c.name} is deactivated. Their logins are turned off.`) })} onNo={() => setMode(null)} />
    ) : c.isActive ? (
      <Button title="Edit details" onPress={() => go('edit')} />
    ) : (
      <>
        {active.error && <Alert>{errorText(active.error)}</Alert>}
        <Button title="Activate again" loading={active.isPending} onPress={() => active.mutate({ id: c.id, isActive: true }, { onSuccess: () => finish(`${c.name} is active again ✓ Their logins stay off until you turn them on.`) })} />
      </>
    )}>
      {title}
      {!!flash && <Alert tone="ok">{flash}</Alert>}
      <View style={{ gap: 6 }}>
        <Heading>{c.name}</Heading>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Tag label={TYPE_LABEL[c.type]} tone="teal" />
          {!c.isActive && <Tag label="Inactive" tone="danger" />}
          <Note>{c.code}</Note>
        </View>
        {c.parent && <Action icon="business-outline" title={`Works at ${c.parent.name}`} onPress={() => router.push(`/staff/customers/${c.parent!.id}`)} />}
      </View>

      <Card>
        <H2>Contact</H2>
        {!!c.contactPerson && <Line k="Contact person" v={c.contactPerson} />}
        <Line k="Mobile" v={c.mobile ?? 'Not given'} />
        <Line k="Email" v={c.email ?? 'Not given'} />
        {!!(c.mobile || c.email) && (
          <ButtonRow>
            {!!c.mobile && <SmallButton icon="call-outline" title="Call" onPress={() => callNumber(c.mobile!)} />}
            {!!c.mobile && <SmallButton icon="logo-whatsapp" title="WhatsApp" onPress={() => whatsApp(c.mobile!)} />}
            {!!c.email && <SmallButton icon="mail-outline" title="Email" onPress={() => sendEmail(c.email!)} />}
          </ButtonRow>
        )}
      </Card>

      <Card>
        <H2>Tax and licence</H2>
        <Line k="State" v={stateByCode(c.stateCode)?.name ?? c.stateCode} />
        <Line k="GSTIN" v={c.gstin ?? 'None'} />
        <Line k="PAN" v={c.pan ?? 'None'} />
        <Line k="Drug licence" v={c.drugLicenceNo ?? 'None'} />
      </Card>

      <Card>
        <H2>Credit</H2>
        <Line k="Credit limit" v={c.creditLimit == null ? 'No limit set' : rupees(c.creditLimit)} />
        <Line k="Days to pay" v={`${c.paymentTermsDays} days`} />
        <Line k="Looked after by" v={c.assignedEmployee?.name ?? 'Nobody'} />
        <Action icon="document-text-outline" title="Statement: what they owe" onPress={() => router.push(`/staff/customers/${c.id}/statement`)} />
      </Card>

      <PricesCard c={c} />

      <Card>
        <H2>Addresses</H2>
        {c.addresses.map((a) => (
          <View key={a.id} style={sep}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <Tag label={a.kind === 'BILLING' ? 'Billing' : 'Delivery'} tone={a.kind === 'BILLING' ? 'teal' : 'neutral'} />
              {a.isDefault && <Tag label="Main" tone="ok" />}
              {!!a.label && <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{a.label}</Text>}
            </View>
            <P>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</P>
            <Note>{`${a.city} – ${a.pincode}, ${stateByCode(a.stateCode)?.name ?? a.stateCode}${a.gstin ? ` · GSTIN ${a.gstin}` : ''}`}</Note>
            <SmallButton icon="create-outline" title="Change or remove" onPress={() => openAddress({ id: a.id, kind: a.kind, isDefault: a.isDefault, value: addressValue(a) })} />
          </View>
        ))}
        <View style={sep}>
          <Action icon="add-circle-outline" title="Add a delivery address" onPress={() => openAddress({ kind: 'SHIPPING', isDefault: false, value: emptyAddress(c.stateCode) })} />
          <Action icon="add-circle-outline" title="Add a billing address" onPress={() => openAddress({ kind: 'BILLING', isDefault: false, value: emptyAddress(c.stateCode) })} />
        </View>
      </Card>

      {c.type !== 'DOCTOR' && (
        <Card>
          <H2>{`Doctors here (${c.doctors.length})`}</H2>
          <Note>{`Orders can be placed for a doctor at this ${place}.`}</Note>
          {c.doctors.map((d) => <Action key={d.id} icon="person-outline" title={`${d.name}${d.isActive ? '' : ' (inactive)'}`} onPress={() => router.push(`/staff/customers/${d.id}`)} />)}
          <Action icon="person-add-outline" title="Add a doctor" onPress={() => router.push(`/staff/customers/new?parentId=${c.id}&type=DOCTOR`)} />
        </Card>
      )}

      <LoginsCard c={c} onAdd={() => go('login')} />

      {!!c.notes && <Card><H2>Notes for our team</H2><P>{c.notes}</P></Card>}

      {c.isActive && (
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          <Action icon="close-circle-outline" title="Deactivate this customer" danger onPress={() => go('deactivate')} />
        </Card>
      )}
    </Screen>
  );
}

/** Which prices they pay. Choosing the price list is the owner's call (as on the website). */
function PricesCard({ c }: { c: Customer }) {
  const { me } = useAuth();
  const can = useCan();
  const owner = me?.role === 'OWNER';
  const utils = trpc.useUtils();
  const [done, setDone] = useState<string | null>(null);
  const lists = trpc.priceLists.list.useQuery(undefined, { enabled: owner });
  const assign = trpc.customers.setPriceList.useMutation({ onSuccess: () => Promise.all([utils.customers.get.invalidate({ id: c.id }), utils.customers.list.invalidate(), utils.pricing.invalidate()]) });
  return (
    <Card>
      <H2>Prices</H2>
      <Note>They pay their special price if there is one, else their price list’s rate, else the normal rate.</Note>
      {!!done && <Alert tone="ok">{done}</Alert>}
      {owner ? (
        <Picker label="Price list" value={c.priceListId ?? ''} disabled={assign.isPending}
          onChange={(v) => { setDone(null); assign.mutate({ customerId: c.id, priceListId: v || null }, { onSuccess: () => setDone(v ? `Price list changed to ${lists.data?.find((l) => l.id === v)?.name ?? 'the new list'} ✓` : 'Now on normal prices ✓') }); }}
          options={[{ value: '', label: 'None (normal prices)' }, ...(lists.data ?? []).map((l) => ({ value: l.id, label: `${l.name}${l.isActive ? '' : ' (not in use)'}` }))]} />
      ) : <Line k="Price list" v={c.priceList?.name ?? 'None (normal prices)'} />}
      {assign.error && <Alert>{errorText(assign.error)}</Alert>}
      <Line k="Special prices" v={String(c._count.customPrices)} />
      {can('VIEW_PRICES_MARGINS') && <Action icon="pricetags-outline" title="See their prices" onPress={() => router.push(`/staff/pricing/customer/${c.id}`)} />}
    </Card>
  );
}

/** App / website logins for people at this customer: add, turn on or off, send the sign-in SMS. */
function LoginsCard({ c, onAdd }: { c: Customer; onAdd: () => void }) {
  const utils = trpc.useUtils();
  const [done, setDone] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const toggle = trpc.customers.setLoginActive.useMutation({ onSuccess: () => utils.customers.get.invalidate({ id: c.id }) });
  const invite = trpc.customers.sendLoginInvite.useMutation();
  // The sign-in page on the website (the web preview runs on it; the phone app talks to it).
  const site = Platform.OS === 'web' ? (typeof window === 'undefined' ? '' : window.location.origin) : API_URL;
  const appUrl = /^https?:\/\//.test(site) ? `${site}/login` : undefined;
  const reset = () => { setDone(null); toggle.reset(); invite.reset(); };
  return (
    <Card>
      <H2>App and website logins</H2>
      <Note>They sign in with a one-time code sent to their mobile.</Note>
      {!!done && <Alert tone="ok">{done}</Alert>}
      {(toggle.error || invite.error) && <Alert>{errorText(toggle.error ?? invite.error)}</Alert>}
      {!c.logins.length && <Note>No logins yet.</Note>}
      {c.logins.map((l) => (
        <View key={l.id} style={sep}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.ink }}>{l.name}</Text>
            <Tag label={l.isActive ? 'On' : 'Off'} tone={l.isActive ? 'ok' : 'neutral'} />
          </View>
          <Note>{`${l.mobile ?? 'No mobile'}${l.lastLoginAt ? ` · last signed in ${formatDateTime(l.lastLoginAt)}` : ' · never signed in'}`}</Note>
          {confirmId === l.id ? (
            <Confirm question={`Turn off ${l.name}’s login?`} detail="They are signed out at once and can’t sign in until you turn it on again." yes="Yes, turn it off" no="No, keep it on"
              busy={toggle.isPending} error={toggle.error} onNo={() => setConfirmId(null)}
              onYes={() => toggle.mutate({ userId: l.id, isActive: false }, { onSuccess: () => { setConfirmId(null); setDone(`${l.name}’s login is turned off.`); } })} />
          ) : (
            <ButtonRow>
              {!!(l.isActive && l.mobile) && (
                <SmallButton icon="chatbubble-ellipses-outline" title="Send sign-in SMS" busy={invite.isPending && invite.variables?.userId === l.id}
                  onPress={() => { reset(); invite.mutate({ userId: l.id, appUrl }, { onSuccess: (r) => setDone(`Sign-in SMS sent to ${l.mobile} ✓${r.channel === 'console' ? ' (test server: written to its log, not really sent)' : ''}`) }); }} />
              )}
              {l.isActive
                ? <SmallButton icon="close-circle-outline" title="Turn off" onPress={() => { reset(); setConfirmId(l.id); }} />
                : <SmallButton icon="checkmark-circle-outline" title="Turn on" busy={toggle.isPending && toggle.variables?.userId === l.id}
                    onPress={() => { reset(); toggle.mutate({ userId: l.id, isActive: true }, { onSuccess: () => setDone(`${l.name}’s login is on again ✓`) }); }} />}
            </ButtonRow>
          )}
        </View>
      ))}
      {c.isActive
        ? <View style={sep}><Action icon="person-add-outline" title="Add a login" onPress={onAdd} /></View>
        : <Note>Activate the customer to add or turn on logins.</Note>}
    </Card>
  );
}

function LoginForm({ c, onBack, onDone }: { c: Customer; onBack: () => void; onDone: (msg: string) => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ name: c.contactPerson ?? c.name, mobile: c.mobile ?? '', email: c.email ?? '' });
  const create = trpc.customers.createLogin.useMutation({
    onSuccess: async () => { await utils.customers.get.invalidate({ id: c.id }); onDone(`Login made for ${v.name.trim()} ✓ Next: tap “Send sign-in SMS” so they know how to sign in.`); },
  });
  const fe = fieldErrors(create.error);
  const missing = [!v.name.trim() && 'the name', !v.mobile.trim() && 'the mobile'].filter(Boolean);
  return (
    <Screen footer={
      <>
        {create.error && <Alert>{errorText(create.error)}</Alert>}
        {missing.length > 0 && <Note style={{ textAlign: 'center' }}>To save, fill in {missing.join(' and ')}.</Note>}
        <Button title="Create login" loading={create.isPending} disabled={missing.length > 0} onPress={() => create.mutate({ customerId: c.id, ...v })} />
        <LinkButton tone="muted" title="Back" onPress={onBack} disabled={create.isPending} />
      </>
    }>
      <Stack.Screen options={{ title: c.name }} />
      <Heading>Add a login</Heading>
      <Note>This person signs in to the customer app or the website with a one-time code sent to their mobile. No password needed.</Note>
      <Card>
        <Input label="Person’s name" value={v.name} onChangeText={(name) => setV({ ...v, name })} error={fe.name} maxLength={120} />
        <Input label="Mobile (gets the code)" keyboardType="phone-pad" value={v.mobile} onChangeText={(mobile) => setV({ ...v, mobile })} error={fe.mobile} maxLength={16} />
        <Input label="Email (optional)" keyboardType="email-address" autoCapitalize="none" value={v.email} onChangeText={(email) => setV({ ...v, email })} error={fe.email} maxLength={200} />
      </Card>
    </Screen>
  );
}

function AddressEditor({ c, draft, onBack, onDone }: { c: Customer; draft: Draft; onBack: () => void; onDone: (msg: string) => void }) {
  const utils = trpc.useUtils();
  const [d, setD] = useState(draft);
  const [confirm, setConfirm] = useState(false);
  const refresh = () => utils.customers.get.invalidate({ id: c.id });
  const add = trpc.customers.addAddress.useMutation({ onSuccess: async () => { await refresh(); onDone('Address added ✓'); } });
  const upd = trpc.customers.updateAddress.useMutation({ onSuccess: async () => { await refresh(); onDone('Address saved ✓'); } });
  const del = trpc.customers.removeAddress.useMutation({ onSuccess: async () => { await refresh(); onDone('Address removed.'); } });
  const m = d.id ? upd : add;
  const fe = subErrors(fieldErrors(m.error), 'address');
  const kind = d.kind === 'BILLING' ? 'billing' : 'delivery';
  const save = () => (d.id
    ? upd.mutate({ id: d.id, isDefault: d.isDefault, address: d.value })
    : add.mutate({ customerId: c.id, kind: d.kind, isDefault: d.isDefault, address: d.value }));
  return (
    <Screen footer={confirm ? (
      <Confirm question="Remove this address?" detail="Invoices already made keep the address printed on them." yes="Yes, remove it" no="No, keep it"
        busy={del.isPending} error={del.error} onYes={() => del.mutate({ id: d.id! })} onNo={() => { del.reset(); setConfirm(false); }} />
    ) : (
      <>
        {m.error && <Alert>{errorText(m.error)}</Alert>}
        <Button title="Save address" loading={m.isPending} onPress={save} />
        <LinkButton tone="muted" title="Back" onPress={onBack} disabled={m.isPending} />
      </>
    )}>
      <Stack.Screen options={{ title: c.name }} />
      <Heading>{d.id ? `Change ${kind} address` : `Add a ${kind} address`}</Heading>
      <Card>
        <AddressFields full value={d.value} onChange={(value) => setD({ ...d, value })} errors={fe} />
        <Check label={`Make this the main ${kind} address`} value={d.isDefault} onChange={(isDefault) => setD({ ...d, isDefault })} />
      </Card>
      {!!d.id && (
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          <Action icon="trash-outline" title="Remove this address" danger onPress={() => setConfirm(true)} />
        </Card>
      )}
    </Screen>
  );
}
