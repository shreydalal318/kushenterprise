import type { Metadata } from 'next';
import { Deliveries } from '@/components/deliveries/deliveries';
import { requireStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Deliveries' };
export default async function Page() { await requireStaff(); return <Deliveries />; }
