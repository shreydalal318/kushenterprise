'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { formatDateTime, stateByCode } from '@kush/core';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, SelectField, TextField } from '@/components/ui/field';
import { LinkButton } from '@/components/ui/link-button';
import { errorMessage, fieldErrors, subErrors } from '@/lib/errors';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { AddressFields, emptyAddress, type AddressValue } from './address-fields';
import { CustomerForm } from './customer-form';
import { TYPE_LABEL } from './labels';

type Customer = RouterOutputs['customers']['get'];

export function CustomerDetail({ id }: { id: string }) {
  const utils = trpc.useUtils();
  const q = trpc.customers.get.useQuery({ id });
  const active = trpc.customers.setActive.useMutation({ onSuccess: () => Promise.all([utils.customers.get.invalidate({ id }), utils.customers.list.invalidate()]) });
  if (q.error) return <Alert>{errorMessage(q.error)}</Alert>;
  if (!q.data) return <p className="text-sm text-muted">Loading…</p>;
  const c = q.data;
  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/customers" className="flex w-fit items-center gap-1 text-sm text-teal-700 hover:underline"><ArrowLeft className="size-4" aria-hidden /> All customers</Link>
      <PageHeader
        title={c.name}
        description={<span className="flex flex-wrap items-center gap-2"><span>{c.code}</span><Badge tone="teal">{TYPE_LABEL[c.type]}</Badge>{c.parent && <>at <Link className="text-teal-700 hover:underline" href={`/app/customers/${c.parent.id}`}>{c.parent.name}</Link></>}{!c.isActive && <Badge tone="danger">Inactive</Badge>}</span>}
        actions={<Button variant={c.isActive ? 'danger' : 'secondary'} loading={active.isPending} onClick={() => { if (!c.isActive || confirm(`Deactivate ${c.name}? Their logins will be disabled.`)) active.mutate({ id, isActive: !c.isActive }); }}>{c.isActive ? 'Deactivate' : 'Activate'}</Button>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <CustomerForm key={c.updatedAt.toString()} customer={c} />
          <AddressesCard c={c} />
        </div>
        <div className="flex flex-col gap-6">
          <PricingCard c={c} />
          {c.type !== 'DOCTOR' && <DoctorsCard c={c} />}
          <LoginsCard c={c} />
        </div>
      </div>
    </div>
  );
}

