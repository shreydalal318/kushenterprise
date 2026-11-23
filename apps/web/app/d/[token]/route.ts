import { prisma } from '@kush/db';
import { renderDocument, renderStatement, verifyShareToken } from '@kush/api/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** A shared document link (sent on WhatsApp / email): signed, expires after 15 days, one PDF only. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const t = verifyShareToken((await params).token);
  if (!t) return new Response('This link has expired or is not valid. Please ask Kush Enterprise for a new one.', { status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  try {
    const { pdf, filename } = t.kind === 'statement' ? await renderStatement(prisma, t.id) : await renderDocument(prisma, t.kind, t.id, ['ORIGINAL']);
    return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
  } catch {
    return new Response('Document not found', { status: 404 });
  }
}
