import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { createCaller, createContext } from '@kush/api/server';

/** tRPC caller for public pages (no session needed; the visitor's IP is passed for rate limits). */
export const publicApi = cache(async () => createCaller(await createContext({ headers: await headers() })));
export const siteUrl = () => (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
