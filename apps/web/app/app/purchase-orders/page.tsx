import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PoList } from '@/components/purchasing/po-list';
import { requirePermission } from '@/lib/session';

export const metadata: Metadata = { title: 'Purchase orders' };
export default async function Page() { await requirePermission('CREATE_PURCHASE_ORDERS', 'MANAGE_STOCK'); return <Suspense><PoList /></Suspense>; }
