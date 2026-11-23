import { isOwner } from '@kush/core';
import { prisma } from '@kush/db';
import { previewPriceImport } from '@kush/api/server';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Parse an uploaded price sheet and return a preview of the changes (owner only).
 * Nothing is saved here: the client confirms and calls the setCustomerPrices / setItems mutation.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword || !isOwner(user)) return Response.json({ error: 'Only the owner can import prices' }, { status: 403 });
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.headers.get('host')) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const customerId = url.searchParams.get('customerId');
  const priceListId = url.searchParams.get('priceListId');
  if (!customerId && !priceListId) return Response.json({ error: 'customerId or priceListId required' }, { status: 400 });
  const file = (await req.formData().catch(() => null))?.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'Choose an .xlsx file' }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: 'File must be under 5 MB' }, { status: 400 });
  const preview = await previewPriceImport(prisma, customerId ? { customerId } : { priceListId: priceListId! }, Buffer.from(await file.arrayBuffer()));
  return Response.json(preview);
}
