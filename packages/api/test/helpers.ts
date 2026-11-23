import { randomBytes } from 'node:crypto';
import { prisma, type Role } from '@kush/db';
import { hashPassword } from '../src/auth/password';
import { createSession } from '../src/auth/session';
import { createCaller } from '../src/root';
import { createContext } from '../src/trpc';

export const PASSWORD = 'TestPass2026';

/** Unique Indian mobile per call so re-runs never collide. */
export const randomMobile = () => `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
export const tag = () => randomBytes(4).toString('hex');
let hashed: Promise<string> | undefined;

export async function makeUser(role: Role, extra: Partial<{ permissions: string[]; mobile: string; mustChangePassword: boolean; customerId: string }> = {}) {
  hashed ??= hashPassword(PASSWORD);
  const tag = randomBytes(4).toString('hex');
  return prisma.user.create({
    data: {
      role,
      name: `${role.toLowerCase()} ${tag}`,
      email: `${tag}@test.local`,
      mobile: extra.mobile,
      passwordHash: await hashed,
      permissions: (extra.permissions ?? []) as never,
      mustChangePassword: extra.mustChangePassword ?? false,
      customerId: extra.customerId,
    },
  });
}

/** A tRPC caller authenticated as `userId` (or anonymous), plus the response headers it wrote. */
export async function callerFor(userId?: string, client: 'web' | 'mobile' = 'web') {
  const headers = new Headers({ 'user-agent': 'vitest', 'x-forwarded-for': '10.0.0.1' });
  let token: string | undefined;
  if (userId) {
    token = (await createSession(prisma, userId, { client })).token;
    headers.set('cookie', `ke_session=${token}`);
  }
  const resHeaders = new Headers();
  const ctx = await createContext({ headers, resHeaders });
  return { api: createCaller(ctx), resHeaders, token };
}

export const anon = () => callerFor();

export async function callerWithHeaders(h: Record<string, string>) {
  const resHeaders = new Headers();
  const ctx = await createContext({ headers: new Headers(h), resHeaders });
  return { api: createCaller(ctx), resHeaders };
}

export async function ensureCustomer() {
  await prisma.state.upsert({ where: { code: '24' }, create: { code: '24', name: 'Gujarat', shortCode: 'GJ' }, update: {} });
  return prisma.customer.create({
    data: { code: `C-${randomBytes(3).toString('hex')}`, type: 'DOCTOR', name: 'Dr. Test', stateCode: '24' },
  });
}
