import { can } from '@kush/core';
import { prisma } from '@kush/db';
import { renderStatement } from '@kush/api/server';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const day = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** Statement of account PDF. Customers get only their own; staff need payments or customer access. */
export async function GET(req: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const user = await getSessionUser();
  if (!user || user.mustChangePassword) return new Response('Sign in required', { status: 401 });
  const allowed = user.role === 'CUSTOMER' ? user.customerId === customerId : can(user, 'RECORD_PAYMENTS') || can(user, 'MANAGE_CUSTOMERS');
  if (!allowed) return new Response('Not found', { status: 404 });
  const url = new URL(req.url);
  try {
    const { pdf, filename } = await renderStatement(prisma, customerId, { from: day(url.searchParams.get('from')), to: day(url.searchParams.get('to')) });
    return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${url.searchParams.get('download') ? 'attachment' : 'inline'}; filename="${filename}"`, 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return new Response(/NOT_FOUND/.test((e as Error).message) ? 'Not found' : 'Could not create the statement', { status: /NOT_FOUND/.test((e as Error).message) ? 404 : 500 });
  }
}
