import { TRPCError } from '@trpc/server';
import { can, LENS_TYPES, stateByCode } from '@kush/core';
import { z } from 'zod';
import { notify } from '../notify';
import { logActivity } from '../services/activity';
import { num } from '../services/num';
import { getSettings } from '../services/settings';
import { mobileSchema } from '../schemas-common';
import { permissionProcedure, publicProcedure, router } from '../trpc';

/** Public catalogue rows: never prices, costs or stock. Only products marked "show on website". */
const visible = { isActive: true, deletedAt: null, showOnWebsite: true } as const;
const placeholder = (v: string | null | undefined) => !v || /^\[.*\]$/.test(v.trim());

const enquiryInput = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(120),
  organisation: z.string().trim().max(160).optional().nullable(),
  type: z.enum(['DOCTOR', 'HOSPITAL', 'CLINIC']).optional().nullable(),
  mobile: mobileSchema,
  email: z.union([z.literal('').transform(() => null), z.email('Enter a valid email').trim().toLowerCase()]).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  message: z.string().trim().min(5, 'Tell us what you need').max(2000),
  productIds: z.array(z.string()).max(20).default([]),
  sourcePath: z.string().max(200).optional().nullable(),
  /** Honeypot: real visitors never fill this hidden field. */
  website: z.string().max(200).optional(),
});

export const websiteRouter = router({
  /** Company details for the header/footer and About page (placeholders are left out). */
  company: publicProcedure.query(async ({ ctx }) => {
    const s = await getSettings(ctx.db);
    const keep = (v: string | null | undefined) => (placeholder(v) ? null : v!);
    return {
      name: s.legalName, addressLines: [keep(s.addressLine1), keep(s.addressLine2), [keep(s.city), keep(s.pincode)].filter(Boolean).join(' - ')].filter(Boolean) as string[],
      state: stateByCode(s.stateCode)?.name ?? null, phone: keep(s.phone), email: keep(s.email), gstin: keep(s.gstin), drugLicenceNo: keep(s.drugLicenceNo),
    };
  }),

  filters: publicProcedure.query(async ({ ctx }) => {
    const [categories, brands, powers] = await Promise.all([
      ctx.db.category.findMany({ where: { products: { some: visible } }, orderBy: { name: 'asc' }, select: { id: true, name: true, _count: { select: { products: { where: visible } } } } }),
      ctx.db.brand.findMany({ where: { products: { some: visible } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      ctx.db.productVariant.aggregate({ where: { isActive: true, powerSph: { not: null }, product: visible }, _min: { powerSph: true }, _max: { powerSph: true } }),
    ]);
    return { categories: categories.map((c) => ({ id: c.id, name: c.name, count: c._count.products })), brands, lensTypes: LENS_TYPES, power: { min: num(powers._min.powerSph ?? 0), max: num(powers._max.powerSph ?? 0) } };
  }),

  catalogue: publicProcedure.input(z.object({ q: z.string().trim().max(80).optional(), categoryId: z.string().optional(), brandId: z.string().optional(), lensType: z.enum(LENS_TYPES).optional(), power: z.coerce.number().min(-30).max(60).optional() }).optional()).query(async ({ ctx, input }) => {
    const rows = await ctx.db.product.findMany({
      where: {
        ...visible,
        ...(input?.categoryId ? { categoryId: input.categoryId } : {}), ...(input?.brandId ? { brandId: input.brandId } : {}), ...(input?.lensType ? { lensType: input.lensType } : {}),
        ...(input?.q ? { OR: [{ name: { contains: input.q, mode: 'insensitive' } }, { code: { contains: input.q, mode: 'insensitive' } }, { brand: { name: { contains: input.q, mode: 'insensitive' } } }] } : {}),
        variants: { some: { isActive: true, deletedAt: null, ...(input?.power != null ? { powerSph: input.power } : {}) } },
      },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }], take: 300,
      select: { id: true, code: true, name: true, imageIds: true, isLens: true, lensType: true, material: true, preloaded: true, category: { select: { name: true } }, brand: { select: { name: true } }, variants: { where: { isActive: true, deletedAt: null }, select: { powerSph: true } } },
    });
    return rows.map((p) => {
      const powers = p.variants.map((v) => v.powerSph).filter((x) => x != null).map((x) => num(x));
      return { id: p.id, code: p.code, name: p.name, image: p.imageIds[0] ?? null, category: p.category.name, brand: p.brand?.name ?? null, isLens: p.isLens, lensType: p.lensType, material: p.material, preloaded: p.preloaded, powerRange: powers.length ? { min: Math.min(...powers), max: Math.max(...powers) } : null };
    });
  }),

  product: publicProcedure.input(z.object({ code: z.string().max(60) })).query(async ({ ctx, input }) => {
    const p = await ctx.db.product.findFirst({
      where: { ...visible, code: input.code },
      include: { category: { select: { name: true } }, brand: { select: { name: true } }, variants: { where: { isActive: true, deletedAt: null }, orderBy: [{ cylinder: 'asc' }, { addPower: 'asc' }, { powerSph: 'asc' }], select: { powerSph: true, cylinder: true, addPower: true } } },
    });
    if (!p) throw new TRPCError({ code: 'NOT_FOUND' });
    const n = (d: unknown) => (d == null ? null : num(d as never));
    const sph = [...new Set(p.variants.map((v) => n(v.powerSph)).filter((x): x is number => x != null))].sort((a, b) => a - b);
    return {
      id: p.id, code: p.code, name: p.name, description: p.description, images: p.imageIds, category: p.category.name, brand: p.brand?.name ?? null, unit: p.unit,
      isLens: p.isLens, lensType: p.lensType, material: p.material, preloaded: p.preloaded, aConstant: n(p.aConstant), opticSizeMm: n(p.opticSizeMm), overallLenMm: n(p.overallLenMm),
      powers: sph, cylinders: [...new Set(p.variants.map((v) => n(v.cylinder)).filter((x): x is number => x != null))].sort((a, b) => a - b),
      addPowers: [...new Set(p.variants.map((v) => n(v.addPower)).filter((x): x is number => x != null))].sort((a, b) => a - b),
    };
  }),

  /** All public product codes (for the sitemap). */
  productCodes: publicProcedure.query(async ({ ctx }) => (await ctx.db.product.findMany({ where: visible, select: { code: true, updatedAt: true } })).map((p) => ({ code: p.code, updatedAt: p.updatedAt }))),

  /** Contact / enquiry form → a Lead for the team, with spam protection (honeypot + rate limit). */
  enquire: publicProcedure.input(enquiryInput).mutation(async ({ ctx, input }) => {
    if (input.website) return { ok: true }; // bot filled the hidden field: pretend success, store nothing
    const since = new Date(Date.now() - 60 * 60_000);
    if (ctx.ip && (await ctx.db.lead.count({ where: { ip: ctx.ip, createdAt: { gte: since } } })) >= 5) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Thank you, we already have your enquiries. We will call you shortly.' });
    }
    const productIds = input.productIds.length ? (await ctx.db.product.findMany({ where: { id: { in: input.productIds }, ...visible }, select: { id: true } })).map((p) => p.id) : [];
    await ctx.db.$transaction(async (tx) => {
      const lead = await tx.lead.create({ data: { name: input.name, organisation: input.organisation ?? null, type: input.type ?? null, mobile: input.mobile, email: input.email ?? null, city: input.city ?? null, message: input.message, productIds, sourcePath: input.sourcePath ?? null, ip: ctx.ip } });
      const staff = await tx.user.findMany({ where: { isActive: true, OR: [{ role: 'OWNER' }, { role: 'EMPLOYEE', permissions: { has: 'MANAGE_CUSTOMERS' } }] }, select: { id: true } });
      await notify(tx, { userIds: staff.map((u) => u.id), title: `Website enquiry: ${input.organisation || input.name}`, body: `${input.name}${input.city ? `, ${input.city}` : ''} · ${input.mobile}: ${input.message.slice(0, 140)}`, link: `/app/leads?open=${lead.id}`, channels: ['PUSH', 'EMAIL'] });
    });
    return { ok: true };
  }),
});

