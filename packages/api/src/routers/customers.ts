import { TRPCError } from '@trpc/server';
import { isOwner, panFromGstin } from '@kush/core';
import { Prisma, type Tx } from '@kush/db';
import { z } from 'zod';
import {
  customerAddressAddInput, customerAddressUpdateInput, customerCreateInput, customerListInput, customerLoginInput, customerUpdateInput,
} from '../schemas';
import { smsProvider } from '../notify/sms';
import { diff, logActivity } from '../services/activity';
import { nextCustomerCode } from '../services/counters';
import { numOrNull } from '../services/num';
import { ownerProcedure, permissionProcedure, router } from '../trpc';

const manage = permissionProcedure('MANAGE_CUSTOMERS');

/** A doctor can be linked under a hospital or clinic (orders "for Dr. X at Hospital Y"). */
async function checkParent(tx: Tx, type: string, parentId: string | null, selfId?: string) {
  if (!parentId) return;
  if (type !== 'DOCTOR') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only doctors can be linked under a hospital or clinic' });
  if (parentId === selfId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'A customer cannot be linked to itself' });
  const parent = await tx.customer.findUnique({ where: { id: parentId }, select: { type: true } });
  if (!parent || parent.type === 'DOCTOR') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Link doctors to a hospital or clinic account' });
}

