import { TRPCError } from '@trpc/server';
import { sanitizePermissions } from '@kush/core';
import { Prisma } from '@kush/db';
import { z } from 'zod';
import { hashPassword } from '../auth/password';
import { revokeAllSessions } from '../auth/session';
import {
  employeeCreateInput, employeePermissionsInput, employeeResetPasswordInput, employeeSetActiveInput, employeeUpdateInput,
} from '../schemas';
import { diff, logActivity } from '../services/activity';
import { ownerProcedure, router } from '../trpc';

const select = {
  id: true, name: true, email: true, mobile: true, permissions: true, isActive: true,
  lastLoginAt: true, mustChangePassword: true, lockedUntil: true, createdAt: true,
} as const;

function uniqueViolation(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const field = String((e.meta?.target as string[] | undefined)?.[0] ?? 'value');
    throw new TRPCError({ code: 'CONFLICT', message: `Another user already has this ${field}` });
  }
  throw e;
}

async function getEmployee(db: Prisma.TransactionClient, id: string) {
  const u = await db.user.findUnique({ where: { id }, select: { ...select, role: true } });
  if (!u || u.role !== 'EMPLOYEE') throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
  return u;
}

/** Employee management — owner only. */
export const employeesRouter = router({
  list: ownerProcedure
    .input(z.object({ includeInactive: z.boolean().default(true) }).optional())
    .query(({ ctx, input }) =>
      ctx.db.user.findMany({
        where: { role: 'EMPLOYEE', ...(input?.includeInactive === false ? { isActive: true } : {}) },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        select,
      })),

  get: ownerProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => getEmployee(ctx.db, input.id)),

  create: ownerProcedure.input(employeeCreateInput).mutation(async ({ ctx, input }) => {
    const passwordHash = await hashPassword(input.password);
    return ctx.db.$transaction(async (tx) => {
      const user = await tx.user
        .create({
          data: {
            role: 'EMPLOYEE',
            name: input.name,
            email: input.email ?? null,
            mobile: input.mobile ?? null,
            passwordHash,
            mustChangePassword: true, // temporary password set by the owner
            permissions: sanitizePermissions(input.permissions),
          },
          select,
        })
        .catch(uniqueViolation);
      await logActivity(tx, {
        actorId: ctx.user.id, action: 'employee.create', entityType: 'User', entityId: user.id,
        summary: `Added employee ${user.name}`, after: { name: user.name, email: user.email, mobile: user.mobile, permissions: user.permissions }, ip: ctx.ip,
      });
      return user;
    });
  }),

  update: ownerProcedure.input(employeeUpdateInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const before = await getEmployee(tx, input.id);
      const data = { name: input.name, email: input.email, mobile: input.mobile };
      const user = await tx.user.update({ where: { id: input.id }, data, select }).catch(uniqueViolation);
      const d = diff(before, data);
      if (d.changed.length) {
        await logActivity(tx, {
          actorId: ctx.user.id, action: 'employee.update', entityType: 'User', entityId: user.id,
          summary: `Updated ${user.name}: ${d.changed.join(', ')}`, before: d.before, after: d.after, ip: ctx.ip,
        });
      }
      return user;
    })),

  setPermissions: ownerProcedure.input(employeePermissionsInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const before = await getEmployee(tx, input.id);
      const permissions = sanitizePermissions(input.permissions);
      const user = await tx.user.update({ where: { id: input.id }, data: { permissions }, select });
      const added = permissions.filter((p) => !before.permissions.includes(p));
      const removed = before.permissions.filter((p) => !permissions.includes(p));
      if (added.length || removed.length) {
        await logActivity(tx, {
          actorId: ctx.user.id, action: 'employee.permissions', entityType: 'User', entityId: user.id,
          summary: [`Permissions for ${user.name}`, added.length && `+${added.join(', +')}`, removed.length && `-${removed.join(', -')}`].filter(Boolean).join(' '),
          before: { permissions: before.permissions }, after: { permissions }, ip: ctx.ip,
        });
      }
      return user;
    })),

  resetPassword: ownerProcedure.input(employeeResetPasswordInput).mutation(async ({ ctx, input }) => {
    const passwordHash = await hashPassword(input.password);
    return ctx.db.$transaction(async (tx) => {
      const emp = await getEmployee(tx, input.id);
      await tx.user.update({
        where: { id: emp.id },
        data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null, passwordChangedAt: new Date() },
      });
      await revokeAllSessions(tx, emp.id);
      await logActivity(tx, { actorId: ctx.user.id, action: 'employee.password_reset', entityType: 'User', entityId: emp.id, summary: `Reset password for ${emp.name}`, ip: ctx.ip });
      return { ok: true };
    });
  }),

  setActive: ownerProcedure.input(employeeSetActiveInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const emp = await getEmployee(tx, input.id);
      const user = await tx.user.update({ where: { id: emp.id }, data: { isActive: input.isActive }, select });
      if (!input.isActive) await revokeAllSessions(tx, emp.id); // signs them out everywhere immediately
      await logActivity(tx, {
        actorId: ctx.user.id, action: input.isActive ? 'employee.activate' : 'employee.deactivate', entityType: 'User', entityId: emp.id,
        summary: `${input.isActive ? 'Re-activated' : 'Deactivated'} ${emp.name}`, ip: ctx.ip,
      });
      return user;
    })),
});
