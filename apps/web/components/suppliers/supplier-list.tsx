'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { stateByCode } from '@kush/core';
import { Badge, Card, PageHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyRow, LoadingRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';

export function SupplierList() {
  const { can } = useMe();
  const [q, setQ] = useState('');
  const list = trpc.suppliers.list.useQuery({ q: q || undefined, includeInactive: true });
  return (
    <>
      <PageHeader title="Suppliers" description="Companies you buy from, and the products each one supplies."
        actions={can('CREATE_PURCHASE_ORDERS') && <LinkButton href="/app/suppliers/new"><Plus className="size-4" aria-hidden /> New supplier</LinkButton>} />
      <label className="relative mb-4 block sm:max-w-xs">
        <span className="sr-only">Search suppliers</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, code or GSTIN" className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm" />
      </label>
      <Card className="overflow-hidden">
        <Table minWidth={720}>
          <THead><tr><Th>Supplier</Th><Th>State</Th><Th>GSTIN</Th><Th>Contact</Th><Th className="text-right">Terms</Th><Th className="text-right">Products</Th></tr></THead>
          <tbody>
            {!list.data && <LoadingRow cols={6} />}{list.data?.length === 0 && <EmptyRow cols={6}>No suppliers yet.</EmptyRow>}
            {list.data?.map((s) => (
              <Tr key={s.id} className="hover:bg-aqua-50/60">
                <Td><Link href={`/app/suppliers/${s.id}`} className="font-medium text-navy hover:underline">{s.name}</Link><div className="text-xs text-muted">{s.code}{!s.isActive && <Badge tone="danger" className="ml-2">Inactive</Badge>}</div></Td>
                <Td>{stateByCode(s.stateCode)?.name ?? s.stateCode}</Td>
                <Td className="font-mono text-xs">{s.gstin ?? '—'}</Td>
                <Td className="text-sm">{s.contactPerson ?? ''}<div className="text-xs text-muted">{s.mobile ?? s.email ?? ''}</div></Td>
                <Td className="num">{s.paymentTermsDays} days</Td>
                <Td className="num">{s._count.products}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
