'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Card, PageHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/field';
import { EmptyRow, LoadingRow, Table, Td, Th, THead, Tr } from '@/components/ui/table';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { trpc } from '@/lib/trpc';
import { useMe } from '@/lib/use-me';
import { PricingTabs } from './pricing-tabs';

export function PriceListsScreen() {
  const router = useRouter();
  const { isOwner } = useMe();
  const lists = trpc.priceLists.list.useQuery();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: '', description: '' });
  const create = trpc.priceLists.create.useMutation({ onSuccess: (l) => router.push(`/app/pricing/lists/${l.id}`) });
  const fe = fieldErrors(create.error);
  return (
    <>
      <PageHeader title="Pricing" description="A price list (e.g. “Govt hospitals”) sets rates for every customer it is assigned to." />
      <PricingTabs active="lists" />
      <Card className="overflow-hidden">
        <div className="flex justify-end border-b border-line px-5 py-3">{isOwner && <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> New price list</Button>}</div>
        <Table minWidth={560}>
          <THead><tr><Th>Price list</Th><Th className="text-right">Products</Th><Th className="text-right">Customers</Th><Th>Status</Th></tr></THead>
          <tbody>
            {!lists.data && <LoadingRow cols={4} error={lists.error} />}{lists.data?.length === 0 && <EmptyRow cols={4}>No price lists yet.</EmptyRow>}
            {lists.data?.map((l) => (
              <Tr key={l.id} className="hover:bg-aqua-50/60">
                <Td><Link href={`/app/pricing/lists/${l.id}`} className="font-medium text-navy hover:underline">{l.name}</Link>{l.description && <div className="text-xs text-muted">{l.description}</div>}</Td>
                <Td className="num">{l._count.items}</Td>
                <Td className="num">{l._count.customers}</Td>
                <Td>{l.isActive ? <Badge tone="ok">Active</Badge> : <Badge>Inactive</Badge>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Dialog open={open} onClose={() => setOpen(false)} title="New price list" size="sm"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.isPending} onClick={() => create.mutate(v)}>Create</Button></>}>
        <div className="flex flex-col gap-4">
          <TextField label="Name" placeholder="Govt hospitals" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={fe.name} autoFocus />
          <TextField label="Description (optional)" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          {create.error && !Object.keys(fe).length && <p className="text-sm text-danger">{errorMessage(create.error)}</p>}
        </div>
      </Dialog>
    </>
  );
}
