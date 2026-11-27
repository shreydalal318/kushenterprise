import { TRPCError } from '@trpc/server';
import { AUTH, env } from '../env';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../auth/password';
import {
  clearSessionCookie, createSession, revokeAllSessions, revokeSession, sessionCookie,
} from '../auth/session';
import { hmac, newOtpCode, safeEqualHex } from '../auth/tokens';
import { smsProvider } from '../notify/sms';
import { changePasswordInput, loginPasswordInput, requestOtpInput, verifyOtpInput } from '../schemas';
import { logActivity } from '../services/activity';
import { authedProcedure, publicProcedure, router, type Context } from '../trpc';
import { normalizeIndianMobile } from '@kush/core';
import { z } from 'zod';

const BAD_LOGIN = 'Incorrect email/mobile or password';

async function startSession(ctx: Context, userId: string, client: 'web' | 'mobile') {
  const { token, expiresAt } = await createSession(ctx.db, userId, { ip: ctx.ip, userAgent: ctx.userAgent, client });
  await ctx.db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
  if (client === 'web') {
    ctx.resHeaders?.append('Set-Cookie', sessionCookie(token, expiresAt));
    return { token: null as string | null, expiresAt };
  }
  return { token, expiresAt }; // mobile stores it in the secure keychain and sends it as a Bearer token
}

const publicUser = (u: { id: string; name: string; role: string; mustChangePassword: boolean }) => ({
  id: u.id, name: u.name, role: u.role, mustChangePassword: u.mustChangePassword,
});

