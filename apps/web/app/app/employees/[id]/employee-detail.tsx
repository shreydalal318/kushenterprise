'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { formatDateTime } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { TextField } from '@/components/ui/field';
import { PermissionPicker } from '@/components/employees/permission-picker';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { trpc } from '@/lib/trpc';

export function EmployeeDetail({ id, created }: { id: string; created: boolean }) {
  const utils = trpc.useUtils();
  const q = trpc.employees.get.useQuery({ id });
  const refresh = () => Promise.all([utils.employees.get.invalidate({ id }), utils.employees.list.invalidate()]);

  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const e = q.data;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/employees" className="flex items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> All employees</Link>
      <PageHeader
        title={e.name}
        description={<>Last sign-in: {e.lastLoginAt ? formatDateTime(e.lastLoginAt) : 'never'}</>}
        actions={!e.isActive ? <Badge tone="danger">Deactivated</Badge> : e.mustChangePassword ? <Badge tone="warn">Awaiting first sign-in</Badge> : <Badge tone="ok">Active</Badge>}
      />
      {created && <Alert tone="ok">Employee created. Share the temporary password with them; they will set their own on first sign-in.</Alert>}
      <DetailsCard e={e} onSaved={refresh} />
      <PermissionsCard id={e.id} initial={e.permissions} onSaved={refresh} />
      <SecurityCard e={e} onSaved={refresh} />
    </div>
  );
}

type Emp = { id: string; name: string; email: string | null; mobile: string | null; isActive: boolean; permissions: string[] };

function DetailsCard({ e, onSaved }: { e: Emp; onSaved: () => void }) {
  const [v, setV] = useState({ name: e.name, email: e.email ?? '', mobile: e.mobile ?? '' });
  const update = trpc.employees.update.useMutation({ onSuccess: onSaved });
  const fe = fieldErrors(update.error);
  return (
    <Card>
      <form onSubmit={(ev) => { ev.preventDefault(); update.mutate({ id: e.id, name: v.name, email: v.email || null, mobile: v.mobile || null }); }}>
        <CardHeader title="Details" />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <TextField label="Full name" value={v.name} onChange={(x) => setV({ ...v, name: x.target.value })} error={fe.name} />
          <TextField label="Mobile" type="tel" value={v.mobile} onChange={(x) => setV({ ...v, mobile: x.target.value })} error={fe.mobile} />
          <TextField label="Email" type="email" value={v.email} onChange={(x) => setV({ ...v, email: x.target.value })} error={fe.email} />
          {update.error && !Object.keys(fe).length && <div className="sm:col-span-3"><Alert>{errorMessage(update.error)}</Alert></div>}
        </CardBody>
        <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-3">
          {update.isSuccess && <span className="text-sm text-ok">Saved</span>}
          <Button type="submit" loading={update.isPending}>Save details</Button>
        </div>
      </form>
    </Card>
  );
}

function PermissionsCard({ id, initial, onSaved }: { id: string; initial: string[]; onSaved: () => void }) {
  const [perms, setPerms] = useState(initial);
  const key = initial.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setPerms(initial), [key]);
  const dirty = [...perms].sort().join(',') !== [...initial].sort().join(',');
  const save = trpc.employees.setPermissions.useMutation({ onSuccess: onSaved });
  return (
    <Card>
      <CardHeader title="Permissions" description="Saved changes take effect on the employee’s next click, with no need to sign out." />
      <CardBody><PermissionPicker value={perms} onChange={setPerms} /></CardBody>
      <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-3">
        {save.error && <span className="text-sm text-danger">{errorMessage(save.error)}</span>}
        {save.isSuccess && !dirty && <span className="text-sm text-ok">Saved</span>}
        <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate({ id, permissions: perms as never })}>Save permissions</Button>
      </div>
    </Card>
  );
}

function SecurityCard({ e, onSaved }: { e: Emp; onSaved: () => void }) {
  const [pw, setPw] = useState('');
  const reset = trpc.employees.resetPassword.useMutation({ onSuccess: () => { setPw(''); onSaved(); } });
  const active = trpc.employees.setActive.useMutation({ onSuccess: onSaved });
  const fe = fieldErrors(reset.error);
  return (
    <Card>
      <CardHeader title="Sign-in & access" />
      <CardBody className="flex flex-col gap-6">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(ev) => { ev.preventDefault(); reset.mutate({ id: e.id, password: pw }); }}>
          <TextField label="New temporary password" autoComplete="off" value={pw} onChange={(x) => setPw(x.target.value)} error={fe.password} wrapperClassName="sm:w-72"
            hint="Signs them out everywhere; they must choose a new password." />
          <Button type="submit" variant="secondary" loading={reset.isPending} disabled={!pw} className="sm:mb-5">Reset password</Button>
        </form>
        {reset.isSuccess && <Alert tone="ok">Password reset and all sessions signed out.</Alert>}
        <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">{e.isActive ? 'Deactivating signs them out immediately and blocks sign-in. Their history stays in the activity log.' : 'This employee cannot sign in.'}</p>
          <Button variant={e.isActive ? 'danger' : 'secondary'} loading={active.isPending}
            onClick={() => { if (!e.isActive || confirm(`Deactivate ${e.name}? They will be signed out immediately.`)) active.mutate({ id: e.id, isActive: !e.isActive }); }}>
            {e.isActive ? 'Deactivate' : 'Re-activate'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
