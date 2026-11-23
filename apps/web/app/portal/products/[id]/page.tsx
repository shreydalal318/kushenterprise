import type { Metadata } from 'next';
import { ProductDetail } from '@/components/portal/catalogue';

export const metadata: Metadata = { title: 'Product' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <ProductDetail id={(await params).id} />; }
