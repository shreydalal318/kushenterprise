import type { Metadata } from 'next';
import { Inbox } from '@/components/portal/account';
import { requireStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Notifications' };
export default async function Page() { await requireStaff(); return <Inbox />; }
