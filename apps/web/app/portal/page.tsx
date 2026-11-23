import type { Metadata } from 'next';
import { PortalHome } from '@/components/portal/home';

export const metadata: Metadata = { title: 'My account' };
export default function Page() { return <PortalHome />; }
