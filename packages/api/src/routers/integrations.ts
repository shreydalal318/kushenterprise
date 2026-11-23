import { TRPCError } from '@trpc/server';
import { can } from '@kush/core';
import { Prisma } from '@kush/db';
import { z } from 'zod';
import { logActivity } from '../services/activity';
import { dayToDate, isoDay } from '../services/num';
import { getSettings } from '../services/settings';
import { integrationsOf } from '../services/integrations/config';
import { einvoiceJson, ewayJson } from '../services/integrations/gst-json';
import { shareUrl, type ShareKind } from '../services/integrations/share';
import { anyPermissionProcedure, authedProcedure, ownerProcedure, permissionProcedure, router } from '../trpc';

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const billing = permissionProcedure('CREATE_TAX_INVOICE');
const ledgerText = z.string().trim().min(1).max(80);

export const integrationsRouter = router({
  settings: anyPermissionProcedure('CREATE_TAX_INVOICE', 'VIEW_ANALYTICS').query(async ({ ctx }) => integrationsOf(await getSettings(ctx.db))),
  updateSettings: ownerProcedure.input(z.object({
    tally: z.object({ companyName: z.string().trim().max(120), salesLedger: ledgerText, interstateSalesLedger: ledgerText, salesReturnLedger: ledgerText, cgstLedger: ledgerText, sgstLedger: ledgerText, igstLedger: ledgerText, roundOffLedger: ledgerText, bankLedger: ledgerText, cashLedger: ledgerText, customerGroup: ledgerText }),
    eInvoice: z.object({ enabled: z.boolean() }),
    ewayBill: z.object({ thresholdValue: z.coerce.number().min(0).max(10_00_00_000) }),
  })).mutation(async ({ ctx, input }) => {
    await getSettings(ctx.db);
    await ctx.db.companySettings.update({ where: { id: 'company' }, data: { integrationConfig: input as unknown as Prisma.InputJsonValue } });
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'settings.integrations', entityType: 'CompanySettings', entityId: 'company', ip: ctx.ip, summary: 'Updated Tally / e-invoice / e-way bill settings' });
    return { ok: true };
  }),

  /** e-invoice JSON for one document, with anything the IRP would reject. */
  einvoice: billing.input(z.object({ kind: z.enum(['invoice', 'credit-note']), id: z.string() })).query(({ ctx, input }) => einvoiceJson(ctx.db, input.kind, input.id)),

  /** All B2B invoices and credit notes in a period that still need an IRN (for bulk upload). */
  einvoiceBulk: anyPermissionProcedure('CREATE_TAX_INVOICE', 'VIEW_ANALYTICS').input(z.object({ from: iso, to: iso })).query(async ({ ctx, input }) => {
    const range = { gte: dayToDate(input.from)!, lte: dayToDate(input.to)! };
    const [inv, cn] = await Promise.all([
      ctx.db.invoice.findMany({ where: { date: range, status: 'ISSUED', irn: null }, select: { id: true, buyerSnapshot: true }, orderBy: [{ date: 'asc' }, { number: 'asc' }] }),
      ctx.db.creditNote.findMany({ where: { date: range, irn: null }, select: { id: true, buyerSnapshot: true }, orderBy: [{ date: 'asc' }, { number: 'asc' }] }),
    ]);
    const b2b = (s: unknown) => !!(s as { gstin?: string | null })?.gstin;
    const docs = await Promise.all([...inv.filter((x) => b2b(x.buyerSnapshot)).map((x) => einvoiceJson(ctx.db, 'invoice', x.id)), ...cn.filter((x) => b2b(x.buyerSnapshot)).map((x) => einvoiceJson(ctx.db, 'credit-note', x.id))]);
    return { documents: docs.map((d) => d.json), problems: docs.filter((d) => d.issues.length).map((d) => ({ number: d.number, issues: d.issues })) };
  }),

  /** Record the IRN, acknowledgement and signed QR returned by the IRP; they print on the PDF. */
  recordIrn: billing.input(z.object({
    kind: z.enum(['invoice', 'credit-note']), id: z.string(),
    irn: z.string().trim().regex(/^[0-9a-fA-F]{64}$/, 'The IRN is 64 letters/digits'),
    ackNo: z.string().trim().regex(/^\d{10,20}$/, 'Acknowledgement number is 10–20 digits'),
    ackDate: iso, signedQr: z.string().trim().min(20, 'Paste the signed QR code text').max(4000),
  })).mutation(async ({ ctx, input }) => {
    const data = { irn: input.irn.toLowerCase(), ackNo: input.ackNo, ackDate: dayToDate(input.ackDate), signedQr: input.signedQr };
    const doc = input.kind === 'invoice' ? await ctx.db.invoice.update({ where: { id: input.id }, data, select: { number: true } }) : await ctx.db.creditNote.update({ where: { id: input.id }, data, select: { number: true } });
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'einvoice.irn', entityType: input.kind === 'invoice' ? 'Invoice' : 'CreditNote', entityId: input.id, ip: ctx.ip, summary: `IRN recorded for ${doc.number} (ack ${input.ackNo})` });
    return { ok: true };
  }),

  eway: billing.input(z.object({
    invoiceId: z.string(), transMode: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), distanceKm: z.coerce.number().min(0).max(5000),
    transporterId: z.string().trim().max(15).optional().nullable(), transporterName: z.string().trim().max(100).optional().nullable(),
    vehicleNo: z.string().trim().max(15).optional().nullable(), transDocNo: z.string().trim().max(15).optional().nullable(), transDocDate: iso.optional().nullable(),
  })).query(({ ctx, input }) => ewayJson(ctx.db, input.invoiceId, input)),

  recordEway: billing.input(z.object({ invoiceId: z.string(), ewayBillNo: z.string().trim().regex(/^\d{12}$/, 'The e-way bill number is 12 digits'), ewayBillDate: iso })).mutation(async ({ ctx, input }) => {
    const i = await ctx.db.invoice.update({ where: { id: input.invoiceId }, data: { ewayBillNo: input.ewayBillNo, ewayBillDate: dayToDate(input.ewayBillDate) }, select: { number: true } });
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'eway.record', entityType: 'Invoice', entityId: input.invoiceId, ip: ctx.ip, summary: `E-way bill ${input.ewayBillNo} recorded for ${i.number}` });
    return { ok: true };
  }),

  /**
   * A signed link (valid 15 days) to one PDF, for sending on WhatsApp or email. Staff need the
   * matching permission; customers can share only their own documents.
   */
  shareLink: authedProcedure.input(z.object({ kind: z.enum(['invoice', 'proforma', 'credit-note', 'purchase-order', 'statement']), id: z.string() })).mutation(async ({ ctx, input }) => {
    const u = ctx.user;
    const k = input.kind as ShareKind;
    let customerId: string | null = null;
    let contact: { name: string; mobile: string | null; email: string | null } | null = null;
    let title = '';
    if (k === 'purchase-order') {
      if (!can(u, 'CREATE_PURCHASE_ORDERS')) throw new TRPCError({ code: 'FORBIDDEN' });
      const p = await ctx.db.purchaseOrder.findUnique({ where: { id: input.id }, include: { supplier: true } });
      if (!p) throw new TRPCError({ code: 'NOT_FOUND' });
      contact = { name: p.supplier.contactPerson ?? p.supplier.name, mobile: p.supplier.mobile, email: p.supplier.email };
      title = `Purchase order ${p.number}`;
    } else {
      const doc = k === 'statement' ? { customerId: input.id, label: 'Statement of account' }
        : k === 'invoice' ? await ctx.db.invoice.findUnique({ where: { id: input.id }, select: { customerId: true, number: true } }).then((d) => d && { customerId: d.customerId, label: `Tax invoice ${d.number}` })
          : k === 'proforma' ? await ctx.db.proforma.findUnique({ where: { id: input.id }, select: { customerId: true, number: true } }).then((d) => d && { customerId: d.customerId, label: `Proforma ${d.number}` })
            : await ctx.db.creditNote.findUnique({ where: { id: input.id }, select: { customerId: true, number: true } }).then((d) => d && { customerId: d.customerId, label: `Credit note ${d.number}` });
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND' });
      customerId = doc.customerId;
      title = doc.label;
      const staffOk = k === 'proforma' ? can(u, 'CREATE_PROFORMA') : k === 'statement' ? can(u, 'RECORD_PAYMENTS') || can(u, 'MANAGE_CUSTOMERS') : can(u, 'CREATE_TAX_INVOICE') || can(u, 'RECORD_PAYMENTS');
      if (u.role === 'CUSTOMER' ? u.customerId !== customerId : !staffOk) throw new TRPCError({ code: 'FORBIDDEN' });
      const c = await ctx.db.customer.findUnique({ where: { id: customerId }, select: { name: true, contactPerson: true, mobile: true, email: true } });
      contact = c ? { name: c.contactPerson ?? c.name, mobile: c.mobile, email: c.email } : null;
    }
    const url = shareUrl(k, input.id);
    await logActivity(ctx.db, { actorId: u.id, action: 'document.share', entityType: k, entityId: input.id, ip: ctx.ip, summary: `Share link created for ${title}` });
    return { url, title, contact, expiresInDays: 15, today: isoDay(new Date()) };
  }),
});