function AddressesCard({ c }: { c: Customer }) {
  const utils = trpc.useUtils();
  const refresh = () => utils.customers.get.invalidate({ id: c.id });
  const [edit, setEdit] = useState<{ id?: string; kind: 'BILLING' | 'SHIPPING'; isDefault: boolean; value: AddressValue } | null>(null);
  const add = trpc.customers.addAddress.useMutation({ onSuccess: () => { void refresh(); setEdit(null); } });
  const upd = trpc.customers.updateAddress.useMutation({ onSuccess: () => { void refresh(); setEdit(null); } });
  const del = trpc.customers.removeAddress.useMutation({ onSuccess: refresh });
  const m = edit?.id ? upd : add;
  const fe = fieldErrors(m.error);
  const open = (kind: 'BILLING' | 'SHIPPING') => setEdit({ kind, isDefault: false, value: emptyAddress(c.stateCode) });
  return (
    <Card>
      <CardHeader title="Addresses" actions={<div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => open('SHIPPING')}><Plus className="size-4" aria-hidden /> Shipping</Button><Button size="sm" variant="secondary" onClick={() => open('BILLING')}><Plus className="size-4" aria-hidden /> Billing</Button></div>} />
      <CardBody>
        {del.error && <div className="mb-3"><Alert>{errorMessage(del.error)}</Alert></div>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {c.addresses.map((a) => (
            <li key={a.id} className="rounded-lg border border-line p-3 text-sm">
              <div className="mb-1 flex items-center gap-2">
                <Badge tone={a.kind === 'BILLING' ? 'navy' : 'teal'}>{a.kind === 'BILLING' ? 'Billing' : 'Shipping'}</Badge>
                {a.isDefault && <Badge tone="ok">Default</Badge>}
                {a.label && <span className="font-medium">{a.label}</span>}
                <span className="ml-auto flex gap-1">
                  <button aria-label="Edit address" className="rounded p-1 text-muted hover:bg-aqua-50 hover:text-ink" onClick={() => setEdit({ id: a.id, kind: a.kind, isDefault: a.isDefault, value: { label: a.label ?? '', line1: a.line1, line2: a.line2 ?? '', city: a.city, pincode: a.pincode, stateCode: a.stateCode, gstin: a.gstin ?? '' } })}><Pencil className="size-4" /></button>
                  <button aria-label="Remove address" className="rounded p-1 text-muted hover:bg-danger-50 hover:text-danger" onClick={() => { if (confirm('Remove this address?')) del.mutate({ id: a.id }); }}><Trash2 className="size-4" /></button>
                </span>
              </div>
              <p>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</p>
              <p className="text-muted">{a.city} – {a.pincode}, {stateByCode(a.stateCode)?.name}{a.gstin ? ` · GSTIN ${a.gstin}` : ''}</p>
            </li>
          ))}
        </ul>
      </CardBody>
      {edit && (
        <Dialog open onClose={() => setEdit(null)} title={`${edit.id ? 'Edit' : 'Add'} ${edit.kind === 'BILLING' ? 'billing' : 'shipping'} address`} size="lg"
          footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={m.isPending} onClick={() => edit.id ? upd.mutate({ id: edit.id, isDefault: edit.isDefault, address: edit.value }) : add.mutate({ customerId: c.id, kind: edit.kind, isDefault: edit.isDefault, address: edit.value })}>Save address</Button></>}>
          <AddressFields value={edit.value} onChange={(value) => setEdit({ ...edit, value })} errors={subErrors(fe, 'address')} showLabel showGstin />
          <Checkbox className="mt-3" label="Make this the default" checked={edit.isDefault} onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })} />
          {m.error && !Object.keys(fe).length && <p className="mt-2 text-sm text-danger">{errorMessage(m.error)}</p>}
        </Dialog>
      )}
    </Card>
  );
}

function PricingCard({ c }: { c: Customer }) {
  const utils = trpc.useUtils();
  const { isOwner, can } = useMe();
  const lists = trpc.priceLists.list.useQuery(undefined, { enabled: can('VIEW_PRICES_MARGINS') });
  const assign = trpc.customers.setPriceList.useMutation({ onSuccess: () => utils.customers.get.invalidate({ id: c.id }) });
  return (
    <Card>
      <CardHeader title="Pricing" description="Special price → price list → default rate." />
      <CardBody className="flex flex-col gap-3 text-sm">
        {isOwner ? (
          <SelectField label="Price list" value={c.priceListId ?? ''} onChange={(e) => assign.mutate({ customerId: c.id, priceListId: e.target.value || null })}>
            <option value="">— None (default rates) —</option>
            {lists.data?.map((l) => <option key={l.id} value={l.id}>{l.name}{l.isActive ? '' : ' (inactive)'}</option>)}
          </SelectField>
        ) : (
          <p>Price list: <strong>{c.priceList?.name ?? 'None (default rates)'}</strong></p>
        )}
        <p className="text-muted">{c._count.customPrices} special price(s) set for this customer.</p>
        {can('VIEW_PRICES_MARGINS') && <LinkButton variant="secondary" href={`/app/pricing?customer=${c.id}`}>Open in pricing workbench</LinkButton>}
        <LinkButton variant="secondary" href={`/app/ledger/${c.id}`}>Account statement (ledger)</LinkButton>
        {assign.error && <p className="text-danger">{errorMessage(assign.error)}</p>}
      </CardBody>
    </Card>
  );
}

