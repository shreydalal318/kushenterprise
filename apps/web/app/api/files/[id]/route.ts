import { isStaff } from '@kush/core';
import { prisma } from '@kush/db';
import { loadFile } from '@kush/api/server';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Product images are public (catalogue / website); everything else is staff-only.
const PUBLIC_PURPOSES = new Set(['product-image']);

/** Serve stored files (signature, product images, PDFs). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const meta = await prisma.fileAsset.findUnique({ where: { id }, select: { purpose: true } });
  if (!meta) return new Response('Not found', { status: 404 });
  if (!PUBLIC_PURPOSES.has(meta.purpose)) {
    const user = await getSessionUser();
    if (!user || !isStaff(user)) return new Response('Not found', { status: 404 });
  }
  const file = await loadFile(prisma, id);
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(file.body), {
    headers: {
      'Content-Type': file.asset.mimeType,
      'Cache-Control': PUBLIC_PURPOSES.has(meta.purpose) ? 'public, max-age=86400' : 'private, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
