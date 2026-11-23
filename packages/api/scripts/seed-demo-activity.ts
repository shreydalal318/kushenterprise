/**
 * Demo sales and purchasing for development and UAT (never run in production): orders in every status,
 * tax invoices (intra- and inter-state, back-dated so ageing has something to show), one
 * cancelled invoice, a proforma, payments (full, part, on account), a credit note, and purchase
 * orders (sent & partly received, received, draft from reorder suggestions, cancelled).
 * Runs through the real API procedures, so every figure is computed exactly as in the app.
 * Safe to re-run: finished steps are skipped. Needs `pnpm db:seed:demo` (masters + opening stock) first.
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';
config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

const { addDays, financialYear, istDateString } = await import('@kush/core');
const { prisma } = await import('@kush/db');
const { createSession } = await import('../src/auth/session');
const { createCaller } = await import('../src/root');
const { createContext } = await import('../src/trpc');

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Refusing to load demo data in production (pass --force if you really mean it).');
  process.exit(1);
}

const today = istDateString();
const fyStart = `${financialYear(today).slice(0, 4)}-04-01`;
/** n days ago, but never before 1 April of this financial year. */
const ago = (n: number) => { const d = addDays(today, -n); return d < fyStart ? fyStart : d; };

async function ownerApi() {
  const owner = await prisma.user.findFirst({ where: { role: 'OWNER', isActive: true }, orderBy: { createdAt: 'asc' } });
  if (!owner) throw new Error('No owner account; run pnpm db:seed first.');
  const { token } = await createSession(prisma, owner.id, { client: 'web' });
  return createCaller(await createContext({ headers: new Headers({ cookie: `ke_session=${token}`, 'user-agent': 'seed-demo' }) }));
}

