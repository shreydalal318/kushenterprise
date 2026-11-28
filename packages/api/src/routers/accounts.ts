import { TRPCError } from '@trpc/server';
import { ACCOUNT_GROUPS, accountGroup, can, isCashBankGroup, round2, VOUCHER_TYPE_LABEL } from '@kush/core';
import type { Ledger } from '@kush/db';
import { z } from 'zod';
import {
  ledgerCreateInput, ledgerListInput, ledgerReportInput, ledgerUpdateInput, manualVoucherInput, purchaseBillInput, purchaseBillListInput,
  supplierPaymentInput, supplierPaymentListInput, trialBalanceInput, voucherCancelInput, voucherListInput,
} from '../schemas';
import { cancelPurchaseBill, createPurchaseBill, createSupplierPayment } from '../services/accounts/payables';
import { dayBook, ledgerBalances, ledgerReport, trialBalance } from '../services/accounts/reports';
import { syncAccounts } from '../services/accounts/sync';
import { cancelManualVoucher, createManualVoucher } from '../services/accounts/vouchers';
import { diff, logActivity } from '../services/activity';
import { dayToDate, isoDay, num } from '../services/num';
import { anyPermissionProcedure, ownerProcedure, permissionProcedure, router } from '../trpc';

// Reports and balances need VIEW_ACCOUNTS; entering needs MANAGE_ACCOUNTS (and the ledger / bill lists to pick from).
const view = permissionProcedure('VIEW_ACCOUNTS');
const manage = permissionProcedure('MANAGE_ACCOUNTS');
const viewOrManage = anyPermissionProcedure('VIEW_ACCOUNTS', 'MANAGE_ACCOUNTS');
const tx60 = { timeout: 60_000 };
const dateRange = (from?: string, to?: string) => (from || to ? { gte: dayToDate(from ?? null) ?? undefined, lte: dayToDate(to ?? null) ?? undefined } : undefined);

/** What a ledger is and what may be changed: party ledgers follow their customer / supplier; system ledgers keep their group. */
function ledgerView(l: Ledger, closing: number | null) {
  const g = accountGroup(l.group);
  const party = !!(l.customerId || l.supplierId);
  const cashBank = isCashBankGroup(l.group);
  return {
    id: l.id, name: l.name, group: l.group, groupName: g?.name ?? l.group, nature: g?.nature ?? null, systemKey: l.systemKey,
    customerId: l.customerId, supplierId: l.supplierId, kind: l.systemKey ? ('SYSTEM' as const) : party ? ('PARTY' as const) : ('MANUAL' as const),
    openingBalance: num(l.openingBalance), closing, isActive: l.isActive, bankAccountNo: l.bankAccountNo, bankIfsc: l.bankIfsc, note: l.note,
    isCashBank: cashBank, canRename: !party && (!l.systemKey || cashBank), canChangeGroup: !party && !l.systemKey,
  };
}

const ledgersRouter = router({
  list: viewOrManage.input(ledgerListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db.ledger.findMany({
      where: {
        ...(input?.includeInactive ? {} : { isActive: true }),
        ...(input?.group ? { group: input.group } : {}),
        ...(input?.cashBank ? { group: { in: ['CASH_IN_HAND', 'BANK_ACCOUNTS'] } } : {}),
        ...(input?.q ? { name: { contains: input.q, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
    });
    const bal = can(ctx.user, 'VIEW_ACCOUNTS') ? await ledgerBalances(ctx.db) : null;
    return rows.map((l) => ledgerView(l, bal ? round2(num(l.openingBalance) + (bal.get(l.id) ?? 0)) : null));
  }),

  get: view.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const l = await ctx.db.ledger.findUnique({ where: { id: input.id } });
    if (!l) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ledger not found' });
    const sum = await ctx.db.voucherEntry.aggregate({ where: { ledgerId: l.id, voucher: { cancelled: false } }, _sum: { amount: true } });
    return ledgerView(l, round2(num(l.openingBalance) + num(sum._sum.amount)));
  }),

  create: manage.input(ledgerCreateInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      if (await tx.ledger.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } }, select: { id: true } })) throw new TRPCError({ code: 'CONFLICT', message: `A ledger named ${input.name} exists` });
      const bank = input.group === 'BANK_ACCOUNTS';
      const l = await tx.ledger.create({ data: { ...input, bankAccountNo: bank ? input.bankAccountNo : null, bankIfsc: bank ? input.bankIfsc : null } });
      await logActivity(tx, { actorId: ctx.user.id, action: 'ledger.create', entityType: 'Ledger', entityId: l.id, ip: ctx.ip, summary: `Ledger ${l.name} under ${accountGroup(l.group)?.name}${input.openingBalance ? `, opening ₹${Math.abs(input.openingBalance)} ${input.openingBalance > 0 ? 'Dr' : 'Cr'}` : ''}` });
      return ledgerView(l, num(l.openingBalance));
    })),

  update: manage.input(ledgerUpdateInput).mutation(({ ctx, input }) =>
    ctx.db.$transaction(async (tx) => {
      const { id, ...data } = input;
      const before = await tx.ledger.findUnique({ where: { id } });
      if (!before) throw new TRPCError({ code: 'NOT_FOUND' });
      const v = ledgerView(before, null);
      if (data.group !== before.group && !v.canChangeGroup) throw new TRPCError({ code: 'BAD_REQUEST', message: `The group of ${before.name} is fixed` });
      if (data.name !== before.name) {
        if (v.kind === 'PARTY') throw new TRPCError({ code: 'BAD_REQUEST', message: `${before.name} follows its ${before.customerId ? 'customer' : 'supplier'}; rename it there` });
        if (!v.canRename) throw new TRPCError({ code: 'BAD_REQUEST', message: `${before.name} is used by the app; its name can't change` });
        if (await tx.ledger.findFirst({ where: { id: { not: id }, name: { equals: data.name, mode: 'insensitive' } }, select: { id: true } })) throw new TRPCError({ code: 'CONFLICT', message: `A ledger named ${data.name} exists` });
      }
      if (!data.isActive && before.systemKey) throw new TRPCError({ code: 'BAD_REQUEST', message: `${before.name} is used by the app and can't be made inactive` });
      const bank = data.group === 'BANK_ACCOUNTS';
      const patch = { ...data, bankAccountNo: bank ? data.bankAccountNo : null, bankIfsc: bank ? data.bankIfsc : null };
      const l = await tx.ledger.update({ where: { id }, data: patch });
      const d = diff({ ...before, openingBalance: num(before.openingBalance) } as unknown as Record<string, unknown>, patch);
      if (d.changed.length) await logActivity(tx, { actorId: ctx.user.id, action: 'ledger.update', entityType: 'Ledger', entityId: id, ip: ctx.ip, summary: `Ledger ${l.name}: ${d.changed.join(', ')}`, before: d.before, after: d.after });
      return ledgerView(l, null);
    })),
});

