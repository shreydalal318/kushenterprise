import type { Metadata } from 'next';
import { Analytics } from '@/components/analytics/analytics';
import { requirePermission } from '@/lib/session';

export const metadata: Metadata = { title: 'Analytics' };
export default async function Page() { await requirePermission('VIEW_ANALYTICS'); return <Analytics />; }
