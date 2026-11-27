import { useState } from 'react';
import { router } from 'expo-router';
import { passwordError } from '@kush/core';
import { Alert, Button, Field, P, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { trpc } from '@/lib/trpc';

export default function ChangePassword() {
  const utils = trpc.useUtils();
  const { signOut } = useAuth();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const nextErr = next ? passwordError(next) : null;
  const m = trpc.auth.changePassword.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); router.replace('/'); } });
  return (
    <Screen>
      <P>Please choose a new password before continuing.</P>
      <Field label="Current password" value={cur} onChangeText={setCur} secureTextEntry />
      <Field label="New password" value={next} onChangeText={setNext} secureTextEntry error={nextErr} />
      {m.error && <Alert>{errorText(m.error)}</Alert>}
      <Button title="Change password" loading={m.isPending} disabled={!cur || !next || !!nextErr} onPress={() => m.mutate({ currentPassword: cur, newPassword: next })} />
      <Button variant="secondary" title="Sign out" onPress={() => void signOut().then(() => router.replace('/login'))} />
    </Screen>
  );
}
