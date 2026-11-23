import { isOwner } from '@kush/core';
import { prisma } from '@kush/db';
import { getSettings, logActivity, saveFile, sniffImageType } from '@kush/api/server';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 1024 * 1024; // 1 MB is plenty for a signature/stamp

/** Upload the signature / stamp image printed on invoices (owner only). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !isOwner(user) || user.mustChangePassword) return Response.json({ error: 'Owner only' }, { status: 403 });
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.headers.get('host')) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'Choose an image file' }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: 'Image must be under 1 MB' }, { status: 400 });
  const body = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageType(body);
  if (!mime) return Response.json({ error: 'Use a PNG, JPG or WebP image' }, { status: 400 });

  const asset = await saveFile(prisma, body, mime, 'signature');
  await getSettings(prisma); // ensures the settings row exists
  await prisma.companySettings.update({ where: { id: 'company' }, data: { signatureFileId: asset.id } });
  await logActivity(prisma, { actorId: user.id, action: 'settings.update', entityType: 'CompanySettings', entityId: 'company', summary: 'Signature / stamp image updated', after: { signatureFileId: asset.id } });
  return Response.json({ fileId: asset.id });
}
