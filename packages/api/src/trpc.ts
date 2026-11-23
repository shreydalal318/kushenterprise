import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { can, isOwner, isStaff, type Permission } from '@kush/core';
import { Prisma, prisma, type PrismaClient } from '@kush/db';
import { tokenFromHeaders, validateSessionToken, type SessionInfo } from './auth/session';

// Prisma Decimals travel to clients as strings (never as lossy floats).
superjson.registerCustom<Prisma.Decimal, string>(
  {
    isApplicable: (v): v is Prisma.Decimal => Prisma.Decimal.isDecimal(v),
    serialize: (v) => v.toString(),
    deserialize: (v) => new Prisma.Decimal(v),
  },
  'decimal.js',
);

export interface Context {
  db: PrismaClient;
  session: SessionInfo | null;
  ip: string | null;
  userAgent: string | null;
  /** Response headers (fetch adapter) so auth procedures can set cookies. */
  resHeaders: Headers | null;
}

export async function createContext(opts: { headers: Headers; resHeaders?: Headers | null }): Promise<Context> {
  const token = tokenFromHeaders(opts.headers);
  const session = await validateSessionToken(prisma, token);
  const xff = opts.headers.get('x-forwarded-for');
  return {
    db: prisma,
    session,
    ip: xff ? xff.split(',')[0]!.trim() : opts.headers.get('x-real-ip'),
    userAgent: opts.headers.get('user-agent'),
    resHeaders: opts.resHeaders ?? null,
  };
}

function zodSummary(err: ZodError) {
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];
  for (const i of err.issues) {
    if (!i.path.length) formErrors.push(i.message);
    else (fieldErrors[i.path.join('.')] ??= []).push(i.message);
  }
  return { formErrors, fieldErrors };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Field errors keyed by full path ("billingAddress.pincode", "rows.3.rate"), first message each.
        zodError: error.cause instanceof ZodError ? zodSummary(error.cause) : null,
      },
    };
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/** Any signed-in, active user. Users flagged mustChangePassword can only reach the auth router. */
export const authedProcedure = t.procedure.use(({ ctx, path, next }) => {
  if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please sign in' });
  if (ctx.session.user.mustChangePassword && !path.startsWith('auth.')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'PASSWORD_CHANGE_REQUIRED' });
  }
  return next({ ctx: { ...ctx, session: ctx.session, user: ctx.session.user } });
});

export const staffProcedure = authedProcedure.use(({ ctx, next }) => {
  if (!isStaff(ctx.user)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Staff only' });
  return next();
});

export const ownerProcedure = authedProcedure.use(({ ctx, next }) => {
  if (!isOwner(ctx.user)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Owner only' });
  return next();
});

/** Staff procedure gated by one of the owner-assigned permission checkboxes. */
export const permissionProcedure = (permission: Permission) =>
  staffProcedure.use(({ ctx, next }) => {
    if (!can(ctx.user, permission)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: `Missing permission: ${permission}` });
    }
    return next();
  });

export const customerProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'CUSTOMER' || !ctx.user.customerId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer accounts only' });
  }
  return next({ ctx: { ...ctx, customerId: ctx.user.customerId } });
});

/** Staff procedure allowed when the user holds ANY of the listed permissions. */
export const anyPermissionProcedure = (...permissions: Permission[]) =>
  staffProcedure.use(({ ctx, next }) => {
    if (!permissions.some((p) => can(ctx.user, p))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: `Missing permission: one of ${permissions.join(', ')}` });
    }
    return next();
  });