async function seedSales() {
  // Every step is keyed (clientRequestId / reference), so a re-run resumes instead of duplicating.
  // Real (non-demo) invoices mean this is not a demo database: leave it alone.
  if (await prisma.proforma.count({ where: { terms: { contains: '[demo]' } } })) { console.log('Demo sales already loaded.'); return; }
  if (await prisma.invoice.count({ where: { OR: [{ clientRequestId: null }, { NOT: { clientRequestId: { startsWith: 'demo-' } } }] } })) { console.log('Demo sales skipped: the database already has invoices.'); return; }
  if (!(await prisma.customer.count({ where: { name: 'Drishti Eye Care Clinic' } }))) { console.log('Demo sales skipped: run pnpm db:seed:demo first.'); return; }
  const owner = await prisma.user.findFirst({ where: { role: 'OWNER', isActive: true }, orderBy: { createdAt: 'asc' } });
  if (!owner) throw new Error('No owner account; run pnpm db:seed first.');

  // Tax type depends on the company's state. Until the real profile is entered, the demo uses Gujarat.
  const settings = await prisma.companySettings.findUniqueOrThrow({ where: { id: 'company' } });
  if (!(await prisma.state.findUnique({ where: { code: settings.stateCode } }))) {
    await prisma.companySettings.update({ where: { id: 'company' }, data: { stateCode: '24' } });
    console.log('Demo: company state set to Gujarat (24). Change it in Settings → Company profile.');
  }

  const { token } = await createSession(prisma, owner.id, { client: 'web' });
  const api = createCaller(await createContext({ headers: new Headers({ cookie: `ke_session=${token}`, 'user-agent': 'seed-demo-sales' }) }));

  const customers = await prisma.customer.findMany({ select: { id: true, name: true } });
  const cust = (prefix: string) => customers.find((c) => c.name.startsWith(prefix))!.id;
  const staff = await prisma.user.findFirst({ where: { email: 'ravi.counter@demo.local' }, select: { id: true } });

  const taken = new Set<string>();
  /** A sale line for `code`: the n-th stocked power for lenses (with serials), else FEFO. */
  async function line(code: string, qty: number, nth = 0) {
    const bals = await prisma.stockBalance.findMany({
      where: { qty: { gt: 0 }, variant: { product: { code } } },
      include: { variant: { include: { product: true } }, batch: true },
      orderBy: [{ variant: { powerSph: 'asc' } }, { batch: { expiryDate: 'asc' } }],
    });
    const fresh = bals.filter((b) => !b.batch.expiryDate || b.batch.expiryDate.toISOString().slice(0, 10) > today);
    const variantIds = [...new Set(fresh.map((b) => b.variantId))];
    const variantId = variantIds[nth % variantIds.length]!;
    const product = fresh.find((b) => b.variantId === variantId)!.variant.product;
    if (!product.trackSerial) return { variantId, qty };
    const units = await prisma.serialUnit.findMany({ where: { status: 'IN_STOCK', batch: { variantId }, serialNo: { notIn: [...taken] } }, take: qty, orderBy: { serialNo: 'asc' } });
    units.forEach((u) => taken.add(u.serialNo));
    return { variantId, qty: units.length, serialNos: units.map((u) => u.serialNo) };
  }

  // ---------- Stand-alone counter invoices, back-dated for ageing ----------
  const inv = async (customer: string, date: string, lines: Awaited<ReturnType<typeof line>>[], extra: Record<string, string> = {}) =>
    api.invoices.create({ customerId: cust(customer), date, clientRequestId: `demo-${customer.slice(0, 6)}-${date}`, lines, ...extra });

  const i1 = await inv('Drishti', ago(75), [await line('LV-HA600', 4, 1), await line('VG-SH14', 10), await line('PE-CK22', 10)], { buyersOrderNo: 'DEC/PO/118' });
  const i2 = await inv('Netra Jyoti', ago(70), [await line('OC-T300', 2, 2), await line('LV-HA600P', 6, 3), await line('VG-BSS500', 6)], { buyersOrderNo: 'NJ/2026/0441' });
  const i3 = await inv('District Government', ago(40), [await line('LV-PM100', 10), await line('VG-TB06', 20), await line('PE-KR28', 20)]);
  const i4 = await inv('Nayan', ago(35), [await line('LV-HA600', 3, 4), await line('TX-CF01', 1)]);
  const i5 = await inv('Sankara', ago(20), [await line('OC-TV3', 2, 1), await line('PE-CTR12', 4)]);
  const i7 = await inv('ClearView', ago(12), [await line('VG-SH14', 5)]);
  const i6 = await inv('Dr. Kavita', ago(6), [await line('LV-ED50', 2, 2), await line('PE-SP15', 5)]);

  // ---------- Payments: full, part, on account ----------
  const due = async (id: string) => (await api.invoices.get({ id })).grandTotal;
  const pay = async (input: Parameters<typeof api.payments.record>[0]) => {
    if (!(await prisma.payment.findFirst({ where: { reference: input.reference ?? '' } }))) await api.payments.record(input);
  };
  await pay({ customerId: cust('Drishti'), date: ago(60), amount: await due(i1.id), mode: 'NEFT_RTGS', reference: 'UTR SBIN0426118842', autoAllocate: true });
  await pay({ customerId: cust('Netra Jyoti'), date: ago(45), amount: 25000, mode: 'CHEQUE', reference: 'Chq 004417, HDFC', autoAllocate: true });
  await pay({ customerId: cust('Sankara'), date: ago(8), amount: Math.ceil((await due(i5.id)) / 1000) * 1000 + 5000, mode: 'NEFT_RTGS', reference: 'UTR CNRB0526907731', note: 'Advance for next order included', autoAllocate: true });
  await pay({ customerId: cust('District Government'), date: ago(10), amount: 10000, mode: 'UPI', reference: 'UPI 6241 8830 1127', allocations: [{ invoiceId: i3.id, amount: 10000 }] });

  // ---------- Cancelled invoice and a credit note ----------
  if ((await api.invoices.get({ id: i7.id })).status !== 'CANCELLED') await api.invoices.cancel({ id: i7.id, reason: 'Billed to the wrong clinic' });
  const d6 = await api.invoices.get({ id: i6.id });
  const knifeLine = d6.lines.find((l) => l.serialNos.length === 0)!;
  if (!(await prisma.creditNote.count({ where: { invoiceId: i6.id } }))) await api.creditNotes.create({ invoiceId: i6.id, date: ago(2), reason: 'Two knives returned unopened', restock: true, lines: [{ invoiceLineId: knifeLine.id, qty: 2, serialNos: [] }] });

  // ---------- Orders in every status ----------
  let seq = 0;
  /** Returns null when this demo order already exists (an earlier, interrupted run). */
  const order = async (customer: string, lines: { variantId: string; qty: number }[], extra: Record<string, unknown> = {}) => {
    const r = await api.orders.create({ customerId: cust(customer), lines, assignedToId: staff?.id ?? null, clientRequestId: `demo-order-${++seq}`, ...extra });
    return (r as { duplicate?: boolean }).duplicate ? null : { id: r.id };
  };
  const plain = async (code: string, qty: number, nth = 0) => { const l = await line(code, qty, nth); return { variantId: l.variantId, qty: l.qty }; };
  const move = (id: string, status: 'CONFIRMED' | 'PACKED' | 'DISPATCHED' | 'DELIVERED' | 'ON_HOLD' | 'CANCELLED', extra: Record<string, unknown> = {}) => api.orders.setStatus({ id, status, ...extra });

  await order('Netra Jyoti', [await plain('LV-HA600', 2, 5), await plain('LV-HA600', 2, 6), await plain('VG-SH14', 6)], { forDoctorId: cust('Dr. Meera'), patientName: 'Mrs. S. Gokhale', surgeryDate: addDays(today, 3), customerNote: 'Please send before Thursday OT list' });
  const oConfirmed = await order('Drishti', [await plain('OC-T200', 1, 1), await plain('PE-CAN27', 10)]);
  if (oConfirmed) await move(oConfirmed.id, 'CONFIRMED');
  const oHold = await order('Nayan', [await plain('LV-HA600P', 3, 2)], { customerNote: 'Urgent' });
  if (oHold) await move(oHold.id, 'ON_HOLD', { note: 'Waiting for the overdue payment' });
  const oPacked = await order('Dr. Sameer', [await plain('TX-PC01', 1), await plain('TX-SG01', 1)]);
  if (oPacked) { await move(oPacked.id, 'CONFIRMED'); await move(oPacked.id, 'PACKED'); }
  const oCancelled = await order('Dr. Sameer', [await plain('OC-KERA', 1)]);
  if (oCancelled) await move(oCancelled.id, 'CANCELLED', { note: 'Customer bought locally' });

  // Dispatched and delivered orders: invoice raised from the order (locked rates), then shipped.
  for (const [customer, items, status, courier] of [
    ['District Government', [['LV-PM100', 6], ['VG-TB06', 10]], 'DISPATCHED', 'Shree Maruti Courier'],
    ['ClearView', [['LV-HA600', 2, 7], ['PE-CAN27', 10]], 'DELIVERED', 'DTDC'],
  ] as const) {
    const picked = await Promise.all(items.map(([c, q, n]) => line(c, q, n)));
    const o = await order(customer, picked.map((l) => ({ variantId: l.variantId, qty: l.qty })));
    if (!o) continue;
    await move(o.id, 'CONFIRMED');
    const invLines = picked; // the serials picked for the order go out on its invoice
    await api.invoices.create({ customerId: cust(customer), orderId: o.id, date: today, clientRequestId: `demo-order-inv-${seq}`, lines: invLines.map((l) => ({ ...l, discPct: 0 })) });
    await move(o.id, 'PACKED');
    await move(o.id, 'DISPATCHED', { dispatch: { courier, docketNo: `D${Math.floor(1e8 + Math.random() * 9e8)}`, dispatchDate: today } });
    if (status === 'DELIVERED') await move(o.id, 'DELIVERED');
  }

  // ---------- A proforma awaiting the customer's go-ahead ----------
  const pf = await api.proformas.create({ customerId: cust('Sankara'), forDoctorId: cust('Dr. Arvind'), date: ago(3), lines: [{ variantId: (await plain('OC-TV3', 4, 3)).variantId, qty: 4, discPct: 0 }, { variantId: (await plain('VG-SH14', 20)).variantId, qty: 20, discPct: 5 }], terms: 'Rates valid for 15 days. Delivery within 3 working days of PO. [demo]' });
  await api.proformas.markSent({ id: pf.id });

  const counts = await Promise.all([prisma.invoice.count(), prisma.salesOrder.count(), prisma.payment.count(), prisma.creditNote.count()]);
  console.log(`Demo sales ready: ${counts[0]} invoices (1 cancelled), ${counts[1]} orders, ${counts[2]} payments, ${counts[3]} credit note, 1 proforma. Unpaid: ${[i2, i3, i4, i6].map((i) => i.number).join(', ')}.`);
}

