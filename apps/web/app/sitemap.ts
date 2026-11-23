import type { MetadataRoute } from 'next';
import { publicApi, siteUrl } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const products = await (await publicApi()).website.productCodes();
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/products`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: 'monthly', priority: 0.6 },
    ...products.map((p) => ({ url: `${base}/products/${encodeURIComponent(p.code)}`, lastModified: p.updatedAt, changeFrequency: 'weekly' as const, priority: 0.7 })),
  ];
}
