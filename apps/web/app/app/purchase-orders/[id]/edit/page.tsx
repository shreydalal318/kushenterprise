import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/card';
import { PoEditor } from '@/components/purchasing/po-editor';
import { requirePermission } from '@/lib/session';

export const metadata: Metadata = { title: 'Edit purchase order' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('CREATE_PURCHASE_ORDERS');
  return (<><PageHeader title="Edit purchase order" description="A draft can be changed until it is marked as sent." /><Suspense><PoEditor poId={(await params).id} /></Suspense></>);
}
