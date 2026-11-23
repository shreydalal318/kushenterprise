import { TRPCError } from '@trpc/server';
import { DEFAULT_PREFIXES, DOC_TYPES, DOC_TYPE_LABELS, financialYear, INDIAN_STATES } from '@kush/core';
import { Prisma } from '@kush/db';
import { z } from 'zod';
import {
  bankSettingsInput, categoryInput, categoryRenameInput, companySettingsInput, documentSettingsInput,
  inventorySettingsInput, mastersSettingsInput, notificationSettingsInput, numberSeriesUpdateInput,
} from '../schemas';
import { diff, logActivity } from '../services/activity';
import { getSettings, settingsView } from '../services/settings';
import { ownerProcedure, publicProcedure, router, staffProcedure, type Context } from '../trpc';

type SettingsPatch = Prisma.CompanySettingsUpdateInput;

/** Update a section of the settings row and log exactly what changed. */
async function updateSection(ctx: Context & { user: { id: string } }, section: string, patch: SettingsPatch, compare: Record<string, unknown>) {
  return ctx.db.$transaction(async (tx) => {
    const before = await getSettings(tx);
    const after = await tx.companySettings.update({ where: { id: 'company' }, data: patch });
    const view = settingsView(before) as unknown as Record<string, unknown>;
    const d = diff(view, compare);
    if (d.changed.length) {
      await logActivity(tx, {
        actorId: ctx.user.id, action: 'settings.update', entityType: 'CompanySettings', entityId: 'company',
        summary: `${section}: ${d.changed.join(', ')}`, before: d.before, after: d.after, ip: ctx.ip,
      });
    }
    return settingsView(after);
  });
}

