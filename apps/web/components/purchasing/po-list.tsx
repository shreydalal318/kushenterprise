'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { formatDate } from '@kush/core';
import { Badge, Card, PageHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { EmptyRow, LoadingRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { rupees } from '@/lib/format';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { PoBadge } from './po-status';

const TABS = [['OPEN', 'Open'], ['DRAFT', 'Drafts'], ['RECEIVED', 'Received'], ['', 'All']] as const;
const sel = 'h-10 rounded-lg border border-line bg-white px-3 text-sm';

export function PoList() {
  const { can } = useMe();
  const [q, setQ] = useState('');
  const params = useSearchParams();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>(params.get('supplier') ? '' : 'OPEN');
  const [supplierId, setSupplierId] = useState(params.get('supplier') ?? '');
  const suppliers = trpc.suppliers.list.useQuery();
  const list = trpc.purchaseOrders.list.useQuery({ status: tab || undefined, q: q || undefined, supplierId: supplierId || undefined });
  return (
    <>
      <PageHeader title="Purchase orders" description="Open orders with suppliers. Anything not yet received stays open until it arrives or the PO is short-closed."
        actions={can('CREATE_PURCHASE_ORDERS') && <LinkButton href="/app/purchase-orders/new"><Plus className="size-4" aria-hidden /> New purchase order</LinkButton>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex rounded-lg bg-white p-0.5 ring-1 ring-line">
          {TABS.map(([k, l]) => <button key={k || 'all'} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('h-9 rounded-md px-3 text-sm', tab === k ? 'bg-aqua-100 font-semibold text-navy' : 'text-muted')}>{l}</button>)}
        </div>
        <label className="relative"><span className="sr-only">Search</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="PO no. or supplier" className={`${sel} w-56 pl-9`} /></label>
        <select aria-label="Supplier" className={sel} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">All suppliers</option>{suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <Card className="overflow-hidden">
        <Table minWidth={820}>
          <THead><tr><Th>PO</Th><Th>Supplier</Th><Th>Status</Th><Th>Expected</Th><Th className="text-right">Received</Th><Th className="text-right">Value</Th></tr></THead>
          <tbody>
            {!list.data && <LoadingRow cols={6} />}{list.data?.length === 0 && <EmptyRow cols={6}>No purchase orders here.</EmptyRow>}
            {list.data?.map((p) => (
              <Tr key={p.id} className="hover:bg-aqua-50/60">
                <Td><Link href={`/app/purchase-orders/${p.id}`} className="font-mono text-sm font-medium text-navy hover:underline">{p.number}</Link><div className="text-xs text-muted">{formatDate(p.date)}</div></Td>
                <Td>{p.supplier.name}</Td>
                <Td><PoBadge status={p.status} />{p.late && <Badge tone="danger" className="ml-1">Late</Badge>}</Td>
                <Td className="text-sm">{p.expectedDate ? formatDate(p.expectedDate) : '—'}</Td>
                <Td className="num">{p.received} / {p.ordered}</Td>
                <Td className="num">{p.total == null ? '—' : rupees(p.total)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
