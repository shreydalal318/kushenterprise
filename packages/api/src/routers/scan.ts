import { TRPCError } from '@trpc/server';
import { istDateString, normalizeGtin, parseGs1, type Gs1Data } from '@kush/core';
import { Prisma } from '@kush/db';
import { mapAliasInput, scanInput } from '../schemas';
import { logActivity } from '../services/activity';
import { isoDay, num } from '../services/num';
import { fefoPick } from '../services/stock';
import { permissionProcedure, router, staffProcedure } from '../trpc';
import { z } from 'zod';

const linkInput = z.object({ variantId: z.string().min(1), code: z.string().trim().min(1).max(500).optional(), gtin: z.boolean().optional() });

const variantInclude = { product: { select: { id: true, code: true, name: true, unit: true, mrp: true, trackSerial: true, trackBatch: true, trackExpiry: true, isActive: true } } } as const;
type FoundVariant = Prisma.ProductVariantGetPayload<{ include: typeof variantInclude }>;

export type ScanWarning = 'EXPIRED' | 'OUT_OF_STOCK' | 'BATCH_NOT_IN_STOCK' | 'SERIAL_NOT_IN_STOCK' | 'INACTIVE' | 'NEAR_EXPIRY';

export const scanRouter = router({
  /**
   * Resolve any scanned code to a product variant (+ batch / serial when the code carries them)
   * with live stock. Items are scanned by the manufacturer's own barcode (no stickers), so the order
   * is: GS1 GTIN (AI 01) → plain EAN/UPC → a linked manufacturer code → a serial number. Our
   * internal item code (KE…) is also accepted when typed by hand. Kept to a few indexed queries
   * (< 300 ms).
   */
  resolve: staffProcedure.input(scanInput).query(async ({ ctx, input }) => {
    const started = performance.now();
    const code = input.code.trim();
    const parsed: Gs1Data | null = parseGs1(code);
    let v: FoundVariant | null = null;
    let via = '';
    let serialHit: { serialNo: string; batchId: string; status: string } | null = null;

    if (!parsed) {
      v = await ctx.db.productVariant.findUnique({ where: { barcode: code.toUpperCase() }, include: variantInclude });
      if (v) via = 'barcode';
    }
    const gtin = parsed?.gtin ?? (/^\d{8}$|^\d{12,14}$/.test(code) ? normalizeGtin(code) : null);
    if (!v && gtin) {
      v = await ctx.db.productVariant.findUnique({ where: { gtin }, include: variantInclude });
      if (v) via = parsed ? 'gs1' : 'gtin';
    }
    if (!v) {
      const alias = await ctx.db.barcodeAlias.findUnique({ where: { code }, include: { variant: { include: variantInclude } } });
      if (alias) { v = alias.variant; via = 'alias'; }
    }
    if (!v && !parsed && code.length >= 4) {
      const unit = await ctx.db.serialUnit.findFirst({
        where: { serialNo: code.toUpperCase() },
        orderBy: { updatedAt: 'desc' },
        include: { batch: { include: { variant: { include: variantInclude } } } },
      });
      if (unit) { v = unit.batch.variant; via = 'serial'; serialHit = { serialNo: unit.serialNo, batchId: unit.batchId, status: unit.status }; }
    }

    if (!v) return { found: false as const, code, parsed, gtin, ms: Math.round(performance.now() - started) };

    const today = istDateString();
    const balances = await ctx.db.stockBalance.findMany({
      where: { variantId: v.id, qty: { gt: 0 }, ...(input.locationId ? { locationId: input.locationId } : {}) },
      include: { batch: { select: { batchNo: true, expiryDate: true } }, location: { select: { id: true, name: true } } },
    });
    const batches = balances
      .map((b) => ({ batchId: b.batchId, batchNo: b.batch.batchNo, expiryDate: isoDay(b.batch.expiryDate), location: b.location, qty: b.qty, available: b.qty - b.reserved }))
      .sort((a, b) => ((a.expiryDate ?? '9999') < (b.expiryDate ?? '9999') ? -1 : 1));
    const total = batches.reduce((t, b) => t + b.qty, 0);

    // The batch the code points at: from the GS1 batch (AI 10) or the serial's batch.
    let batch: { batchId: string | null; batchNo: string; expiryDate: string | null; qty: number } | null = null;
    const wantBatchNo = parsed?.batch?.toUpperCase();
    if (serialHit) {
      const b = await ctx.db.batch.findUnique({ where: { id: serialHit.batchId } });
      batch = { batchId: serialHit.batchId, batchNo: b!.batchNo, expiryDate: isoDay(b!.expiryDate), qty: batches.find((x) => x.batchId === serialHit!.batchId)?.qty ?? 0 };
    } else if (wantBatchNo) {
      const b = await ctx.db.batch.findUnique({ where: { variantId_batchNo: { variantId: v.id, batchNo: wantBatchNo } } });
      batch = { batchId: b?.id ?? null, batchNo: wantBatchNo, expiryDate: parsed?.expiry ?? isoDay(b?.expiryDate), qty: b ? batches.filter((x) => x.batchId === b.id).reduce((t, x) => t + x.qty, 0) : 0 };
    }
    let serial = serialHit;
    if (!serial && parsed?.serial && batch?.batchId) {
      const u = await ctx.db.serialUnit.findUnique({ where: { batchId_serialNo: { batchId: batch.batchId, serialNo: parsed.serial.toUpperCase() } } });
      serial = { serialNo: parsed.serial.toUpperCase(), batchId: batch.batchId, status: u?.status ?? 'UNKNOWN' };
    }

    const warnings: ScanWarning[] = [];
    if (!v.isActive || !v.product.isActive) warnings.push('INACTIVE');
    if (total === 0) warnings.push('OUT_OF_STOCK');
    const exp = batch?.expiryDate;
    if (exp && exp < today) warnings.push('EXPIRED');
    else if (exp && Date.parse(exp) - Date.parse(today) <= 30 * 86_400_000) warnings.push('NEAR_EXPIRY');
    if (batch && batch.qty === 0 && total > 0) warnings.push('BATCH_NOT_IN_STOCK');
    if (serial && serial.status !== 'IN_STOCK') warnings.push('SERIAL_NOT_IN_STOCK');

    const suggested = batch ? null : (await fefoPick(ctx.db, v.id, 1, { locationId: input.locationId })).picks[0] ?? null;
    return {
      found: true as const, code, via, parsed, gtin,
      variant: { id: v.id, sku: v.sku, label: v.label, barcode: v.barcode, gtin: v.gtin, mrp: num(v.mrp ?? v.product.mrp) },
      product: { id: v.product.id, code: v.product.code, name: v.product.name, unit: v.product.unit, trackSerial: v.product.trackSerial, trackBatch: v.product.trackBatch, trackExpiry: v.product.trackExpiry },
      batch, serial, stock: { total, batches }, suggested, warnings, ms: Math.round(performance.now() - started),
    };
  }),

  /** Teach the system an unknown barcode once. A GS1/EAN GTIN is stored on the variant itself. */
  mapAlias: permissionProcedure('MANAGE_PRODUCTS').input(mapAliasInput).mutation(async ({ ctx, input }) => {
    const v = await ctx.db.productVariant.findUnique({ where: { id: input.variantId }, include: { product: { select: { name: true } } } });
    if (!v) throw new TRPCError({ code: 'NOT_FOUND' });
    const parsed = parseGs1(input.code);
    const gtin = parsed?.gtin ?? (/^\d{8}$|^\d{12,14}$/.test(input.code) ? normalizeGtin(input.code) : null);
    try {
      if (gtin) {
        if (v.gtin && v.gtin !== gtin) throw new TRPCError({ code: 'CONFLICT', message: `This variant already has GTIN ${v.gtin}` });
        await ctx.db.productVariant.update({ where: { id: v.id }, data: { gtin } });
      } else {
        await ctx.db.barcodeAlias.create({ data: { code: input.code, variantId: v.id, createdById: ctx.user.id } });
      }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new TRPCError({ code: 'CONFLICT', message: 'That code is already linked to another item' });
      throw e;
    }
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'barcode.map', entityType: 'ProductVariant', entityId: v.id, summary: `${gtin ? `GTIN ${gtin}` : `Code ${input.code}`} → ${v.product.name} ${v.label ?? ''}`, ip: ctx.ip });
    return { stored: gtin ? 'gtin' : 'alias', gtin };
  }),

  /** Remove a linked barcode from a variant (a GTIN, or one linked manufacturer code). */
  unlink: permissionProcedure('MANAGE_PRODUCTS').input(linkInput).mutation(async ({ ctx, input }) => {
    const v = await ctx.db.productVariant.findUnique({ where: { id: input.variantId }, include: { product: { select: { name: true } } } });
    if (!v) throw new TRPCError({ code: 'NOT_FOUND' });
    if (input.gtin) {
      await ctx.db.productVariant.update({ where: { id: v.id }, data: { gtin: null } });
    } else if (input.code) {
      const a = await ctx.db.barcodeAlias.findUnique({ where: { code: input.code } });
      if (!a || a.variantId !== v.id) throw new TRPCError({ code: 'NOT_FOUND', message: 'That code is not linked to this item' });
      await ctx.db.barcodeAlias.delete({ where: { code: a.code } });
    } else {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nothing to unlink' });
    }
    await logActivity(ctx.db, { actorId: ctx.user.id, action: 'barcode.unlink', entityType: 'ProductVariant', entityId: v.id, summary: `Unlinked ${input.gtin ? `GTIN ${v.gtin}` : `code ${input.code}`} from ${v.product.name} ${v.label ?? ''}`, ip: ctx.ip });
    return { ok: true };
  }),
});