const vouchersRouter = router({
  /** Day book: vouchers in a date range (default today), optionally of one type or touching one ledger. */
  list: view.input(voucherListInput).query(({ ctx, input }) => dayBook(ctx.db, input ?? {})),

  get: view.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const v = await ctx.db.voucher.findUnique({ where: { id: input.id }, include: { entries: { orderBy: { sl: 'asc' }, include: { ledger: { select: { id: true, name: true, group: true } } } }, partyLedger: { select: { id: true, name: true } } } });
    if (!v) throw new TRPCError({ code: 'NOT_FOUND' });
    const by = v.createdById ? (await ctx.db.user.findUnique({ where: { id: v.createdById }, select: { name: true } }))?.name ?? null : null;
    return {
      id: v.id, type: v.type, vchType: VOUCHER_TYPE_LABEL[v.type], number: v.number, date: isoDay(v.date)!, narration: v.narration, amount: num(v.amount),
      party: v.partyLedger, sourceType: v.sourceType, sourceId: v.sourceId, manual: !v.sourceType,
      cancelled: v.cancelled, cancelReason: v.cancelReason, cancelledAt: v.cancelledAt, createdBy: by, createdAt: v.createdAt,
      entries: v.entries.map((e) => ({ sl: e.sl, ledgerId: e.ledger.id, ledger: e.ledger.name, group: e.ledger.group, amount: num(e.amount), debit: Math.max(0, num(e.amount)), credit: Math.max(0, -num(e.amount)), billRef: e.billRef })),
    };
  }),

  create: manage.input(manualVoucherInput).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => createManualVoucher(tx, input, ctx.user, ctx.ip), tx60)),
  cancel: ownerProcedure.input(voucherCancelInput).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => cancelManualVoucher(tx, input.id, input.reason, ctx.user, ctx.ip))),
});

