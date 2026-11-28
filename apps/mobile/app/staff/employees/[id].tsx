import { useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { formatDateTime, passwordError } from '@kush/core';
import { Action, ButtonRow, callNumber, Confirm, fieldErrors, Heading, Input, Line, Note, Section, sendEmail, SmallButton, Tag, useFlash, Waiting, whatsApp } from '@/components/admin/bits';
import { employeeStatus, PermissionSummary } from '@/components/admin/employee-bits';
import { PermissionPicker } from '@/components/admin/pickers';
import { Alert, Button, Card, H2, LinkButton, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { trpc, type RouterOutputs } from '@/lib/trpc';

type Emp = RouterOutputs['employees']['get'];

/** One employee: contact, what they may do, password reset, deactivate (website: employee page). */
export default function Employee() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const { me } = useAuth();
  const owner = me?.role === 'OWNER';
  const utils = trpc.useUtils();
  const q = trpc.employees.get.useQuery({ id: id! }, { enabled: owner });
  const refresh = () => Promise.all([utils.employees.get.invalidate({ id }), utils.employees.list.invalidate()]);
  const active = trpc.employees.setActive.useMutation({ onSuccess: refresh });
  const [flash, setFlash] = useFlash(`employee-${id}`, created ? 'Employee added ✓ Give them the temporary password; they choose their own when they first sign in.' : null);
  const [mode, setMode] = useState<null | 'details' | 'permissions' | 'password' | 'deactivate'>(null);

  const title = <Stack.Screen options={{ title: q.data?.name ?? 'Employee' }} />;
  if (!owner) return <Screen>{title}<Alert tone="warn">Only the owner can manage employees.</Alert></Screen>;
  if (!q.data) return <Screen>{title}<Waiting q={q} /></Screen>;
  const e = q.data;
  const go = (m: typeof mode) => { setFlash(null); active.reset(); setMode(m); };
  const finish = (msg: string) => { setMode(null); setFlash(msg); };
  const [word, tone] = employeeStatus(e);

  if (mode === 'details') return <DetailsForm e={e} onBack={() => setMode(null)} onDone={finish} refresh={refresh} />;
  if (mode === 'permissions') return <PermissionsForm e={e} onBack={() => setMode(null)} onDone={finish} refresh={refresh} />;
  if (mode === 'password') return <PasswordForm e={e} onBack={() => setMode(null)} onDone={finish} refresh={refresh} />;

  return (
    <Screen footer={mode === 'deactivate' ? (
      <Confirm question={`Deactivate ${e.name}?`} detail="They are signed out at once and can’t sign in. Their history stays in the activity log. You can turn them on again later."
        yes="Yes, deactivate" no="No, keep them" busy={active.isPending} error={active.error}
        onYes={() => active.mutate({ id: e.id, isActive: false }, { onSuccess: () => finish(`${e.name} is deactivated and signed out everywhere.`) })} onNo={() => setMode(null)} />
    ) : e.isActive ? (
      <Button title="Change what they can do" onPress={() => go('permissions')} />
    ) : (
      <>
        {active.error && <Alert>{errorText(active.error)}</Alert>}
        <Button title="Turn their login on again" loading={active.isPending} onPress={() => active.mutate({ id: e.id, isActive: true }, { onSuccess: () => finish(`${e.name} can sign in again ✓`) })} />
      </>
    )}>
      {title}
      {!!flash && <Alert tone="ok">{flash}</Alert>}
      <View style={{ gap: 6 }}>
        <Heading>{e.name}</Heading>
        <Tag label={word} tone={tone} />
        <Note>{`Last signed in: ${e.lastLoginAt ? formatDateTime(e.lastLoginAt) : 'never'} · added ${formatDateTime(e.createdAt)}`}</Note>
      </View>
      <Card>
        <H2>Contact</H2>
        <Line k="Mobile" v={e.mobile ?? 'Not given'} />
        <Line k="Email" v={e.email ?? 'Not given'} />
        {!!(e.mobile || e.email) && (
          <ButtonRow>
            {!!e.mobile && <SmallButton icon="call-outline" title="Call" onPress={() => callNumber(e.mobile!)} />}
            {!!e.mobile && <SmallButton icon="logo-whatsapp" title="WhatsApp" onPress={() => whatsApp(e.mobile!)} />}
            {!!e.email && <SmallButton icon="mail-outline" title="Email" onPress={() => sendEmail(e.email!)} />}
          </ButtonRow>
        )}
      </Card>
      <Card>
        <H2>What they can do</H2>
        <PermissionSummary value={e.permissions} />
      </Card>
      <Section>More</Section>
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        <Action icon="create-outline" title="Change name, mobile or email" onPress={() => go('details')} />
        <Action icon="key-outline" title="Reset their password" onPress={() => go('password')} />
        {e.isActive && <Action icon="close-circle-outline" title="Deactivate" danger onPress={() => go('deactivate')} />}
      </Card>
    </Screen>
  );
}

interface FormProps { e: Emp; onBack: () => void; onDone: (msg: string) => void; refresh: () => Promise<unknown> }

function DetailsForm({ e, onBack, onDone, refresh }: FormProps) {
  const [v, setV] = useState({ name: e.name, mobile: e.mobile ?? '', email: e.email ?? '' });
  const update = trpc.employees.update.useMutation({ onSuccess: async () => { await refresh(); onDone('Details saved ✓'); } });
  const fe = fieldErrors(update.error);
  return (
    <Screen footer={
      <>
        {update.error && <Alert>{errorText(update.error)}</Alert>}
        <Button title="Save details" loading={update.isPending} disabled={v.name.trim().length < 2 || (!v.mobile.trim() && !v.email.trim())}
          onPress={() => update.mutate({ id: e.id, name: v.name, mobile: v.mobile.trim() || null, email: v.email.trim() || null })} />
        <LinkButton tone="muted" title="Back" onPress={onBack} disabled={update.isPending} />
      </>
    }>
      <Stack.Screen options={{ title: e.name }} />
      <Heading>Change details</Heading>
      <Card>
        <Input label="Full name" value={v.name} onChangeText={(name) => setV({ ...v, name })} error={fe.name} maxLength={120} />
        <Input label="Mobile" keyboardType="phone-pad" value={v.mobile} onChangeText={(mobile) => setV({ ...v, mobile })} error={fe.mobile} maxLength={16} />
        <Input label="Email" keyboardType="email-address" autoCapitalize="none" value={v.email} onChangeText={(email) => setV({ ...v, email })} error={fe.email} maxLength={200} />
        <Note>They need a mobile or an email to sign in.</Note>
      </Card>
    </Screen>
  );
}

function PermissionsForm({ e, onBack, onDone, refresh }: FormProps) {
  const [perms, setPerms] = useState<string[]>(e.permissions);
  const save = trpc.employees.setPermissions.useMutation({ onSuccess: async () => { await refresh(); onDone(`Saved ✓ ${e.name}’s new permissions apply on their next tap, with no need to sign out.`); } });
  const dirty = [...perms].sort().join(',') !== [...e.permissions].sort().join(',');
  return (
    <Screen footer={
      <>
        {save.error && <Alert>{errorText(save.error)}</Alert>}
        {!dirty && <Note style={{ textAlign: 'center' }}>Tick or untick something to save.</Note>}
        <Button title="Save permissions" loading={save.isPending} disabled={!dirty} onPress={() => save.mutate({ id: e.id, permissions: perms as never })} />
        <LinkButton tone="muted" title="Back" onPress={onBack} disabled={save.isPending} />
      </>
    }>
      <Stack.Screen options={{ title: e.name }} />
      <Heading>{`What ${e.name} can do`}</Heading>
      <PermissionPicker value={perms} onChange={setPerms} />
    </Screen>
  );
}

function PasswordForm({ e, onBack, onDone, refresh }: FormProps) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState(false);
  const reset = trpc.employees.resetPassword.useMutation({ onSuccess: async () => { await refresh(); onDone(`Password reset ✓ ${e.name} is signed out everywhere and must choose a new password when they sign in with this one.`); } });
  const err = pw ? passwordError(pw) : null;
  const fe = fieldErrors(reset.error);
  return (
    <Screen footer={confirm ? (
      <Confirm question={`Reset ${e.name}’s password?`} detail="They are signed out on every phone and computer straight away." yes="Yes, reset it" no="No, go back"
        busy={reset.isPending} error={reset.error} onYes={() => reset.mutate({ id: e.id, password: pw })} onNo={() => { reset.reset(); setConfirm(false); }} />
    ) : (
      <>
        <Button title="Reset password" disabled={!pw || !!err} onPress={() => setConfirm(true)} />
        <LinkButton tone="muted" title="Back" onPress={onBack} />
      </>
    )}>
      <Stack.Screen options={{ title: e.name }} />
      <Heading>Reset password</Heading>
      <Note>Give them this temporary password. They must choose their own the next time they sign in.</Note>
      <Card>
        <Input label="New temporary password" autoCapitalize="none" autoCorrect={false} value={pw} onChangeText={setPw} error={err ?? fe.password} hint="At least 10 characters, with letters and a number." maxLength={200} />
      </Card>
    </Screen>
  );
}
