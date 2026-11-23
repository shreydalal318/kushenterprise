import type { Db, User } from '@kush/db';
import { AUTH, env } from '../env';
import { newSessionToken, sha256 } from './tokens';

export type SessionUser = Pick<
  User,
  'id' | 'role' | 'name' | 'email' | 'mobile' | 'permissions' | 'isActive' | 'customerId' | 'mustChangePassword'
>;

export interface SessionInfo {
  sessionId: string;
  user: SessionUser;
}

const userSelect = {
  id: true, role: true, name: true, email: true, mobile: true, permissions: true,
  isActive: true, customerId: true, mustChangePassword: true,
} as const;

export async function createSession(
  db: Db,
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null; client?: 'web' | 'mobile' },
): Promise<{ token: string; expiresAt: Date }> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + AUTH.sessionDays * 86_400_000);
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      client: meta.client ?? 'web',
      expiresAt,
    },
  });
  return { token, expiresAt };
}

/** Resolve a raw session token to its user; slides expiry forward at most once a day. */
export async function validateSessionToken(db: Db, token: string | null | undefined): Promise<SessionInfo | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: { id: true, expiresAt: true, revokedAt: true, lastUsedAt: true, user: { select: userSelect } },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.isActive) return null;

  if (Date.now() - session.lastUsedAt.getTime() > AUTH.sessionRefreshMs) {
    await db.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date(), expiresAt: new Date(Date.now() + AUTH.sessionDays * 86_400_000) },
    });
  }
  return { sessionId: session.id, user: session.user };
}

export const revokeSession = (db: Db, sessionId: string) =>
  db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });

export const revokeAllSessions = (db: Db, userId: string, exceptSessionId?: string) =>
  db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });

export function sessionCookie(token: string, expiresAt: Date): string {
  return [
    `${AUTH.sessionCookie}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
    env.cookieSecure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export const clearSessionCookie = () =>
  `${AUTH.sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${env.cookieSecure ? '; Secure' : ''}`;

/** Extract the session token from a Cookie header or an `Authorization: Bearer` header (mobile). */
export function tokenFromHeaders(headers: Headers): string | null {
  const auth = headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  const cookie = headers.get('cookie');
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === AUTH.sessionCookie) return decodeURIComponent(v.join('='));
  }
  return null;
}
