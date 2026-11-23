import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../env';

/** Documents that can be shared by a link (WhatsApp / email) without signing in. */
export const SHARE_KINDS = ['invoice', 'proforma', 'credit-note', 'purchase-order', 'statement'] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

const sign = (data: string) => createHmac('sha256', env.authSecret).update(`share:${data}`).digest('base64url').slice(0, 32);

/** A signed, expiring link token (default 15 days). Anyone with the link can download that one PDF until it expires. */
export function shareToken(kind: ShareKind, id: string, days = 15) {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const data = `${kind}.${id}.${exp.toString(36)}`;
  return `${Buffer.from(data).toString('base64url')}.${sign(data)}`;
}

export function verifyShareToken(token: string): { kind: ShareKind; id: string } | null {
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  const data = Buffer.from(b64, 'base64url').toString();
  const good = sign(data);
  if (sig.length !== good.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  const [kind, id, exp36] = data.split('.');
  if (!kind || !id || !exp36 || !(SHARE_KINDS as readonly string[]).includes(kind)) return null;
  if (parseInt(exp36, 36) * 1000 < Date.now()) return null;
  return { kind: kind as ShareKind, id };
}

export const absoluteUrl = (path: string) => `${(process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')}${path}`;
export const shareUrl = (kind: ShareKind, id: string, days?: number) => absoluteUrl(`/d/${shareToken(kind, id, days)}`);
