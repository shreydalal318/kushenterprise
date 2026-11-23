import { can, istDateString } from '@kush/core';
import { prisma } from '@kush/db';
import { tallyMastersXml, tallyVouchersXml } from '@kush/api/server';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const iso = (v: string | null, d: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d);

/** GET /api/exports/tally?type=vouchers|masters&from=&to=&sales=1&credit=1&receipts=1 → Tally XML */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role === 'CUSTOMER' || user.mustChangePassword) return new Response('Sign in required', { status: 401 });
  if (!can(user, 'VIEW_ANALYTICS')) return new Response('Forbidden', { status: 403 });
  const u = new URL(req.url);
  const today = istDateString();
  const to = iso(u.searchParams.get('to'), today);
  const from = iso(u.searchParams.get('from'), `${to.slice(0, 8)}01`);
  const type = u.searchParams.get('type') === 'masters' ? 'masters' : 'vouchers';
  try {
    const xml = type === 'masters' ? await tallyMastersXml(prisma, { from, to })
      : (await tallyVouchersXml(prisma, { from, to }, { sales: u.searchParams.get('sales') !== '0', creditNotes: u.searchParams.get('credit') !== '0', receipts: u.searchParams.get('receipts') !== '0' })).xml;
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="tally-${type}-${from}-to-${to}.xml"`, 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return new Response((e as Error).message, { status: 422 });
  }
}
