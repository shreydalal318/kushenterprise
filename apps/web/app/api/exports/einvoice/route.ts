import { TRPCError } from '@trpc/server';
import { istDateString } from '@kush/core';
import { getSessionUser, serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const iso = (v: string | null, d: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d);

/** e-invoice JSON for every B2B invoice / credit note in the period that has no IRN yet (bulk upload). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role === 'CUSTOMER') return new Response('Sign in required', { status: 401 });
  const u = new URL(req.url);
  const to = iso(u.searchParams.get('to'), istDateString());
  const from = iso(u.searchParams.get('from'), `${to.slice(0, 8)}01`);
  try {
    const r = await (await serverApi()).integrations.einvoiceBulk({ from, to });
    return new Response(JSON.stringify(r.documents, null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="einvoice-${from}-to-${to}.json"`, 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return new Response((e as Error).message, { status: e instanceof TRPCError && e.code === 'FORBIDDEN' ? 403 : 400 });
  }
}
