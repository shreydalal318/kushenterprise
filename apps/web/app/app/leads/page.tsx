import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Leads } from '@/components/leads/leads';
import { requirePermission } from '@/lib/session';

export const metadata: Metadata = { title: 'Leads' };
export default async function Page() { await requirePermission('MANAGE_CUSTOMERS'); return <Suspense><Leads /></Suspense>; }
