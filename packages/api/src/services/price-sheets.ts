import { TRPCError } from '@trpc/server';
import type { Db } from '@kush/db';
import { buildPriceWorkbook, parsePriceWorkbook, type PriceSheetRow, type SheetMode } from './excel';
import { isoDay, num } from './num';
import { customerPriceSheet } from './pricing';

export type SheetTarget = { customerId: string } | { priceListId: string };

/** Build the .xlsx for a customer's special prices or a price list. */
export async function exportPriceSheet(db: Db, target: SheetTarget): Promise<{ filename: string; body: Buffer }> {
  if ('customerId' in target) {
    const sheet = await customerPriceSheet(db, target.customerId, { includeCost: false });
    const rows: PriceSheetRow[] = sheet.rows.map((r) => ({
      code: r.code, name: r.name, category: r.category, brand: r.brand, unit: r.unit, mrp: r.mrp, defaultRate: r.defaultRate,
      listRate: r.listRate?.rate ?? null, rate: r.override?.rate ?? null, validFrom: r.override?.validFrom ?? null, validTo: r.override?.validTo ?? null, note: r.override?.note ?? null,
    }));
    const body = await buildPriceWorkbook({ mode: 'customer', title: `Special prices: ${sheet.customer.name} (${sheet.customer.code})`, rows });
    return { filename: `prices-${sheet.customer.code}.xlsx`, body };
  }
  const list = await db.priceList.findUnique({ where: { id: target.priceListId } });
  if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'Price list not found' });
  const [products, items] = await Promise.all([
    db.product.findMany({ where: { deletedAt: null }, orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }], include: { category: true, brand: true } }),
    db.priceListItem.findMany({ where: { priceListId: list.id } }),
  ]);
  const byProduct = new Map(items.map((i) => [i.productId, i]));
  const rows: PriceSheetRow[] = products.map((p) => {
    const i = byProduct.get(p.id);
    return {
      code: p.code, name: p.name, category: p.category.name, brand: p.brand?.name ?? null, unit: p.unit, mrp: num(p.mrp), defaultRate: num(p.defaultRate),
      rate: i ? num(i.rate) : null, validFrom: isoDay(i?.validFrom), validTo: isoDay(i?.validTo),
    };
  });
  const body = await buildPriceWorkbook({ mode: 'list', title: `Price list: ${list.name}`, rows });
  return { filename: `price-list-${list.name.replace(/[^\w-]+/g, '-').toLowerCase()}.xlsx`, body };
}

export interface ImportChange {
  productId: string;
  code: string;
  name: string;
  oldRate: number | null;
  newRate: number | null;
  validFrom: string | null;
  validTo: string | null;
  note: string | null;
  aboveMrp: boolean;
}

/** Parse an uploaded sheet and compare it with what is saved now. Nothing is written here. */
export async function previewPriceImport(db: Db, target: SheetTarget, file: Buffer) {
  const mode: SheetMode = 'customerId' in target ? 'customer' : 'list';
  const parsed = await parsePriceWorkbook(file, mode);
  const codes = [...new Set(parsed.rows.map((r) => r.code))];
  const products = await db.product.findMany({ where: { code: { in: codes }, deletedAt: null }, select: { id: true, code: true, name: true, mrp: true } });
  const byCode = new Map(products.map((p) => [p.code, p]));
  const current = 'customerId' in target
    ? await db.customerPrice.findMany({ where: { customerId: target.customerId, productId: { in: products.map((p) => p.id) } } })
    : await db.priceListItem.findMany({ where: { priceListId: target.priceListId, productId: { in: products.map((p) => p.id) } } });
  const cur = new Map(current.map((c) => [c.productId, c]));

  const errors = [...parsed.errors];
  const changes: ImportChange[] = [];
  let unchanged = 0;
  for (const r of parsed.rows) {
    const p = byCode.get(r.code);
    if (!p) { errors.push({ rowNo: r.rowNo, message: `${r.code}: no product with this code` }); continue; }
    const c = cur.get(p.id);
    const note = 'note' in (c ?? {}) ? ((c as { note: string | null }).note ?? null) : null;
    const same = c
      ? r.rate === num(c.rate) && r.validFrom === isoDay(c.validFrom) && r.validTo === isoDay(c.validTo) && (mode === 'list' || r.note === note)
      : r.rate === null;
    if (same) { unchanged++; continue; }
    changes.push({
      productId: p.id, code: p.code, name: p.name, oldRate: c ? num(c.rate) : null, newRate: r.rate,
      validFrom: r.validFrom, validTo: r.validTo, note: r.note, aboveMrp: r.rate !== null && r.rate > num(p.mrp),
    });
  }
  return { changes, errors, unchanged, totalRows: parsed.rows.length };
}
