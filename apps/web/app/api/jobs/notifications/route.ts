import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@kush/db';
import { deliverQueued } from '@kush/api/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Deliver queued push / SMS / WhatsApp / email notifications. Normally they go out right after each
 * event; a scheduler (cron) can also call this every few minutes as a safety net:
 *   curl -X POST -H "x-job-secret: $JOB_SECRET" https://<host>/api/jobs/notifications
 */
export async function POST(req: Request) {
  const secret = process.env.JOB_SECRET ?? '';
  const given = req.headers.get('x-job-secret') ?? '';
  if (secret.length < 16 || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return new Response('Forbidden', { status: 403 });
  return Response.json(await deliverQueued(prisma, 500));
}