function DoctorsCard({ c }: { c: Customer }) {
  return (
    <Card>
      <CardHeader title={`Doctors (${c.doctors.length})`} description="Orders can be placed for a doctor at this account." actions={<LinkButton variant="secondary" href={`/app/customers/new?parentId=${c.id}&type=DOCTOR`} className="h-8 px-3"><Plus className="size-4" aria-hidden /> Add</LinkButton>} />
      <CardBody>
        {c.doctors.length === 0 ? <p className="text-sm text-muted">No doctors linked.</p> : (
          <ul className="divide-y divide-line text-sm">
            {c.doctors.map((d) => <li key={d.id} className="flex justify-between py-2"><Link href={`/app/customers/${d.id}`} className="text-teal-700 hover:underline">{d.name}</Link><span className="text-muted">{d.mobile ?? ''}</span></li>)}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function LoginsCard({ c }: { c: Customer }) {
  const utils = trpc.useUtils();
  const refresh = () => utils.customers.get.invalidate({ id: c.id });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: c.contactPerson ?? c.name, mobile: c.mobile ?? '', email: c.email ?? '' });
  const create = trpc.customers.createLogin.useMutation({ onSuccess: () => { void refresh(); setOpen(false); } });
  const toggle = trpc.customers.setLoginActive.useMutation({ onSuccess: refresh });
  const invite = trpc.customers.sendLoginInvite.useMutation();
  const fe = fieldErrors(create.error);
  return (
    <Card>
      <CardHeader title="App & portal logins" description="Customers sign in with a one-time code sent to this mobile." actions={c.isActive && <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> Add</Button>} />
      <CardBody className="flex flex-col gap-2">
        {c.logins.length === 0 && <p className="text-sm text-muted">No logins yet.</p>}
        <ul className="divide-y divide-line">
          {c.logins.map((l) => (
            <li key={l.id} className="flex flex-col gap-1 py-2 text-sm">
              <div className="flex items-center gap-2"><span className="font-medium">{l.name}</span>{l.isActive ? <Badge tone="ok">Active</Badge> : <Badge>Disabled</Badge>}</div>
              <div className="text-muted">{l.mobile}{l.lastLoginAt ? ` · last sign-in ${formatDateTime(l.lastLoginAt)}` : ' · never signed in'}</div>
              <div className="flex gap-3">
                {l.isActive && <button className="flex items-center gap-1 text-teal-700 hover:underline" onClick={() => invite.mutate({ userId: l.id, appUrl: typeof window === 'undefined' ? undefined : `${window.location.origin}/login` })}><Send className="size-3.5" aria-hidden /> Send sign-in SMS</button>}
                <button className="text-muted hover:text-ink" onClick={() => toggle.mutate({ userId: l.id, isActive: !l.isActive })}>{l.isActive ? 'Disable' : 'Enable'}</button>
              </div>
            </li>
          ))}
        </ul>
        {invite.isSuccess && <Alert tone="ok">Sign-in instructions sent{invite.data.channel === 'console' ? ' (development: printed to the server log)' : ''}.</Alert>}
        {(invite.error || toggle.error) && <Alert>{errorMessage(invite.error ?? toggle.error)}</Alert>}
      </CardBody>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a login" size="sm"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.isPending} onClick={() => create.mutate({ customerId: c.id, ...v })}>Create login</Button></>}>
        <div className="flex flex-col gap-4">
          <TextField label="Person's name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={fe.name} />
          <TextField label="Mobile (for OTP)" type="tel" value={v.mobile} onChange={(e) => setV({ ...v, mobile: e.target.value })} error={fe.mobile} />
          <TextField label="Email (optional)" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} error={fe.email} />
          {create.error && !Object.keys(fe).length && <p className="text-sm text-danger">{errorMessage(create.error)}</p>}
        </div>
      </Dialog>
    </Card>
  );
}

