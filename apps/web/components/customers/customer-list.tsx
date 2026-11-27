'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { Badge, Card, PageHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyRow, LoadingRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { trpc } from '@/lib/trpc';
import { TYPE_LABEL, type CustomerType } from './labels';

const select = 'h-10 rounded-lg border border-line bg-white px-3 text-sm';

export function CustomerList() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [assigned, setAssigned] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const staff = trpc.customers.staffOptions.useQuery();
  const list = trpc.customers.list.useQuery({ q: q || undefined, type: (type || undefined) as CustomerType | undefined, assignedEmployeeId: assigned || undefined, includeInactive });
  return (
    <>
      <PageHeader title="Customers" description="Doctors, hospitals and clinics, with their addresses, logins and prices."
        actions={<LinkButton href="/app/customers/new"><Plus className="size-4" aria-hidden /> New customer</LinkButton>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative flex-1 sm:max-w-xs">
          <span className="sr-only">Search customers</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, code, mobile or GSTIN" className={`${select} w-full pl-9`} />
        </label>
        <select aria-label="Type" className={select} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select aria-label="Assigned employee" className={select} value={assigned} onChange={(e) => setAssigned(e.target.value)}>
          <option value="">Anyone assigned</option>
          {staff.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className="flex items-center gap-2 px-1 text-sm text-muted"><input type="checkbox" className="accent-teal-700" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} /> Show inactive</label>
      </div>
      <Card className="overflow-hidden">
        <Table minWidth={820}>
          <THead><tr><Th>Customer</Th><Th>Type</Th><Th>City</Th><Th>Assigned to</Th><Th>Pricing</Th><Th className="text-right">Logins</Th></tr></THead>
          <tbody>
            {!list.data && <LoadingRow cols={6} />}{list.data?.length === 0 && <EmptyRow cols={6}>No customers match.</EmptyRow>}
            {list.data?.map((c) => (
              <Tr key={c.id} className="hover:bg-aqua-50/60">
                <Td>
                  <Link href={`/app/customers/${c.id}`} className="font-medium text-navy hover:underline">{c.name}</Link>
                  <div className="text-xs text-muted">{c.code}{c.parent ? ` · at ${c.parent.name}` : ''}{c._count.doctors ? ` · ${c._count.doctors} doctor(s)` : ''}{!c.isActive && <Badge tone="danger" className="ml-2">Inactive</Badge>}</div>
                </Td>
                <Td><Badge tone={c.type === 'DOCTOR' ? 'neutral' : 'teal'}>{TYPE_LABEL[c.type]}</Badge></Td>
                <Td>{c.city ?? '—'}</Td>
                <Td>{c.assignedEmployee?.name ?? <span className="text-muted">—</span>}</Td>
                <Td className="text-sm">{c.priceList?.name ?? <span className="text-muted">Default rates</span>}{c._count.customPrices ? <div className="text-xs text-muted">{c._count.customPrices} special price(s)</div> : null}</Td>
                <Td className="num">{c._count.logins}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
