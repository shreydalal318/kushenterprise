'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { TextField } from '@/components/ui/field';
import { PermissionPicker } from '@/components/employees/permission-picker';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { trpc } from '@/lib/trpc';

export function NewEmployeeForm() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [v, setV] = useState({ name: '', email: '', mobile: '', password: '' });
  const [permissions, setPermissions] = useState<string[]>([]);
  const create = trpc.employees.create.useMutation({
    onSuccess: (e) => { void utils.employees.list.invalidate(); router.push(`/app/employees/${e.id}?created=1`); },
  });
  const fe = fieldErrors(create.error);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <form onSubmit={(e) => { e.preventDefault(); create.mutate({ ...v, permissions: permissions as never }); }} className="flex flex-col gap-6">
      <PageHeader title="Add employee" description="They sign in with the temporary password below and must choose their own on first sign-in." />
      <Card>
        <CardHeader title="Details" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full name" value={v.name} onChange={set('name')} error={fe.name} required autoFocus />
          <TextField label="Mobile" type="tel" placeholder="98765 43210" value={v.mobile} onChange={set('mobile')} error={fe.mobile} hint="Also used for OTP sign-in" />
          <TextField label="Email" type="email" value={v.email} onChange={set('email')} error={fe.email} />
          <TextField label="Temporary password" type="text" autoComplete="off" value={v.password} onChange={set('password')} error={fe.password} hint="At least 10 characters with letters and a number" required />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Permissions" description="Untick anything this person should not see or do. The server enforces these on every request." />
        <CardBody><PermissionPicker value={permissions} onChange={setPermissions} /></CardBody>
      </Card>
      {create.error && <Alert>{Object.keys(fe).length ? 'Please correct the highlighted fields.' : errorMessage(create.error)}</Alert>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={create.isPending}>Create employee</Button>
      </div>
    </form>
  );
}
