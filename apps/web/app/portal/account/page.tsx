import type { Metadata } from 'next';
import { MyAccount } from '@/components/portal/account';
import { requireCustomer } from '@/lib/session';

export const metadata: Metadata = { title: 'Account' };
export default async function Page() { const u = await requireCustomer(); return <MyAccount customerId={u.customerId!} />; }
