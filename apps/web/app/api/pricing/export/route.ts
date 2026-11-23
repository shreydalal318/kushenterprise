import { can } from '@kush/core';
import { prisma } from '@kush/db';
import { exportPriceSheet, logActivity } from '@kush/api/server';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Download a customer's special prices or a price list as .xlsx (View prices / margins). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword || !can(user, 'VIEW_PRICES_MARGINS')) return new Response('Not allowed', { status: 403 });
  const url = new URL(req.url);
  const customerId = url.searchParams.get('customerId');
  const priceListId = url.searchParams.get('priceListId');
  if (!customerId && !priceListId) return new Response('customerId or priceListId required', { status: 400 });
  try {
    const target = customerId ? { customerId } : { priceListId: priceListId! };
    const { filename, body } = await exportPriceSheet(prisma, target);
    await logActivity(prisma, { actorId: user.id, action: 'price.export', entityType: customerId ? 'Customer' : 'PriceList', entityId: (customerId ?? priceListId)!, summary: `Exported ${filename}` });
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return new Response((e as Error).message, { status: 404 });
  }
}
