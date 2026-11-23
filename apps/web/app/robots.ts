import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/public-api';

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/app', '/portal', '/api', '/login', '/change-password'] }], sitemap: `${siteUrl()}/sitemap.xml` };
}
