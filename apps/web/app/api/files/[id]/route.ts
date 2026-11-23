import { isStaff } from '@kush/core';
import { prisma } from '@kush/db';
import { loadFile } from '@kush/api/server';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Serve stored files to signed-in staff (signature, product images, PDFs). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !isStaff(user)) return new Response('Not found', { status: 404 });
  const file = await loadFile(prisma, (await params).id);
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(file.body), {
    headers: {
      'Content-Type': file.asset.mimeType,
      'Cache-Control': 'private, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