export const settingsRouter = router({
  /** Staff need company details for documents; secrets never live in this row. */
  get: staffProcedure.query(async ({ ctx }) => settingsView(await getSettings(ctx.db))),

  states: publicProcedure.query(() => INDIAN_STATES),

  updateCompany: ownerProcedure.input(companySettingsInput).mutation(({ ctx, input }) =>
    updateSection(ctx, 'Company profile', input, input)),

  updateBank: ownerProcedure.input(bankSettingsInput).mutation(({ ctx, input }) =>
    updateSection(ctx, 'Bank & UPI', input, input)),

  updateDocuments: ownerProcedure.input(documentSettingsInput).mutation(({ ctx, input }) =>
    updateSection(ctx, 'Documents', input, input)),

  updateMasters: ownerProcedure.input(mastersSettingsInput).mutation(({ ctx, input }) =>
    updateSection(ctx, 'GST rates & units', { gstRates: input.gstRates.map((r) => new Prisma.Decimal(r)), units: input.units }, input)),

  updateInventory: ownerProcedure.input(inventorySettingsInput).mutation(({ ctx, input }) =>
    updateSection(ctx, 'Inventory defaults', input, input)),

  updateNotifications: ownerProcedure.input(notificationSettingsInput).mutation(({ ctx, input }) =>
    updateSection(ctx, 'Notifications', { notificationConfig: input }, { notificationConfig: input })),

  clearSignature: ownerProcedure.mutation(({ ctx }) =>
    updateSection(ctx, 'Signature', { signatureFileId: null }, { signatureFileId: null })),

  // ----- document numbering -----
  numberSeries: ownerProcedure.input(z.object({ financialYear: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const fy = input?.financialYear ?? financialYear();
    const rows = await ctx.db.numberSeries.findMany({ where: { financialYear: fy } });
    return {
      financialYear: fy,
      series: DOC_TYPES.map((docType) => {
        const r = rows.find((x) => x.docType === docType);
        return {
          docType,
          label: DOC_TYPE_LABELS[docType],
          prefix: r?.prefix ?? DEFAULT_PREFIXES[docType],
          nextNumber: r?.nextNumber ?? 1,
          padding: r?.padding ?? 4,
          exists: !!r,
        };
      }),
    };
  }),

  updateNumberSeries: ownerProcedure.input(numberSeriesUpdateInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const key = { docType: input.docType, financialYear: input.financialYear };
      const before = await tx.numberSeries.findUnique({ where: { docType_financialYear: key } });
      // Guard against reissuing numbers: only documents already numbered block lowering the counter.
      if (before && input.nextNumber < before.nextNumber) {
        const used = await countIssued(tx, input.docType, before.prefix, input.financialYear);
        if (used > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `${used} document(s) already use this series; the next number cannot go below ${before.nextNumber}`,
          });
        }
      }
      const row = await tx.numberSeries.upsert({
        where: { docType_financialYear: key },
        create: { ...key, prefix: input.prefix, nextNumber: input.nextNumber, padding: input.padding },
        update: { prefix: input.prefix, nextNumber: input.nextNumber, padding: input.padding },
      });
      await logActivity(tx, {
        actorId: ctx.user.id, action: 'settings.numbering', entityType: 'NumberSeries', entityId: row.id,
        summary: `${DOC_TYPE_LABELS[input.docType]} ${input.financialYear}: ${input.prefix}… next ${input.nextNumber}`,
        before: before ? { prefix: before.prefix, nextNumber: before.nextNumber, padding: before.padding } : null,
        after: { prefix: row.prefix, nextNumber: row.nextNumber, padding: row.padding }, ip: ctx.ip,
      });
      return row;
    })),

  // ----- product categories -----
  categories: staffProcedure.query(({ ctx }) =>
    ctx.db.category.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { products: true } } } })),

  createCategory: ownerProcedure.input(categoryInput).mutation(async ({ ctx, input }) => {
    try {
      const c = await ctx.db.category.create({ data: { name: input.name } });
      await logActivity(ctx.db, { actorId: ctx.user.id, action: 'category.create', entityType: 'Category', entityId: c.id, summary: `Added category ${c.name}`, ip: ctx.ip });
      return c;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new TRPCError({ code: 'CONFLICT', message: 'That category already exists' });
      throw e;
    }
  }),

  renameCategory: ownerProcedure.input(categoryRenameInput).mutation(async ({ ctx, input }) => {
    const before = await ctx.db.category.findUnique({ where: { id: input.id } });
    if (!before) throw new TRPCError({ code: 'NOT_FOUND' });
    try {
      const c = await ctx.db.category.update({ where: { id: input.id }, data: { name: input.name } });
      await logActivity(ctx.db, { actorId: ctx.user.id, action: 'category.rename', entityType: 'Category', entityId: c.id, summary: `${before.name} → ${c.name}`, ip: ctx.ip });
      return c;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new TRPCError({ code: 'CONFLICT', message: 'That category already exists' });
      throw e;
    }
  }),

  deleteCategory: ownerProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const c = await ctx.db.category.findUnique({ where: { id: input.id }, include: { _count: { select: { products: true } } } });
    if (!c) throw new TRPCError({ code: 'NOT_FOUND' });
    if (c._count.products > 0) throw new TRPCError({ code: 'BAD_REQUEST', message: `${c._count.products} product(s) use this category` });
    await ctx.db.category.delete({ where: { id: c.id } });
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'category.delete', entityType: 'Category', entityId: c.id, summary: `Deleted category ${c.name}`, ip: ctx.ip });
    return { ok: true };
  }),
});

/** Count documents already numbered in a series (tables arrive in later phases; safe if empty). */
async function countIssued(tx: Prisma.TransactionClient, docType: string, prefix: string, fy: string): Promise<number> {
  switch (docType) {
    case 'TAX_INVOICE': return tx.invoice.count({ where: { number: { startsWith: `${prefix}${fy}/` } } });
    case 'PROFORMA': return tx.proforma.count({ where: { number: { startsWith: `${prefix}${fy}/` } } });
    case 'PURCHASE_ORDER': return tx.purchaseOrder.count({ where: { number: { startsWith: `${prefix}${fy}/` } } });
    case 'CREDIT_NOTE': return tx.creditNote.count({ where: { number: { startsWith: `${prefix}${fy}/` } } });
    case 'GRN': return tx.grn.count({ where: { number: { startsWith: `${prefix}${fy}/` } } });
    case 'SALES_ORDER': return tx.salesOrder.count({ where: { number: { startsWith: `${prefix}${fy}/` } } });
    case 'PAYMENT_RECEIPT': return tx.payment.count({ where: { number: { startsWith: `${prefix}${fy}/` } } });
    default: return 0;
  }
}
