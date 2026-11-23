import type { Metadata } from 'next';
import { MyOrders } from '@/components/portal/orders';

export const metadata: Metadata = { title: 'My orders' };
export default function Page() { return <MyOrders />; }
