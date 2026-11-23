import { can, INVOICE_COPIES, type InvoiceCopy, type Permission } from '@kush/core';
import { prisma } from '@kush/db';
import { renderDocument, type DocKind } from '@kush/api/server';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACCESS: Record<DocKind, Permission[]> = {
  invoice: ['CREATE_TAX_INVOICE', 'VIEW_ORDERS', 'RECORD_PAYMENTS'],
  proforma: ['CREATE_PROFORMA', 'VIEW_ORDERS'],
  'credit-note': ['CREATE_TAX_INVOICE', 'RECORD_PAYMENTS'],
  'purchase-order': ['CREATE_PURCHASE_ORDERS'], // shows purchase rates
};

/** PDF of a tax invoice / proforma / credit note / purchase order. ?copies=ORIGINAL,DUPLICATE  ?download=1 */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!(kind in ACCESS)) return new Response('Not found', { status: 404 });
  const user = await getSessionUser();
  if (!user || user.mustChangePassword) return new Response('Sign in required', { status: 401 });
  const k = kind as DocKind;
  const url = new URL(req.url);
  const copies = (url.searchParams.get('copies') ?? 'ORIGINAL').split(',').filter((c): c is InvoiceCopy => (INVOICE_COPIES as readonly string[]).includes(c));
  try {
    const { pdf, filename, customerId } = await renderDocument(prisma, k, id, copies.length ? copies : ['ORIGINAL']);
    // Staff need the permission; a customer may only download their own documents.
    const allowed = user.role === 'CUSTOMER' ? user.customerId === customerId : ACCESS[k].some((p) => can(user, p));
    if (!allowed) return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${url.searchParams.get('download') ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    return new Response(/NOT_FOUND|not found/i.test(msg) ? 'Not found' : `Could not create the PDF: ${msg}`, { status: /NOT_FOUND|not found/i.test(msg) ? 404 : 500 });
  }
}
