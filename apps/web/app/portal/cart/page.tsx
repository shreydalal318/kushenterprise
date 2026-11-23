import type { Metadata } from 'next';
import { CartCheckout } from '@/components/portal/checkout';

export const metadata: Metadata = { title: 'Cart' };
export default function Page() { return <CartCheckout />; }
