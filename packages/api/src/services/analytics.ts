/**
 * Owner dashboard, sales & margin analytics and statutory reports. Sales are the taxable value
 * (before GST) of issued invoices, less credit notes (returns), on the document date.
 * Cancelled invoices never count.
 */
import { addDays, AGEING_BUCKETS, istDateString, round2, stateByCode } from '@kush/core';
import type { Db } from '@kush/db';
import { dayToDate, isoDay, num } from './num';
import { getSettings } from './settings';
import { receivables } from './sales/ledger';
import { costOf, reorderLevelOf } from './stock';

export interface Range { from: string; to: string }
const dayRange = (r: Range) => ({ gte: dayToDate(r.from)!, lte: dayToDate(r.to)! });
const days = (r: Range) => Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000) + 1;

/** Monday-start week and calendar month, both to date (IST). */
export function periods(today = istDateString()) {
  const d = new Date(`${today}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return {
    today: { from: today, to: today },
    week: { from: addDays(today, -dow), to: today },
    month: { from: `${today.slice(0, 8)}01`, to: today },
  };
}

/** Invoice and credit-note lines in a range, with what each line sold, cost, and to whom. */
async function salesLines(db: Db, r: Range) {
  const [inv, cn] = await Promise.all([
    db.invoiceLine.findMany({
      where: { invoice: { status: 'ISSUED', date: dayRange(r) } },
      select: {
        qty: true, amount: true, costAtSale: true,
        invoice: { select: { date: true, customerId: true, createdById: true } },
        variant: { select: { productId: true, product: { select: { code: true, name: true, categoryId: true, brandId: true, purchaseCost: true } } } },
      },
    }),
    db.creditNoteLine.findMany({
      where: { creditNote: { date: dayRange(r) } },
      select: {
        qty: true, amount: true, invoiceLineId: true,
        creditNote: { select: { date: true, customerId: true, createdById: true } },
        variant: { select: { productId: true, product: { select: { code: true, name: true, categoryId: true, brandId: true, purchaseCost: true } } } },
      },
    }),
  ]);
  const costs = new Map((await db.invoiceLine.findMany({ where: { id: { in: cn.map((c) => c.invoiceLineId).filter((x): x is string => !!x) } }, select: { id: true, costAtSale: true } })).map((l) => [l.id, num(l.costAtSale)]));
  type L = { date: string; customerId: string; userId: string; productId: string; code: string; name: string; categoryId: string; brandId: string | null; qty: number; sales: number; cost: number };
  const out: L[] = [];
  for (const l of inv) {
    const p = l.variant.product;
    const unit = l.costAtSale == null ? num(p.purchaseCost) : num(l.costAtSale);
    out.push({ date: isoDay(l.invoice.date)!, customerId: l.invoice.customerId, userId: l.invoice.createdById, productId: l.variant.productId, code: p.code, name: p.name, categoryId: p.categoryId, brandId: p.brandId, qty: l.qty, sales: num(l.amount), cost: unit * l.qty });
  }
  for (const l of cn) {
    const p = l.variant.product;
    const unit = (l.invoiceLineId && costs.get(l.invoiceLineId)) ?? num(p.purchaseCost);
    out.push({ date: isoDay(l.creditNote.date)!, customerId: l.creditNote.customerId, userId: l.creditNote.createdById, productId: l.variant.productId, code: p.code, name: p.name, categoryId: p.categoryId, brandId: p.brandId, qty: -l.qty, sales: -num(l.amount), cost: -unit * l.qty });
  }
  return out;
}

function group<T>(rows: T[], key: (r: T) => string, init: (r: T) => Record<string, unknown>) {
  const m = new Map<string, Record<string, unknown> & { qty: number; sales: number; cost: number; invoices?: number }>();
  for (const r of rows as (T & { qty: number; sales: number; cost: number })[]) {
    const k = key(r);
    const cur = m.get(k) ?? { ...init(r), qty: 0, sales: 0, cost: 0 };
    cur.qty += r.qty; cur.sales += r.sales; cur.cost += r.cost;
    m.set(k, cur);
  }
  return [...m.values()].map((v) => ({ ...v, sales: round2(v.sales), cost: round2(v.cost), margin: round2(v.sales - v.cost), marginPct: v.sales ? round2(((v.sales - v.cost) / v.sales) * 100) : 0 }));
}

/** Daily net sales for a range (every day present, zero when nothing was sold). */
function daily(lines: { date: string; sales: number }[], r: Range) {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.date, (m.get(l.date) ?? 0) + l.sales);
  return Array.from({ length: days(r) }, (_, i) => { const d = addDays(r.from, i); return { date: d, sales: round2(m.get(d) ?? 0) }; });
}

async function totalsFor(db: Db, r: Range) {
  const [lines, orders, invoices, payments] = await Promise.all([
    salesLines(db, r),
    db.salesOrder.count({ where: { createdAt: { gte: new Date(`${r.from}T00:00:00+05:30`), lte: new Date(`${r.to}T23:59:59.999+05:30`) } } }),
    db.invoice.count({ where: { status: 'ISSUED', date: dayRange(r) } }),
    db.payment.aggregate({ where: { date: dayRange(r) }, _sum: { amount: true } }),
  ]);
  return { sales: round2(lines.reduce((t, l) => t + l.sales, 0)), orders, invoices, received: num(payments._sum.amount ?? 0) };
}

/** Owner dashboard. Money values that reveal cost (stock value) are left out unless `showCost`. */
export async function ownerDashboard(db: Db, opts: { showCost: boolean; today?: string }) {
  const today = opts.today ?? istDateString();
  const p = periods(today);
  const trend: Range = { from: addDays(today, -29), to: today };
  const prev: Range = { from: addDays(today, -59), to: addDays(today, -30) };
  const prevMonthTo = addDays(p.month.from, -1);
  const prevMonth: Range = { from: `${prevMonthTo.slice(0, 8)}01`, to: addDays(`${prevMonthTo.slice(0, 8)}01`, Math.min(days(p.month), days({ from: `${prevMonthTo.slice(0, 8)}01`, to: prevMonthTo })) - 1) };
  const [t, w, m, pm, trendLines, prevLines, byStatus, rec, stock] = await Promise.all([
    totalsFor(db, p.today), totalsFor(db, p.week), totalsFor(db, p.month), totalsFor(db, prevMonth),
    salesLines(db, trend), salesLines(db, prev),
    db.salesOrder.groupBy({ by: ['status'], where: { status: { in: ['PLACED', 'CONFIRMED', 'PACKED', 'ON_HOLD', 'DISPATCHED'] } }, _count: true }),
    receivables(db),
    stockHealth(db, today),
  ]);
  const ageing = Object.fromEntries(AGEING_BUCKETS.map((b) => [b, round2(rec.reduce((s, r) => s + (r.ageing[b] ?? 0), 0))]));
  return {
    today, periods: p,
    tiles: { today: t, week: w, month: m, prevMonthToDate: pm },
    outstanding: round2(rec.reduce((s, r) => s + Math.max(0, r.outstanding), 0)),
    overdue: round2(rec.reduce((s, r) => s + r.overdue, 0)),
    trend: { current: daily(trendLines, trend), previous: daily(prevLines, prev) },
    pendingOrders: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    stock: { ...stock, value: opts.showCost ? stock.value : null, expiringValue: opts.showCost ? stock.expiringValue : null },
    ageing,
    topOverdue: rec.filter((r) => r.overdue > 0).sort((a, b) => b.overdue - a.overdue).slice(0, 5).map((r) => ({ customerId: r.customerId, name: r.name, overdue: r.overdue, outstanding: r.outstanding })),
  };
}

/** Stock counts (and value at cost) for the dashboard. */
export async function stockHealth(db: Db, today = istDateString()) {
  const s = await getSettings(db);
  const window = Math.max(...(s.expiryAlertDays.length ? s.expiryAlertDays : [90]));
  const limit = new Date(`${addDays(today, window)}T00:00:00Z`);
  const now = new Date(`${today}T00:00:00Z`);
  const [balances, variants, stocked] = await Promise.all([
    db.stockBalance.findMany({ where: { qty: { gt: 0 } }, include: { batch: { select: { expiryDate: true, unitCost: true } }, variant: { select: { purchaseCost: true, product: { select: { purchaseCost: true } } } } } }),
    db.productVariant.findMany({ where: { isActive: true, deletedAt: null, product: { isActive: true, deletedAt: null } }, select: { id: true, reorderLevel: true, product: { select: { reorderLevel: true, isLens: true } } } }),
    db.stockMovement.groupBy({ by: ['variantId'] }),
  ]);
  const qty = new Map<string, number>();
  let value = 0, expiringValue = 0, expiringUnits = 0, expiredUnits = 0;
  for (const b of balances) {
    qty.set(b.variantId, (qty.get(b.variantId) ?? 0) + b.qty);
    const v = b.qty * costOf(b.batch, b.variant);
    value += v;
    const e = b.batch.expiryDate;
    if (e && e < now) expiredUnits += b.qty;
    else if (e && e <= limit) { expiringValue += v; expiringUnits += b.qty; }
  }
  const ever = new Set(stocked.map((x) => x.variantId));
  let low = 0, out = 0;
  for (const v of variants) {
    const q = qty.get(v.id) ?? 0;
    const level = reorderLevelOf(v, s.defaultReorderLevel);
    if (q <= 0) { if (ever.has(v.id) || (!v.product.isLens && v.reorderLevel != null)) out++; } else if (q <= level) low++;
  }
  return { value: round2(value), lowCount: low, outCount: out, expiringUnits, expiringValue: round2(expiringValue), expiredUnits, expiryWindowDays: window };
}

/** Staff home: what needs doing, counts only (no money). */
export async function staffHome(db: Db, userId: string) {
  const today = istDateString();
  // The counter's two steps: make the tax invoice (placed or confirmed), then dispatch (packed = invoiced).
  const [mine, toInvoice, toDispatch, stock] = await Promise.all([
    db.salesOrder.findMany({ where: { assignedToId: userId, status: { in: ['PLACED', 'CONFIRMED', 'PACKED', 'ON_HOLD'] } }, orderBy: { createdAt: 'asc' }, take: 20, include: { customer: { select: { name: true } }, lines: { select: { qty: true } } } }),
    db.salesOrder.count({ where: { status: { in: ['PLACED', 'CONFIRMED'] } } }),
    db.salesOrder.count({ where: { status: 'PACKED' } }),
    stockHealth(db, today),
  ]);
  return {
    myOrders: mine.map((o) => ({ id: o.id, number: o.number, status: o.status, customer: o.customer.name, units: o.lines.reduce((t, l) => t + l.qty, 0), surgeryDate: isoDay(o.surgeryDate), createdAt: o.createdAt })),
    toInvoice, toDispatch, lowCount: stock.lowCount, outCount: stock.outCount, expiringUnits: stock.expiringUnits, expiredUnits: stock.expiredUnits, expiryWindowDays: stock.expiryWindowDays,
  };
}

/** Sales analytics: top products and customers; by category, brand and employee; daily trend. */
export async function salesAnalytics(db: Db, r: Range, opts: { showMargin: boolean }) {
  const lines = await salesLines(db, r);
  const [customers, categories, brands, users] = await Promise.all([
    db.customer.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.customerId))] } }, select: { id: true, name: true, code: true, type: true } }),
    db.category.findMany({ select: { id: true, name: true } }),
    db.brand.findMany({ select: { id: true, name: true } }),
    db.user.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.userId))] } }, select: { id: true, name: true } }),
  ]);
  const cName = new Map(customers.map((c) => [c.id, c]));
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const br = new Map(brands.map((b) => [b.id, b.name]));
  const us = new Map(users.map((u) => [u.id, u.name]));
  const strip = <T extends { cost: number; margin: number; marginPct: number }>(rows: T[]) => (opts.showMargin ? rows : rows.map(({ cost: _c, margin: _m, marginPct: _p, ...rest }) => rest));
  const sortBy = <T extends { sales: number }>(rows: T[]) => rows.sort((a, b) => b.sales - a.sales);
  const total = round2(lines.reduce((t, l) => t + l.sales, 0));
  const cost = round2(lines.reduce((t, l) => t + l.cost, 0));
  return {
    range: r,
    total, units: lines.reduce((t, l) => t + l.qty, 0),
    margin: opts.showMargin ? { cost, margin: round2(total - cost), pct: total ? round2(((total - cost) / total) * 100) : 0 } : null,
    daily: daily(lines, r),
    products: strip(sortBy(group(lines, (l) => l.productId, (l) => ({ id: l.productId, code: l.code, name: l.name })))),
    customers: strip(sortBy(group(lines, (l) => l.customerId, (l) => ({ id: l.customerId, name: cName.get(l.customerId)?.name ?? '?', code: cName.get(l.customerId)?.code ?? '', type: cName.get(l.customerId)?.type ?? '' })))),
    categories: strip(sortBy(group(lines, (l) => l.categoryId, (l) => ({ id: l.categoryId, name: cat.get(l.categoryId) ?? '?' })))),
    brands: strip(sortBy(group(lines, (l) => l.brandId ?? '-', (l) => ({ id: l.brandId ?? '-', name: l.brandId ? br.get(l.brandId) ?? '?' : 'No brand' })))),
    employees: strip(sortBy(group(lines, (l) => l.userId, (l) => ({ id: l.userId, name: us.get(l.userId) ?? '?' })))),
  };
}

// ------------------------------------------------------------------ statutory reports

/** Sales register: every invoice (and credit note as a negative row) with its tax split. */
export async function salesRegister(db: Db, r: Range) {
  const [inv, cn] = await Promise.all([
    db.invoice.findMany({ where: { date: dayRange(r) }, orderBy: [{ date: 'asc' }, { number: 'asc' }], include: { customer: { select: { name: true, gstin: true } } } }),
    db.creditNote.findMany({ where: { date: dayRange(r) }, orderBy: [{ date: 'asc' }, { number: 'asc' }], include: { customer: { select: { name: true, gstin: true } }, invoice: { select: { number: true } } } }),
  ]);
  const rows = [
    ...inv.map((i) => {
      const cancelled = i.status === 'CANCELLED';
      const z = (d: unknown) => (cancelled ? 0 : num(d as never));
      return {
        kind: 'Invoice' as const, date: isoDay(i.date)!, number: i.number, customer: i.customer.name, gstin: i.customer.gstin ?? '', placeOfSupply: `${i.placeOfSupply}-${stateByCode(i.placeOfSupply)?.name ?? ''}`,
        taxable: z(i.taxableTotal), cgst: z(i.cgstTotal), sgst: z(i.sgstTotal), igst: z(i.igstTotal), roundOff: z(i.roundOff), total: z(i.grandTotal),
        status: cancelled ? `Cancelled: ${i.cancelReason ?? ''}` : 'Issued', against: '',
      };
    }),
    ...cn.map((c) => ({
      kind: 'Credit note' as const, date: isoDay(c.date)!, number: c.number, customer: c.customer.name, gstin: c.customer.gstin ?? '', placeOfSupply: `${c.placeOfSupply}-${stateByCode(c.placeOfSupply)?.name ?? ''}`,
      taxable: -num(c.taxableTotal), cgst: -num(c.cgstTotal), sgst: -num(c.sgstTotal), igst: -num(c.igstTotal), roundOff: -num(c.roundOff), total: -num(c.grandTotal),
      status: c.reason, against: c.invoice?.number ?? '',
    })),
  ].sort((a, b) => (a.date === b.date ? a.number.localeCompare(b.number) : a.date < b.date ? -1 : 1));
  const sum = (k: 'taxable' | 'cgst' | 'sgst' | 'igst' | 'roundOff' | 'total') => round2(rows.reduce((t, x) => t + x[k], 0));
  return { range: r, rows, totals: { taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), roundOff: sum('roundOff'), total: sum('total') } };
}

/**
 * GST summary in the shape of GSTR-1: B2B invoices (buyer has a GSTIN) rate-wise, B2C summary by
 * place of supply and rate, credit notes, and the HSN summary. Uses the line-level tax stored
 * on each document, so it always matches the invoices.
 */
export async function gstSummary(db: Db, r: Range) {
  const [lines, cnLines] = await Promise.all([
    db.invoiceLine.findMany({
      where: { invoice: { status: 'ISSUED', date: dayRange(r) } },
      select: { qty: true, unit: true, hsnCode: true, description: true, gstRate: true, amount: true, cgstAmount: true, sgstAmount: true, igstAmount: true,
        invoice: { select: { id: true, number: true, date: true, placeOfSupply: true, grandTotal: true, buyerSnapshot: true, customer: { select: { name: true } } } } },
    }),
    db.creditNoteLine.findMany({
      where: { creditNote: { date: dayRange(r) } },
      select: { qty: true, unit: true, hsnCode: true, description: true, gstRate: true, amount: true, cgstAmount: true, sgstAmount: true, igstAmount: true,
        creditNote: { select: { id: true, number: true, date: true, placeOfSupply: true, grandTotal: true, buyerSnapshot: true, customer: { select: { name: true } }, invoice: { select: { number: true, date: true } } } } },
    }),
  ]);
  const gstinOf = (snap: unknown) => ((snap as { gstin?: string | null } | null)?.gstin ?? '').trim();
  const pos = (c: string) => `${c}-${stateByCode(c)?.name ?? ''}`;
  type Acc = { taxable: number; cgst: number; sgst: number; igst: number };
  const add = (a: Acc, l: { amount: unknown; cgstAmount: unknown; sgstAmount: unknown; igstAmount: unknown }, sign = 1) => {
    a.taxable += sign * num(l.amount as never); a.cgst += sign * num(l.cgstAmount as never); a.sgst += sign * num(l.sgstAmount as never); a.igst += sign * num(l.igstAmount as never);
  };
  const fin = <T extends Acc>(a: T) => ({ ...a, taxable: round2(a.taxable), cgst: round2(a.cgst), sgst: round2(a.sgst), igst: round2(a.igst) });

  // B2B: one row per invoice + rate
  const b2b = new Map<string, Acc & { gstin: string; receiver: string; number: string; date: string; invoiceValue: number; placeOfSupply: string; rate: number }>();
  const b2c = new Map<string, Acc & { placeOfSupply: string; rate: number }>();
  for (const l of lines) {
    const g = gstinOf(l.invoice.buyerSnapshot);
    const rate = num(l.gstRate);
    if (g) {
      const k = `${l.invoice.id}|${rate}`;
      const cur = b2b.get(k) ?? { gstin: g, receiver: l.invoice.customer.name, number: l.invoice.number, date: isoDay(l.invoice.date)!, invoiceValue: num(l.invoice.grandTotal), placeOfSupply: pos(l.invoice.placeOfSupply), rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      add(cur, l); b2b.set(k, cur);
    } else {
      const k = `${l.invoice.placeOfSupply}|${rate}`;
      const cur = b2c.get(k) ?? { placeOfSupply: pos(l.invoice.placeOfSupply), rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      add(cur, l); b2c.set(k, cur);
    }
  }
  const cdn = new Map<string, Acc & { gstin: string; receiver: string; number: string; date: string; against: string; againstDate: string; noteValue: number; placeOfSupply: string; rate: number; registered: boolean }>();
  for (const l of cnLines) {
    const g = gstinOf(l.creditNote.buyerSnapshot);
    const rate = num(l.gstRate);
    const k = `${l.creditNote.id}|${rate}`;
    const cur = cdn.get(k) ?? { gstin: g, receiver: l.creditNote.customer.name, number: l.creditNote.number, date: isoDay(l.creditNote.date)!, against: l.creditNote.invoice?.number ?? '', againstDate: isoDay(l.creditNote.invoice?.date) ?? '', noteValue: num(l.creditNote.grandTotal), placeOfSupply: pos(l.creditNote.placeOfSupply), rate, registered: !!g, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    add(cur, l); cdn.set(k, cur);
  }
  // HSN summary (net of credit notes), by HSN + rate + unit as GSTR-1 table 12 expects
  const hsn = new Map<string, Acc & { hsn: string; description: string; uqc: string; rate: number; qty: number; totalValue: number }>();
  for (const [l, sign] of [...lines.map((x) => [x, 1] as const), ...cnLines.map((x) => [x, -1] as const)]) {
    const rate = num(l.gstRate);
    const k = `${l.hsnCode}|${rate}|${l.unit}`;
    const cur = hsn.get(k) ?? { hsn: l.hsnCode, description: l.description, uqc: l.unit.toUpperCase() === 'PCS' ? 'PCS-PIECES' : l.unit.toUpperCase(), rate, qty: 0, totalValue: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    add(cur, l, sign); cur.qty += sign * l.qty;
    hsn.set(k, cur);
  }
  const hsnRows = [...hsn.values()].map((h) => { const f = fin(h); return { ...f, totalValue: round2(f.taxable + f.cgst + f.sgst + f.igst) }; }).sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate);
  const sum = (rows: Acc[]) => fin(rows.reduce((t, x) => ({ taxable: t.taxable + x.taxable, cgst: t.cgst + x.cgst, sgst: t.sgst + x.sgst, igst: t.igst + x.igst }), { taxable: 0, cgst: 0, sgst: 0, igst: 0 }));
  const b2bRows = [...b2b.values()].map(fin).sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  const b2cRows = [...b2c.values()].map(fin).sort((a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply) || a.rate - b.rate);
  const cdnRows = [...cdn.values()].map(fin).sort((a, b) => a.date.localeCompare(b.date));
  return {
    range: r,
    b2b: { rows: b2bRows, totals: sum(b2bRows), invoices: new Set(b2bRows.map((x) => x.number)).size },
    b2c: { rows: b2cRows, totals: sum(b2cRows) },
    creditNotes: { rows: cdnRows, totals: sum(cdnRows) },
    hsn: { rows: hsnRows, totals: sum(hsnRows) },
    net: (() => { const a = sum([...b2bRows, ...b2cRows]); const c = sum(cdnRows); return fin({ taxable: a.taxable - c.taxable, cgst: a.cgst - c.cgst, sgst: a.sgst - c.sgst, igst: a.igst - c.igst }); })(),
  };
}

/** Stock summary for a period: opening, received, issued, closing, per item (quantities only). */
export async function stockSummary(db: Db, r: Range) {
  const toEnd = new Date(`${addDays(r.to, 1)}T00:00:00+05:30`);
  const fromStart = new Date(`${r.from}T00:00:00+05:30`);
  const [before, during, variants] = await Promise.all([
    db.stockMovement.groupBy({ by: ['variantId'], where: { createdAt: { lt: fromStart } }, _sum: { qty: true } }),
    db.stockMovement.findMany({ where: { createdAt: { gte: fromStart, lt: toEnd } }, select: { variantId: true, qty: true, type: true } }),
    db.productVariant.findMany({ where: { movements: { some: {} } }, select: { id: true, sku: true, label: true, product: { select: { code: true, name: true, unit: true, category: { select: { name: true } } } } } }),
  ]);
  const open = new Map(before.map((b) => [b.variantId, b._sum.qty ?? 0]));
  const acc = new Map<string, { inward: number; outward: number; sales: number; purchases: number; returns: number; adjustments: number }>();
  for (const m of during) {
    const a = acc.get(m.variantId) ?? { inward: 0, outward: 0, sales: 0, purchases: 0, returns: 0, adjustments: 0 };
    if (m.qty > 0) a.inward += m.qty; else a.outward += -m.qty;
    if (m.type === 'SALE' || m.type === 'INVOICE_CANCEL') a.sales += -m.qty;
    else if (m.type === 'GRN' || m.type === 'OPENING' || m.type === 'PURCHASE_RETURN') a.purchases += m.qty;
    else if (m.type === 'SALES_RETURN') a.returns += m.qty;
    else a.adjustments += m.qty;
    acc.set(m.variantId, a);
  }
  return variants.map((v) => {
    const o = open.get(v.id) ?? 0;
    const a = acc.get(v.id) ?? { inward: 0, outward: 0, sales: 0, purchases: 0, returns: 0, adjustments: 0 };
    return { code: v.product.code, name: v.product.name, variant: v.label ?? '', sku: v.sku, category: v.product.category.name, unit: v.product.unit, opening: o, ...a, closing: o + a.inward - a.outward };
  }).filter((x) => x.opening || x.inward || x.outward).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.sku.localeCompare(b.sku));
}