const purchaseBillsRouter = router({
  list: viewOrManage.input(purchaseBillListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db.purchaseBill.findMany({
      where: {
        ...(input?.supplierId ? { supplierId: input.supplierId } : {}), billDate: dateRange(input?.from, input?.to),
        ...(input?.status === 'UNPAID' ? { status: 'ISSUED' as const } : input?.status ? { status: input.status } : {}),
        ...(input?.q ? { OR: [{ number: { contains: input.q, mode: 'insensitive' } }, { billNo: { contains: input.q, mode: 'insensitive' } }, { supplier: { name: { contains: input.q, mode: 'insensitive' } } }] } : {}),
      },
      orderBy: [{ billDate: 'desc' }, { createdAt: 'desc' }], take: input?.limit ?? 200,
      include: { supplier: { select: { id: true, name: true } } },
    });
    const out = rows.map((b) => ({
      id: b.id, number: b.number, billNo: b.billNo, billDate: isoDay(b.billDate), dueDate: isoDay(b.dueDate), supplier: b.supplier, status: b.status,
      total: num(b.grandTotal), paid: num(b.amountPaid), due: b.status === 'CANCELLED' ? 0 : round2(num(b.grandTotal) - num(b.amountPaid)),
    }));
    return input?.status === 'UNPAID' ? out.filter((b) => b.due > 0) : out;
  }),

  get: viewOrManage.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const b = await ctx.db.purchaseBill.findUnique({
      where: { id: input.id },
      include: {
        supplier: { select: { id: true, code: true, name: true, stateCode: true } }, grn: { select: { id: true, number: true } },
        lines: { orderBy: { sl: 'asc' }, include: { ledger: { select: { id: true, name: true } } } },
        allocations: { include: { payment: { select: { id: true, number: true, date: true, mode: true } } } },
      },
    });
    if (!b) throw new TRPCError({ code: 'NOT_FOUND' });
    const voucher = await ctx.db.voucher.findUnique({ where: { sourceType_sourceId: { sourceType: 'PurchaseBill', sourceId: b.id } }, select: { id: true } });
    return {
      id: b.id, number: b.number, billNo: b.billNo, billDate: isoDay(b.billDate), dueDate: isoDay(b.dueDate), supplier: b.supplier, grn: b.grn, taxType: b.taxType, status: b.status,
      taxableTotal: num(b.taxableTotal), cgstTotal: num(b.cgstTotal), sgstTotal: num(b.sgstTotal), igstTotal: num(b.igstTotal), roundOff: num(b.roundOff), grandTotal: num(b.grandTotal),
      amountPaid: num(b.amountPaid), due: b.status === 'CANCELLED' ? 0 : round2(num(b.grandTotal) - num(b.amountPaid)), note: b.note, cancelReason: b.cancelReason, cancelledAt: b.cancelledAt,
      voucherId: voucher?.id ?? null,
      lines: b.lines.map((l) => ({ id: l.id, sl: l.sl, variantId: l.variantId, ledger: l.ledger, description: l.description, hsnCode: l.hsnCode, qty: l.qty == null ? null : num(l.qty), unit: l.unit, rate: num(l.rate), discPct: num(l.discPct), amount: num(l.amount), gstRate: num(l.gstRate), cgstAmount: num(l.cgstAmount), sgstAmount: num(l.sgstAmount), igstAmount: num(l.igstAmount) })),
      payments: b.allocations.map((a) => ({ id: a.payment.id, number: a.payment.number, date: isoDay(a.payment.date), mode: a.payment.mode, amount: num(a.amount) })),
    };
  }),

  create: manage.input(purchaseBillInput).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => createPurchaseBill(tx, input, ctx.user, ctx.ip), tx60)),
  cancel: ownerProcedure.input(voucherCancelInput).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => cancelPurchaseBill(tx, input.id, input.reason, ctx.user, ctx.ip))),
});

const supplierPaymentsRouter = router({
  list: viewOrManage.input(supplierPaymentListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db.supplierPayment.findMany({
      where: { ...(input?.supplierId ? { supplierId: input.supplierId } : {}), date: dateRange(input?.from, input?.to) },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: input?.limit ?? 200,
      include: { supplier: { select: { id: true, name: true } }, ledger: { select: { id: true, name: true } }, allocations: { include: { bill: { select: { id: true, number: true, billNo: true } } } } },
    });
    return rows.map((p) => {
      const allocated = round2(p.allocations.reduce((t, a) => t + num(a.amount), 0));
      return {
        id: p.id, number: p.number, date: isoDay(p.date), supplier: p.supplier, amount: num(p.amount), mode: p.mode, paidFrom: p.ledger, reference: p.reference,
        allocated, onAccount: round2(num(p.amount) - allocated), bills: p.allocations.map((a) => ({ ...a.bill, amount: num(a.amount) })),
      };
    });
  }),
  create: manage.input(supplierPaymentInput).mutation(({ ctx, input }) => ctx.db.$transaction((tx) => createSupplierPayment(tx, input, ctx.user, ctx.ip), tx60)),
});

const reportsRouter = router({
  ledger: view.input(ledgerReportInput).query(({ ctx, input }) => ledgerReport(ctx.db, input.ledgerId, input)),
  trialBalance: view.input(trialBalanceInput).query(({ ctx, input }) => trialBalance(ctx.db, input ?? {})),
});

export const accountsRouter = router({
  /** Tally's groups (static). */
  groups: viewOrManage.query(() => ACCOUNT_GROUPS),
  ledgers: ledgersRouter,
  vouchers: vouchersRouter,
  purchaseBills: purchaseBillsRouter,
  supplierPayments: supplierPaymentsRouter,
  reports: reportsRouter,
  /** Owner: create missing ledgers and post every document that has no voucher yet (idempotent). */
  sync: ownerProcedure.mutation(async ({ ctx }) => {
    const r = await syncAccounts(ctx.db);
    const n = Object.values(r.posted).reduce((t, x) => t + x, 0);
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'accounts.sync', entityType: 'Voucher', entityId: '-', ip: ctx.ip, summary: `Accounts brought up to date: ${n} voucher(s) posted, ${r.ledgersCreated} ledger(s) created${r.errors.length ? `, ${r.errors.length} document(s) could not post` : ''}` });
    return r;
  }),
});