export const authRouter = router({
  /** Current user (null when signed out). */
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.session) return null;
    const u = ctx.session.user;
    return {
      id: u.id, name: u.name, role: u.role, email: u.email, mobile: u.mobile,
      permissions: u.permissions, customerId: u.customerId, mustChangePassword: u.mustChangePassword,
    };
  }),

  loginWithPassword: publicProcedure.input(loginPasswordInput).mutation(async ({ ctx, input }) => {
    const mobile = normalizeIndianMobile(input.identifier);
    const user = await ctx.db.user.findFirst({
      where: mobile ? { mobile } : { email: input.identifier.toLowerCase() },
    });
    if (!user || !user.isActive) {
      await burnPasswordCheck(input.password);
      throw new TRPCError({ code: 'UNAUTHORIZED', message: BAD_LOGIN });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: `Too many failed attempts. Try again in ${mins} min or use OTP.` });
    }
    if (!user.passwordHash) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This account signs in with an OTP on mobile' });
    }
    if (!(await verifyPassword(user.passwordHash, input.password))) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= AUTH.maxFailedLogins;
      await ctx.db.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + AUTH.lockMinutes * 60000) : undefined,
        },
      });
      await logActivity(ctx.db, {
        actorId: user.id, action: lock ? 'auth.locked' : 'auth.login_failed', entityType: 'User', entityId: user.id,
        summary: lock ? `Locked for ${AUTH.lockMinutes} min after ${AUTH.maxFailedLogins} failed attempts` : 'Wrong password', ip: ctx.ip,
      });
      throw new TRPCError({ code: 'UNAUTHORIZED', message: BAD_LOGIN });
    }
    const s = await startSession(ctx, user.id, input.client);
    await logActivity(ctx.db, { actorId: user.id, action: 'auth.login', entityType: 'User', entityId: user.id, summary: `Password login (${input.client})`, ip: ctx.ip });
    return { user: publicUser(user), ...s };
  }),

  /** Always answers the same way so it can't be used to discover registered numbers. */
  requestOtp: publicProcedure.input(requestOtpInput).mutation(async ({ ctx, input }) => {
    const generic = { sent: true, resendInSeconds: AUTH.otpResendSeconds };
    const user = await ctx.db.user.findUnique({ where: { mobile: input.mobile } });
    if (!user || !user.isActive) return generic;

    const recent = await ctx.db.otpCode.findMany({
      where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 3600_000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const last = recent[0];
    if (last && Date.now() - last.createdAt.getTime() < AUTH.otpResendSeconds * 1000) return generic;
    if (recent.length >= AUTH.otpMaxPerHour) return generic;

    const code = newOtpCode();
    await ctx.db.otpCode.create({
      data: {
        userId: user.id,
        codeHash: hmac(`${user.id}:${code}`),
        channel: 'SMS',
        expiresAt: new Date(Date.now() + AUTH.otpTtlMinutes * 60000),
      },
    });
    await smsProvider().send(
      input.mobile,
      `${code} is your Kush Enterprise login code. It is valid for ${AUTH.otpTtlMinutes} minutes. Do not share it with anyone.`,
    );
    return generic;
  }),

  verifyOtp: publicProcedure.input(verifyOtpInput).mutation(async ({ ctx, input }) => {
    const invalid = new TRPCError({ code: 'UNAUTHORIZED', message: 'That code is wrong or has expired. Request a new one.' });
    const user = await ctx.db.user.findUnique({ where: { mobile: input.mobile } });
    if (!user || !user.isActive) throw invalid;
    const otp = await ctx.db.otpCode.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= AUTH.otpMaxAttempts) throw invalid;
    if (!safeEqualHex(otp.codeHash, hmac(`${user.id}:${input.code}`))) {
      await ctx.db.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw invalid;
    }
    await ctx.db.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
    const s = await startSession(ctx, user.id, input.client);
    await logActivity(ctx.db, { actorId: user.id, action: 'auth.login', entityType: 'User', entityId: user.id, summary: `OTP login (${input.client})`, ip: ctx.ip });
    return { user: publicUser(user), ...s };
  }),

  /** Quick login (DEV_QUICK_LOGIN in development, or DEMO_QUICK_LOGIN on a hosted demo): every active user. */
  devUsers: publicProcedure.query(async ({ ctx }) => {
    if (!env.devQuickLogin) return null;
    return ctx.db.user.findMany({
      where: { isActive: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, role: true, email: true, mobile: true, permissions: true },
    });
  }),

  devLogin: publicProcedure
    .input(z.object({ userId: z.string(), client: z.enum(['web', 'mobile']).default('web') }))
    .mutation(async ({ ctx, input }) => {
      if (!env.devQuickLogin) throw new TRPCError({ code: 'NOT_FOUND' });
      const user = await ctx.db.user.findFirst({ where: { id: input.userId, isActive: true } });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such user' });
      const s = await startSession(ctx, user.id, input.client);
      await logActivity(ctx.db, { actorId: user.id, action: 'auth.login', entityType: 'User', entityId: user.id, summary: `Dev quick login (${input.client})`, ip: ctx.ip });
      return { user: publicUser({ ...user, mustChangePassword: false }), ...s };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.session) await revokeSession(ctx.db, ctx.session.sessionId);
    ctx.resHeaders?.append('Set-Cookie', clearSessionCookie());
    return { ok: true };
  }),

  changePassword: authedProcedure.input(changePasswordInput).mutation(async ({ ctx, input }) => {
    const user = await ctx.db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    if (!user.passwordHash || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Current password is incorrect' });
    }
    if (input.currentPassword === input.newPassword) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose a password different from the current one' });
    }
    await ctx.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false, passwordChangedAt: new Date() },
      });
      await revokeAllSessions(tx, user.id, ctx.session.sessionId); // sign out other devices
      await logActivity(tx, { actorId: user.id, action: 'auth.password_changed', entityType: 'User', entityId: user.id, ip: ctx.ip });
    });
    return { ok: true };
  }),

  mySessions: authedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.session.findMany({
      where: { userId: ctx.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, client: true, userAgent: true, ip: true, createdAt: true, lastUsedAt: true },
    });
    return rows.map((r) => ({ ...r, current: r.id === ctx.session.sessionId }));
  }),

  revokeSession: authedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const s = await ctx.db.session.findFirst({ where: { id: input.id, userId: ctx.user.id } });
    if (!s) throw new TRPCError({ code: 'NOT_FOUND' });
    await revokeSession(ctx.db, s.id);
    return { ok: true };
  }),
});
