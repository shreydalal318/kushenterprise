import type { Metadata } from 'next';
import { Catalogue } from '@/components/portal/catalogue';

export const metadata: Metadata = { title: 'Catalogue' };
export default function Page() { return <Catalogue />; }
