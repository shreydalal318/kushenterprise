import type { Metadata } from 'next';
import { MyInvoices } from '@/components/portal/account';

export const metadata: Metadata = { title: 'Invoices' };
export default function Page() { return <MyInvoices />; }