async function checkAssignee(tx: Tx, id: string | null) {
  if (!id) return;
  const u = await tx.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
  if (!u || u.role === 'CUSTOMER' || !u.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Assign an active staff member' });
}

/** Keep exactly one default per address kind. */
async function normaliseDefaults(tx: Tx, customerId: string, kind: 'BILLING' | 'SHIPPING', defaultId?: string) {
  const list = await tx.address.findMany({ where: { customerId, kind }, orderBy: { id: 'asc' } });
  if (!list.length) return;
  const target = defaultId ?? list.find((a) => a.isDefault)?.id ?? list[0]!.id;
  await tx.address.updateMany({ where: { customerId, kind, id: { not: target } }, data: { isDefault: false } });
  await tx.address.update({ where: { id: target }, data: { isDefault: true } });
}

export const customersRouter = router({
  list: manage.input(customerListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db.customer.findMany({
      where: {
        deletedAt: null,
        ...(input?.includeInactive ? {} : { isActive: true }),
        ...(input?.type ? { type: input.type } : {}),
        ...(input?.assignedEmployeeId ? { assignedEmployeeId: input.assignedEmployeeId } : {}),
        ...(input?.priceListId ? { priceListId: input.priceListId } : {}),
        ...(input?.q
          ? { OR: ['name', 'code', 'mobile', 'gstin', 'contactPerson'].map((f) => ({ [f]: { contains: input.q, mode: 'insensitive' } })) }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 500,
      select: {
        id: true, code: true, type: true, name: true, mobile: true, gstin: true, isActive: true, stateCode: true,
        parent: { select: { id: true, name: true } },
        assignedEmployee: { select: { id: true, name: true } },
        priceList: { select: { id: true, name: true } },
        addresses: { where: { kind: 'BILLING', isDefault: true }, select: { city: true }, take: 1 },
        _count: { select: { doctors: true, customPrices: true, logins: true } },
      },
    });
    return rows.map(({ addresses, ...r }) => ({ ...r, city: addresses[0]?.city ?? null }));
  }),

  /** Lightweight options for pickers (parent hospital, etc.). */
  options: manage.input(z.object({ types: z.array(z.enum(['DOCTOR', 'HOSPITAL', 'CLINIC'])).optional() }).optional()).query(({ ctx, input }) =>
    ctx.db.customer.findMany({
      where: { deletedAt: null, isActive: true, ...(input?.types ? { type: { in: input.types } } : {}) },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, type: true },
    })),

  staffOptions: manage.query(({ ctx }) =>
    ctx.db.user.findMany({ where: { role: { in: ['OWNER', 'EMPLOYEE'] }, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } })),

  get: manage.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const c = await ctx.db.customer.findUnique({
      where: { id: input.id },
      include: {
        state: true,
        parent: { select: { id: true, name: true, type: true } },
        doctors: { select: { id: true, code: true, name: true, mobile: true, isActive: true }, orderBy: { name: 'asc' } },
        addresses: { orderBy: [{ kind: 'asc' }, { isDefault: 'desc' }, { id: 'asc' }] },
        logins: { select: { id: true, name: true, mobile: true, email: true, isActive: true, lastLoginAt: true }, orderBy: { name: 'asc' } },
        assignedEmployee: { select: { id: true, name: true } },
        priceList: { select: { id: true, name: true } },
        _count: { select: { customPrices: true } },
      },
    });
    if (!c || c.deletedAt) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
    return { ...c, creditLimit: numOrNull(c.creditLimit) };
  }),

  create: manage.input(customerCreateInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      await checkParent(tx, input.type, input.parentId);
      await checkAssignee(tx, input.assignedEmployeeId);
      const { billingAddress, fromLeadId, ...data } = input;
      const c = await tx.customer.create({
        data: {
          ...data,
          pan: data.pan ?? (data.gstin ? panFromGstin(data.gstin) : null),
          code: await nextCustomerCode(tx),
          addresses: { create: [{ kind: 'BILLING', isDefault: true, ...billingAddress }] },
        },
      });
      await logActivity(tx, { actorId: ctx.user.id, action: 'customer.create', entityType: 'Customer', entityId: c.id, summary: `Added ${c.type.toLowerCase()} ${c.code} ${c.name}${fromLeadId ? ' (from a website enquiry)' : ''}`, ip: ctx.ip });
      // A website enquiry turned into a customer.
      if (fromLeadId) await tx.lead.updateMany({ where: { id: fromLeadId }, data: { status: 'CONVERTED', convertedCustomerId: c.id, handledById: ctx.user.id } });
      return { id: c.id, code: c.code };
    })),

  update: manage.input(customerUpdateInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const { id, ...data } = input;
      const before = await tx.customer.findUnique({ where: { id }, include: { _count: { select: { doctors: true } } } });
      if (!before || before.deletedAt) throw new TRPCError({ code: 'NOT_FOUND' });
      if (data.type === 'DOCTOR' && before.type !== 'DOCTOR' && before._count.doctors) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unlink the doctors under this account before changing it to a doctor' });
      }
      await checkParent(tx, data.type, data.parentId, id);
      await checkAssignee(tx, data.assignedEmployeeId);
      const patch = { ...data, pan: data.pan ?? (data.gstin ? panFromGstin(data.gstin) : null) };
      const after = await tx.customer.update({ where: { id }, data: patch });
      const d = diff({ ...before, creditLimit: numOrNull(before.creditLimit) } as unknown as Record<string, unknown>, { ...patch, creditLimit: patch.creditLimit ?? null });
      if (d.changed.length) await logActivity(tx, { actorId: ctx.user.id, action: 'customer.update', entityType: 'Customer', entityId: id, summary: `Updated ${after.code}: ${d.changed.join(', ')}`, before: d.before, after: d.after, ip: ctx.ip });
      return { id };
    })),

  setActive: manage.input(z.object({ id: z.string(), isActive: z.boolean() })).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const c = await tx.customer.update({ where: { id: input.id }, data: { isActive: input.isActive } });
      if (!input.isActive) {
        // Deactivating an account also blocks its portal / app logins.
        await tx.user.updateMany({ where: { customerId: c.id }, data: { isActive: false } });
        await tx.session.updateMany({ where: { user: { customerId: c.id }, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await logActivity(tx, { actorId: ctx.user.id, action: input.isActive ? 'customer.activate' : 'customer.deactivate', entityType: 'Customer', entityId: c.id, summary: `${input.isActive ? 'Activated' : 'Deactivated'} ${c.name}`, ip: ctx.ip });
      return { ok: true };
    })),

  /** Assigning a price list is a pricing decision: owner only. */
  setPriceList: ownerProcedure.input(z.object({ customerId: z.string(), priceListId: z.string().nullable() })).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const before = await tx.customer.findUnique({ where: { id: input.customerId }, include: { priceList: true } });
      if (!before) throw new TRPCError({ code: 'NOT_FOUND' });
      const list = input.priceListId ? await tx.priceList.findUnique({ where: { id: input.priceListId } }) : null;
      if (input.priceListId && !list) throw new TRPCError({ code: 'NOT_FOUND', message: 'Price list not found' });
      await tx.customer.update({ where: { id: before.id }, data: { priceListId: input.priceListId } });
      await logActivity(tx, { actorId: ctx.user.id, action: 'price.assign_list', entityType: 'Customer', entityId: before.id, summary: `${before.name}: price list ${before.priceList?.name ?? 'none'} → ${list?.name ?? 'none'}`, ip: ctx.ip });
      return { ok: true };
    })),

  // ----- addresses -----
  addAddress: manage.input(customerAddressAddInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const a = await tx.address.create({ data: { customerId: input.customerId, kind: input.kind, isDefault: input.isDefault, ...input.address } });
      await normaliseDefaults(tx, input.customerId, input.kind, input.isDefault ? a.id : undefined);
      await logActivity(tx, { actorId: ctx.user.id, action: 'customer.address', entityType: 'Customer', entityId: input.customerId, summary: `Added ${input.kind.toLowerCase()} address (${a.city})`, ip: ctx.ip });
      return a;
    })),

  updateAddress: manage.input(customerAddressUpdateInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const a = await tx.address.update({ where: { id: input.id }, data: { ...input.address, isDefault: input.isDefault } });
      await normaliseDefaults(tx, a.customerId, a.kind, input.isDefault ? a.id : undefined);
      await logActivity(tx, { actorId: ctx.user.id, action: 'customer.address', entityType: 'Customer', entityId: a.customerId, summary: `Updated ${a.kind.toLowerCase()} address (${a.city})`, ip: ctx.ip });
      return a;
    })),

  removeAddress: manage.input(z.object({ id: z.string() })).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const a = await tx.address.findUnique({ where: { id: input.id } });
      if (!a) throw new TRPCError({ code: 'NOT_FOUND' });
      if (a.kind === 'BILLING' && (await tx.address.count({ where: { customerId: a.customerId, kind: 'BILLING' } })) <= 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'A customer needs at least one billing address' });
      }
      await tx.address.delete({ where: { id: a.id } });
      await normaliseDefaults(tx, a.customerId, a.kind);
      await logActivity(tx, { actorId: ctx.user.id, action: 'customer.address', entityType: 'Customer', entityId: a.customerId, summary: `Removed ${a.kind.toLowerCase()} address (${a.city})`, ip: ctx.ip });
      return { ok: true };
    })),

  // ----- portal / app logins (OTP on the registered mobile) -----
  createLogin: manage.input(customerLoginInput).mutation(async ({ ctx, input }) => {
    const c = await ctx.db.customer.findUnique({ where: { id: input.customerId } });
    if (!c || !c.isActive) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found or inactive' });
    try {
      return await ctx.db.$transaction(async (tx) => {
        const u = await tx.user.create({ data: { role: 'CUSTOMER', name: input.name, mobile: input.mobile, email: input.email, customerId: c.id } });
        await logActivity(tx, { actorId: ctx.user.id, action: 'customer.login_create', entityType: 'Customer', entityId: c.id, summary: `Login for ${input.name} (${input.mobile}) on ${c.name}`, ip: ctx.ip });
        return { id: u.id };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new TRPCError({ code: 'CONFLICT', message: 'This mobile or email already has a login' });
      throw e;
    }
  }),

  setLoginActive: manage.input(z.object({ userId: z.string(), isActive: z.boolean() })).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const u = await tx.user.findUnique({ where: { id: input.userId } });
      if (!u || u.role !== 'CUSTOMER') throw new TRPCError({ code: 'NOT_FOUND' });
      await tx.user.update({ where: { id: u.id }, data: { isActive: input.isActive } });
      if (!input.isActive) await tx.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await logActivity(tx, { actorId: ctx.user.id, action: input.isActive ? 'customer.login_activate' : 'customer.login_deactivate', entityType: 'Customer', entityId: u.customerId ?? u.id, summary: `${input.isActive ? 'Enabled' : 'Disabled'} login ${u.name}`, ip: ctx.ip });
      return { ok: true };
    })),

  /** Send sign-in instructions to a customer login (SMS provider; WhatsApp/email arrive in Phase 6). */
  sendLoginInvite: manage.input(z.object({ userId: z.string(), appUrl: z.string().url().optional() })).mutation(async ({ ctx, input }) => {
    const u = await ctx.db.user.findUnique({ where: { id: input.userId }, include: { customer: true } });
    if (!u || u.role !== 'CUSTOMER' || !u.mobile || !u.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Login must be active with a mobile number' });
    const url = input.appUrl ?? 'the Kush Enterprise app';
    await smsProvider().send(u.mobile, `Kush Enterprise: your account for ${u.customer?.name ?? 'your clinic'} is ready. Sign in at ${url} with this mobile number; we'll text you a one-time code.`);
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'customer.login_invite', entityType: 'Customer', entityId: u.customerId ?? u.id, summary: `Sent sign-in instructions to ${u.mobile}`, ip: ctx.ip });
    return { ok: true, channel: smsProvider().name };
  }),

  canEditPricing: manage.query(({ ctx }) => isOwner(ctx.user)),
});