const leadsView = permissionProcedure('MANAGE_CUSTOMERS');
export const leadsRouter = router({
  list: leadsView.input(z.object({ status: z.enum(['NEW', 'CONTACTED', 'CONVERTED', 'CLOSED']).optional(), q: z.string().trim().max(80).optional() }).optional()).query(async ({ ctx, input }) => {
    const rows = await ctx.db.lead.findMany({
      where: { ...(input?.status ? { status: input.status } : {}), ...(input?.q ? { OR: [{ name: { contains: input.q, mode: 'insensitive' } }, { organisation: { contains: input.q, mode: 'insensitive' } }, { mobile: { contains: input.q } }, { city: { contains: input.q, mode: 'insensitive' } }] } : {}) },
      orderBy: { createdAt: 'desc' }, take: 300,
    });
    const products = new Map((await ctx.db.product.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => r.productIds))] } }, select: { id: true, name: true, code: true } })).map((p) => [p.id, p]));
    const users = new Map((await ctx.db.user.findMany({ where: { id: { in: rows.map((r) => r.handledById).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return rows.map(({ ip: _ip, ...r }) => ({ ...r, products: r.productIds.map((id) => products.get(id)).filter(Boolean) as { id: string; name: string; code: string }[], handledBy: r.handledById ? users.get(r.handledById) ?? null : null }));
  }),
  get: leadsView.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const l = await ctx.db.lead.findUnique({ where: { id: input.id } });
    if (!l) throw new TRPCError({ code: 'NOT_FOUND' });
    const { ip: _ip, ...rest } = l;
    const products = await ctx.db.product.findMany({ where: { id: { in: l.productIds } }, select: { id: true, name: true, code: true } });
    const handledBy = l.handledById ? (await ctx.db.user.findUnique({ where: { id: l.handledById }, select: { name: true } }))?.name ?? null : null;
    return { ...rest, products, handledBy };
  }),
  counts: leadsView.query(async ({ ctx }) => Object.fromEntries((await ctx.db.lead.groupBy({ by: ['status'], _count: true })).map((g) => [g.status, g._count]))),
  update: leadsView.input(z.object({ id: z.string(), status: z.enum(['NEW', 'CONTACTED', 'CLOSED']).optional(), notes: z.string().trim().max(2000).optional().nullable() })).mutation(async ({ ctx, input }) => {
    const l = await ctx.db.lead.findUnique({ where: { id: input.id } });
    if (!l) throw new TRPCError({ code: 'NOT_FOUND' });
    if (l.status === 'CONVERTED' && input.status) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already converted to a customer' });
    await ctx.db.lead.update({ where: { id: l.id }, data: { ...(input.status ? { status: input.status } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}), handledById: ctx.user.id } });
    if (input.status && input.status !== l.status) await logActivity(ctx.db, { actorId: ctx.user.id, action: 'lead.status', entityType: 'Lead', entityId: l.id, ip: ctx.ip, summary: `Enquiry from ${l.organisation || l.name}: ${l.status} → ${input.status}` });
    return { ok: true };
  }),
  /** Who may convert: anyone who can manage customers (the customer form does the rest). */
  canConvert: leadsView.query(({ ctx }) => can(ctx.user, 'MANAGE_CUSTOMERS')),
});