/** Demo purchase orders: sent and partly received, received in full, a draft from reorder suggestions, a cancelled one. */
async function seedPurchasing() {
  if (await prisma.purchaseOrder.count({ where: { note: { contains: '[demo]' } } })) { console.log('Demo purchase orders already loaded.'); return; }
  if (await prisma.purchaseOrder.count()) { console.log('Demo purchase orders skipped: the database already has purchase orders.'); return; }
  const sup = async (prefix: string) => (await prisma.supplier.findFirst({ where: { name: { startsWith: prefix } } }))?.id;
  const [vis, clr, prc] = [await sup('Visiona'), await sup('ClearSight'), await sup('Precisa')];
  if (!vis || !clr || !prc) { console.log('Demo purchase orders skipped: run pnpm db:seed:demo first.'); return; }
  const api = await ownerApi();
  const variant = async (code: string, nth = 0) => (await prisma.productVariant.findMany({ where: { product: { code }, isActive: true }, orderBy: [{ powerSph: 'asc' }, { cylinder: 'asc' }], skip: nth, take: 1 }))[0]!.id;
  const today = istDateString();

  // 1. Lenses and gel from Visiona: sent 9 days ago, the first delivery came in short.
  const lensA = await variant('LV-HA600', 16); // +18.0 D
  const lensB = await variant('LV-HA600', 18); // +19.0 D
  const gel = await variant('VG-SH14');
  const po1 = await api.purchaseOrders.create({ supplierId: vis, date: ago(9), expectedDate: addDays(today, 2), note: 'Monthly IOL top-up [demo]', lines: [{ variantId: lensA, qty: 6, discPct: 0 }, { variantId: lensB, qty: 6, discPct: 0 }, { variantId: gel, qty: 30, discPct: 5 }] });
  await api.purchaseOrders.markSent({ id: po1.id });
  await api.inventory.createGrn({ supplierId: vis, poId: po1.id, date: ago(2), supplierInvoiceNo: 'VMD/26-27/3318', supplierInvoiceDate: ago(3), lines: [
    { variantId: lensA, batchNo: 'HA6E2611A', expiryDate: addDays(today, 900), serialNos: Array.from({ length: 6 }, (_, i) => `HA6E2611A${String(201 + i).padStart(5, '0')}`), qty: 6 },
    { variantId: gel, batchNo: 'VGSH2609', expiryDate: addDays(today, 540), qty: 20 },
  ] });

  // 2. Instruments from Precisa: received in full.
  const knife = await variant('PE-CK22');
  const keratome = await variant('PE-KR28');
  const po2 = await api.purchaseOrders.create({ supplierId: prc, date: ago(20), expectedDate: ago(12), note: 'Knives for OT season [demo]', lines: [{ variantId: knife, qty: 50, discPct: 0 }, { variantId: keratome, qty: 50, discPct: 0 }] });
  await api.purchaseOrders.markSent({ id: po2.id });
  await api.inventory.createGrn({ supplierId: prc, poId: po2.id, date: ago(13), supplierInvoiceNo: 'PSI/1187', supplierInvoiceDate: ago(14), lines: [
    { variantId: knife, batchNo: 'CK2226B', expiryDate: addDays(today, 1000), qty: 50 },
    { variantId: keratome, batchNo: 'KR2826B', expiryDate: addDays(today, 1000), qty: 50 },
  ] });

  // 3. A draft to ClearSight built from the reorder suggestions.
  const sugg = (await api.purchaseOrders.suggestions({ supplierId: clr })).slice(0, 6);
  if (sugg.length) await api.purchaseOrders.create({ supplierId: clr, date: today, expectedDate: addDays(today, 10), note: 'From reorder suggestions [demo]', lines: sugg.map((r) => ({ variantId: r.variantId, qty: r.suggestedQty, discPct: 0 })) });

  // 4. Cancelled before it was sent.
  const po4 = await api.purchaseOrders.create({ supplierId: clr, date: ago(5), note: 'Duplicate of an earlier order [demo]', lines: [{ variantId: await variant('OC-T300', 5), qty: 2, discPct: 0 }] });
  await api.purchaseOrders.cancel({ id: po4.id, reason: 'Raised twice by mistake' });
  console.log(`Demo purchase orders ready: ${await prisma.purchaseOrder.count()} (sent & partly received, received, draft, cancelled).`);
}

async function main() {
  await seedSales();
  await seedPurchasing();
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
