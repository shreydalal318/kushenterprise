import { can } from '@kush/core';
import { prisma } from '@kush/db';
import { saveFile, sniffImageType } from '@kush/api/server';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 2 * 1024 * 1024;

/** Upload one product image (MANAGE_PRODUCTS). Attach it with products.setImages. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword || !can(user, 'MANAGE_PRODUCTS')) return Response.json({ error: 'Not allowed' }, { status: 403 });
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.headers.get('host')) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const file = (await req.formData().catch(() => null))?.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'Choose an image' }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: 'Each image must be under 2 MB' }, { status: 400 });
  const body = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageType(body);
  if (!mime) return Response.json({ error: 'Use PNG, JPG or WebP' }, { status: 400 });
  const asset = await saveFile(prisma, body, mime, 'product-image');
  return Response.json({ fileId: asset.id });
}
