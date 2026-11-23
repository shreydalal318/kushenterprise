import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH, createCaller, createContext, validateSessionToken, type SessionUser } from '@kush/api/server';
import { prisma } from '@kush/db';
import { isOwner, isStaff } from '@kush/core';

/** The signed-in user for this request (deduplicated per render). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(AUTH.sessionCookie)?.value;
  return (await validateSessionToken(prisma, token))?.user ?? null;
});

/** Server-side tRPC caller that acts as the current user (same checks as the HTTP API). */
export async function serverApi() {
  return createCaller(await createContext({ headers: await headers() }));
}

export const homeFor = (u: SessionUser) => (u.mustChangePassword ? '/change-password' : u.role === 'CUSTOMER' ? '/portal' : '/app');

export async function requireStaff(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect('/login?next=/app');
  if (u.mustChangePassword) redirect('/change-password');
  if (!isStaff(u)) redirect('/portal');
  return u;
}

export async function requireOwner(): Promise<SessionUser> {
  const u = await requireStaff();
  if (!isOwner(u)) redirect('/app?denied=1');
  return u;
}

export async function requireCustomer(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect('/login?next=/portal');
  if (u.mustChangePassword) redirect('/change-password');
  if (u.role !== 'CUSTOMER') redirect('/app');
  return u;
}

/** Page guard for a permission-gated screen (owner passes automatically). */
export async function requirePermission(...anyOf: import('@kush/core').Permission[]): Promise<SessionUser> {
  const { can } = await import('@kush/core');
  const u = await requireStaff();
  if (!anyOf.some((p) => can(u, p))) redirect('/app?denied=1');
  return u;
}
