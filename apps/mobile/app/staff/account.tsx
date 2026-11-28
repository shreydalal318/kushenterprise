import { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDateTime, passwordError } from '@kush/core';
import { Confirm, fieldErrors, Heading, Input, Note, SmallButton, Tag, Waiting } from '@/components/admin/bits';
import { Alert, Button, Card, H2, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { C } from '@/lib/theme';
import { trpc } from '@/lib/trpc';

/** A readable name for a signed-in device, from its browser / app details. */
function device(ua: string | null, client: string) {
  if (client === 'mobile' && (!ua || !/Mozilla/.test(ua))) return 'Kush Enterprise app';
  if (!ua) return 'Unknown device';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return `${client === 'mobile' ? 'Kush Enterprise app' : br || 'Browser'} on ${os}`;
}

/** My account (website: My account): change my password, and sign out of devices I don't recognise. */
export default function Account() {
  const { me } = useAuth();
  const utils = trpc.useUtils();
  const sessions = trpc.auth.mySessions.useQuery();
  const revoke = trpc.auth.revokeSession.useMutation({ onSuccess: () => utils.auth.mySessions.invalidate() });
  const change = trpc.auth.changePassword.useMutation({ onSuccess: () => utils.auth.mySessions.invalidate() });
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const nextErr = next ? passwordError(next) : null;
  const mismatch = !!again && again !== next ? 'The two new passwords are not the same.' : null;
  const fe = fieldErrors(change.error);
  const ready = !!cur && !!next && !nextErr && again === next;

  const save = () => {
    setFlash(null);
    change.mutate({ currentPassword: cur, newPassword: next }, { onSuccess: () => { setCur(''); setNext(''); setAgain(''); setFlash('Password changed ✓ Your other phones and computers are signed out.'); } });
  };
  return (
    <Screen footer={
      <>
        {change.error && <Alert>{errorText(change.error)}</Alert>}
        <Button title="Change password" loading={change.isPending} disabled={!ready} onPress={save} />
      </>
    }>
      <Stack.Screen options={{ title: 'My account' }} />
      {!!flash && <Alert tone="ok">{flash}</Alert>}
      <View style={{ gap: 4 }}>
        <Heading>{me?.name ?? 'My account'}</Heading>
        <Note>{[me?.role === 'OWNER' ? 'Owner' : 'Employee', me?.email, me?.mobile].filter(Boolean).join(' · ')}</Note>
      </View>

      <Card>
        <H2>Change password</H2>
        <Note>When you change it, your other phones and computers are signed out.</Note>
        <Input label="Current password" secureTextEntry autoCapitalize="none" value={cur} onChangeText={setCur} error={fe.currentPassword} maxLength={200} />
        <Input label="New password" secureTextEntry autoCapitalize="none" value={next} onChangeText={setNext} error={nextErr ?? fe.newPassword} hint="At least 10 characters, with letters and a number." maxLength={200} />
        <Input label="New password again" secureTextEntry autoCapitalize="none" value={again} onChangeText={setAgain} error={mismatch} maxLength={200} />
      </Card>

      <Card>
        <H2>Signed-in devices</H2>
        <Note>Sign out of any device you don’t recognise.</Note>
        {!sessions.data && <Waiting q={sessions} />}
        {revoke.error && !confirmId && <Alert>{errorText(revoke.error)}</Alert>}
        {sessions.data?.map((s) => (
          <View key={s.id} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name={s.client === 'mobile' ? 'phone-portrait-outline' : 'desktop-outline'} size={22} color={C.muted} />
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: C.ink }}>{device(s.userAgent, s.client)}</Text>
              {s.current && <Tag label="This one" tone="teal" />}
            </View>
            <Note>{`Last used ${formatDateTime(s.lastUsedAt)}${s.ip ? ` · ${s.ip}` : ''} · signed in ${formatDateTime(s.createdAt)}`}</Note>
            {!s.current && (confirmId === s.id ? (
              <Confirm question="Sign out of this device?" detail="Whoever uses it will have to sign in again." yes="Yes, sign it out" no="No, leave it"
                busy={revoke.isPending} error={revoke.error} onNo={() => { revoke.reset(); setConfirmId(null); }}
                onYes={() => revoke.mutate({ id: s.id }, { onSuccess: () => { setConfirmId(null); setFlash(`Signed out of ${device(s.userAgent, s.client)} ✓`); } })} />
            ) : (
              <SmallButton icon="log-out-outline" title="Sign out" label={`Sign out of ${device(s.userAgent, s.client)}`} onPress={() => { setFlash(null); revoke.reset(); setConfirmId(s.id); }} />
            ))}
          </View>
        ))}
      </Card>
    </Screen>
  );
}
