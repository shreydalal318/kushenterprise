'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { TextField } from '@/components/ui/field';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { trpc } from '@/lib/trpc';

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const change = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setCurrent(''); setNext(''); setConfirm('');
      onDone?.();
    },
  });
  const fe = fieldErrors(change.error);
  return (
    <form
      className="flex max-w-sm flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (next !== confirm) return setMismatch(true);
        setMismatch(false);
        change.mutate({ currentPassword: current, newPassword: next });
      }}
    >
      <TextField label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={fe.currentPassword} required />
      <TextField label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={fe.newPassword} hint="At least 10 characters with letters and a number" required />
      <TextField label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch ? 'Passwords do not match' : undefined} required />
      {change.error && !Object.keys(fe).length && <Alert>{errorMessage(change.error)}</Alert>}
      {change.isSuccess && !onDone && <Alert tone="ok">Password changed. Other devices have been signed out.</Alert>}
      <Button type="submit" loading={change.isPending} className="self-start">Change password</Button>
    </form>
  );
}
