import type { Metadata } from 'next';
import { Inbox } from '@/components/portal/account';

export const metadata: Metadata = { title: 'Notifications' };
export default function Page() { return <Inbox />; }
