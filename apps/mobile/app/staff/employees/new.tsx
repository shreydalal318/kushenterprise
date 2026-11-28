import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { passwordError } from '@kush/core';
import { fieldErrors, Heading, Input, Note, Section } from '@/components/admin/bits';
import { PermissionPicker } from '@/components/admin/pickers';
import { Alert, Button, Card, LinkButton, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorText } from '@/lib/format';
import { trpc } from '@/lib/trpc';

/** A new staff login: who they are, a temporary password, and what they may do. */
export default function NewEmployee() {
  const { me } = useAuth();
  const utils = trpc.useUtils();
  const [v, setV] = useState({ name: '', mobile: '', email: '', password: '' });
  const [permissions, setPermissions] = useState<string[]>([]);
  const create = trpc.employees.create.useMutation({
    onSuccess: (e) => { void utils.employees.list.invalidate(); router.replace(`/staff/employees/${e.id}?created=1`); },
  });
  const fe = fieldErrors(create.error);
  const pwErr = v.password ? passwordError(v.password) : null;
  const title = <Stack.Screen options={{ title: 'Add employee' }} />;
  if (me?.role !== 'OWNER') return <Screen>{title}<Alert tone="warn">Only the owner can add employees.</Alert></Screen>;
  const missing = [v.name.trim().length < 2 && 'the name', !v.mobile.trim() && !v.email.trim() && 'a mobile or an email', !v.password && 'a temporary password'].filter(Boolean);
  return (
    <Screen footer={
      <>
        {create.error && <Alert>{errorText(create.error)}</Alert>}
        {missing.length > 0 && <Note style={{ textAlign: 'center' }}>{`To save, fill in ${missing.join(', ')}.`}</Note>}
        <Button title="Create employee" loading={create.isPending} disabled={missing.length > 0 || !!pwErr}
          onPress={() => create.mutate({ ...v, permissions: permissions as never })} />
        <LinkButton tone="muted" title="Back" onPress={() => router.back()} disabled={create.isPending} />
      </>
    }>
      {title}
      <Heading>Add employee</Heading>
      <Note>They sign in with the temporary password below and must choose their own the first time.</Note>
      <Card>
        <Input label="Full name" value={v.name} onChangeText={(name) => setV({ ...v, name })} error={fe.name} maxLength={120} />
        <Input label="Mobile" keyboardType="phone-pad" placeholder="98765 43210" value={v.mobile} onChangeText={(mobile) => setV({ ...v, mobile })} error={fe.mobile} hint="Also lets them sign in with a one-time code." maxLength={16} />
        <Input label="Email" keyboardType="email-address" autoCapitalize="none" value={v.email} onChangeText={(email) => setV({ ...v, email })} error={fe.email} maxLength={200} />
        <Input label="Temporary password" autoCapitalize="none" autoCorrect={false} value={v.password} onChangeText={(password) => setV({ ...v, password })}
          error={pwErr ?? fe.password} hint="At least 10 characters, with letters and a number." maxLength={200} />
      </Card>
      <Section>What they may do</Section>
      <Note>Untick anything this person should not see or do. The server checks these on every request.</Note>
      <PermissionPicker value={permissions} onChange={setPermissions} />
    </Screen>
  );
}
