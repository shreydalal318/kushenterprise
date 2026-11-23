/**
 * Demo masters for development and UAT (idempotent; never run in production).
 * Adds 3 suppliers, 30 products (lens models with power variants + instruments/consumables),
 * 10 customers (doctors, hospitals, clinics), 2 price lists and some customer-specific prices.
 * All brand, company and person names are fictional. GST rates/HSN codes are illustrative.
 * Orders, invoices and a PO are added by the Phase 4/5 demo seeds.
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';
config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });
import { hash } from '@node-rs/argon2';
import { formatPower, variantLabel, variantSku, expandPowerRange, percentOff, normalizeIndianMobile } from '@kush/core';
import { Prisma, PrismaClient } from '@prisma/client';

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Refusing to load demo data in production (pass --force if you really mean it).');
  process.exit(1);
}

const prisma = new PrismaClient();

async function counter(key: string) {
  const r = await prisma.$queryRaw<{ value: number }[]>`INSERT INTO "Counter" ("key","value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1 RETURNING "value"`;
  return r[0]!.value;
}
const barcode = async () => `KE${String(await counter('barcode')).padStart(8, '0')}`;

type ProductSeed = {
  code: string; name: string; category: string; brand: string; hsn: string; gst: number; unit?: string;
  cost: number; rate: number; mrp: number; lens?: { type: 'MONOFOCAL' | 'TORIC' | 'MULTIFOCAL' | 'EDOF'; material: string; a: number; optic: number; len: number; preloaded?: boolean;
    range: { from: number; to: number; step: number; cylinders?: number[]; addPowers?: number[] } };
  serial?: boolean; expiry?: boolean; supplier: string;
};

const BRANDS = [
  ['LumaVue', 'Visiona Medical Devices'], ['OptiClear', 'ClearSight Optics'], ['PrecisaEdge', 'Precisa Surgical'],
  ['ViscoGel', 'BioVisc Labs'], ['Titanix', 'Titanix Instruments'],
] as const;

const SUPPLIERS = [
  { key: 'VIS', name: 'Visiona Medical Devices Pvt. Ltd.', addressLine1: 'Plot 14, MIDC Andheri East', city: 'Mumbai', pincode: '400093', stateCode: '27', contactPerson: 'Rohan Kulkarni', paymentTermsDays: 45 },
  { key: 'CLR', name: 'ClearSight Optics LLP', addressLine1: '22 Peenya Industrial Area, Phase 2', city: 'Bengaluru', pincode: '560058', stateCode: '29', contactPerson: 'Anitha Rao', paymentTermsDays: 30 },
  { key: 'PRC', name: 'Precisa Surgical Instruments', addressLine1: '7 SIDCO Industrial Estate, Guindy', city: 'Chennai', pincode: '600032', stateCode: '33', contactPerson: 'K. Senthil', paymentTermsDays: 30 },
];

const L = (type: NonNullable<ProductSeed['lens']>['type'], range: NonNullable<ProductSeed['lens']>['range'], extra: Partial<NonNullable<ProductSeed['lens']>> = {}) =>
  ({ type, material: 'Hydrophobic acrylic', a: 118.7, optic: 6, len: 13, range, ...extra });

const PRODUCTS: ProductSeed[] = [
  // ---- IOLs (8 models) ----
  { code: 'LV-HA600', name: 'LumaVue HA-600 Hydrophobic Acrylic Foldable IOL', category: 'IOL / Lens', brand: 'LumaVue', hsn: '90213900', gst: 5, cost: 1750, rate: 3250, mrp: 4500, serial: true, supplier: 'VIS', lens: L('MONOFOCAL', { from: 10, to: 30, step: 0.5 }) },
  { code: 'LV-HA600P', name: 'LumaVue HA-600 Preloaded IOL', category: 'IOL / Lens', brand: 'LumaVue', hsn: '90213900', gst: 5, cost: 2300, rate: 4200, mrp: 5800, serial: true, supplier: 'VIS', lens: L('MONOFOCAL', { from: 12, to: 28, step: 0.5 }, { preloaded: true }) },
  { code: 'LV-PM100', name: 'LumaVue PM-100 Rigid PMMA IOL', category: 'IOL / Lens', brand: 'LumaVue', hsn: '90213900', gst: 5, cost: 180, rate: 450, mrp: 750, serial: true, supplier: 'VIS', lens: L('MONOFOCAL', { from: 15, to: 25, step: 1 }, { material: 'PMMA', a: 118.4, optic: 5.5, len: 12.5 }) },
  { code: 'OC-T300', name: 'OptiClear T-Series Toric IOL, Preloaded', category: 'IOL / Lens', brand: 'OptiClear', hsn: '90213900', gst: 5, cost: 8200, rate: 14500, mrp: 19500, serial: true, supplier: 'CLR', lens: L('TORIC', { from: 18, to: 24, step: 0.5, cylinders: [1.5, 2.25, 3] }, { a: 119.0, preloaded: true }) },
  { code: 'OC-T200', name: 'OptiClear T-Series Toric IOL', category: 'IOL / Lens', brand: 'OptiClear', hsn: '90213900', gst: 5, cost: 6900, rate: 12500, mrp: 16500, serial: true, supplier: 'CLR', lens: L('TORIC', { from: 19, to: 23, step: 0.5, cylinders: [1.5, 2.25] }, { a: 119.0 }) },
  { code: 'OC-TV3', name: 'OptiClear TriVision Trifocal IOL', category: 'IOL / Lens', brand: 'OptiClear', hsn: '90213900', gst: 5, cost: 13500, rate: 22000, mrp: 29000, serial: true, supplier: 'CLR', lens: L('MULTIFOCAL', { from: 18, to: 26, step: 0.5, addPowers: [3.5] }, { a: 119.1 }) },
  { code: 'OC-BV2', name: 'OptiClear BiVision Bifocal IOL', category: 'IOL / Lens', brand: 'OptiClear', hsn: '90213900', gst: 5, cost: 9800, rate: 16500, mrp: 22000, serial: true, supplier: 'CLR', lens: L('MULTIFOCAL', { from: 18, to: 26, step: 0.5, addPowers: [3.25] }, { a: 119.1 }) },
  { code: 'LV-ED50', name: 'LumaVue ED-50 Extended Depth of Focus IOL', category: 'IOL / Lens', brand: 'LumaVue', hsn: '90213900', gst: 5, cost: 11000, rate: 18500, mrp: 24500, serial: true, supplier: 'VIS', lens: L('EDOF', { from: 16, to: 28, step: 0.5 }, { a: 118.9 }) },
  // ---- Consumables ----
  { code: 'VG-SH14', name: 'ViscoGel Sodium Hyaluronate 1.4% OVD, 1 ml PFS', category: 'Consumable', brand: 'ViscoGel', hsn: '30049099', gst: 5, cost: 210, rate: 420, mrp: 650, supplier: 'VIS' },
  { code: 'VG-HP2', name: 'ViscoGel HPMC 2% OVD, 3 ml PFS', category: 'Consumable', brand: 'ViscoGel', hsn: '30049099', gst: 5, cost: 85, rate: 180, mrp: 280, supplier: 'VIS' },
  { code: 'VG-TB06', name: 'Trypan Blue 0.06% Ophthalmic Solution, 1 ml', category: 'Consumable', brand: 'ViscoGel', hsn: '30049099', gst: 5, cost: 140, rate: 290, mrp: 420, supplier: 'VIS' },
  { code: 'VG-BSS500', name: 'Balanced Salt Solution (BSS), 500 ml', category: 'Consumable', brand: 'ViscoGel', hsn: '30049099', gst: 5, cost: 95, rate: 190, mrp: 260, supplier: 'VIS' },
  { code: 'PE-CK22', name: 'PrecisaEdge Crescent Knife 2.2 mm Angled (Single Use)', category: 'Consumable', brand: 'PrecisaEdge', hsn: '90185090', gst: 5, cost: 75, rate: 180, mrp: 250, supplier: 'PRC' },
  { code: 'PE-KR28', name: 'PrecisaEdge Main Port Keratome 2.8 mm (Single Use)', category: 'Consumable', brand: 'PrecisaEdge', hsn: '90185090', gst: 5, cost: 70, rate: 165, mrp: 230, supplier: 'PRC' },
  { code: 'PE-SP15', name: 'PrecisaEdge Side Port Knife 15° (Single Use)', category: 'Consumable', brand: 'PrecisaEdge', hsn: '90185090', gst: 5, cost: 60, rate: 140, mrp: 200, supplier: 'PRC' },
  { code: 'PE-CTR12', name: 'Capsular Tension Ring 12 mm', category: 'Consumable', brand: 'PrecisaEdge', hsn: '90213900', gst: 5, cost: 900, rate: 1800, mrp: 2600, serial: true, supplier: 'PRC' },
  { code: 'PE-CAN27', name: 'Hydrodissection Cannula 27G (Single Use)', category: 'Consumable', brand: 'PrecisaEdge', hsn: '90183290', gst: 5, cost: 25, rate: 60, mrp: 90, supplier: 'PRC' },
  // ---- Surgical instruments (reusable, no expiry) ----
  { code: 'TX-CF01', name: 'Titanium Capsulorhexis Forceps, Utrata Type', category: 'Surgical Instrument', brand: 'Titanix', hsn: '90185090', gst: 5, cost: 3600, rate: 6800, mrp: 9500, serial: true, expiry: false, supplier: 'PRC' },
  { code: 'TX-PC01', name: 'Phaco Chopper, Nagahara, Titanium', category: 'Surgical Instrument', brand: 'Titanix', hsn: '90185090', gst: 5, cost: 1900, rate: 3800, mrp: 5200, expiry: false, supplier: 'PRC' },
  { code: 'TX-LS01', name: 'Barraquer Wire Lid Speculum, Adult', category: 'Surgical Instrument', brand: 'Titanix', hsn: '90185090', gst: 5, cost: 650, rate: 1350, mrp: 1900, expiry: false, supplier: 'PRC' },
  { code: 'TX-IH01', name: 'IOL Holding Forceps, Angled', category: 'Surgical Instrument', brand: 'Titanix', hsn: '90185090', gst: 5, cost: 2100, rate: 4200, mrp: 5800, expiry: false, supplier: 'PRC' },
  { code: 'TX-SC01', name: 'Vannas Capsulotomy Scissors, Curved', category: 'Surgical Instrument', brand: 'Titanix', hsn: '90185090', gst: 5, cost: 2800, rate: 5400, mrp: 7500, expiry: false, supplier: 'PRC' },
  { code: 'TX-SG01', name: 'Sinskey Hook, Straight', category: 'Surgical Instrument', brand: 'Titanix', hsn: '90185090', gst: 5, cost: 420, rate: 900, mrp: 1300, expiry: false, supplier: 'PRC' },
  { code: 'TX-MF01', name: 'McPherson Tying Forceps, Angled', category: 'Surgical Instrument', brand: 'Titanix', hsn: '90185090', gst: 5, cost: 1500, rate: 3100, mrp: 4300, expiry: false, supplier: 'PRC' },
  { code: 'TX-CAL01', name: 'Castroviejo Caliper, 0–20 mm', category: 'Surgical Instrument', brand: 'Titanix', hsn: '90185090', gst: 5, cost: 1100, rate: 2300, mrp: 3200, expiry: false, supplier: 'PRC' },
  { code: 'TX-INJ01', name: 'Reusable IOL Injector, Titanium', category: 'Surgical Instrument', brand: 'Titanix', hsn: '90185090', gst: 5, cost: 5200, rate: 9800, mrp: 13500, serial: true, expiry: false, supplier: 'PRC' },
  { code: 'TX-SET12', name: 'Cataract Instrument Set (12 pcs) with Case', category: 'Surgical Instrument', brand: 'Titanix', hsn: '90185090', gst: 5, unit: 'set', cost: 21000, rate: 38500, mrp: 52000, serial: true, expiry: false, supplier: 'PRC' },
  // ---- Equipment ----
  { code: 'TX-TRAY', name: 'Instrument Sterilization Tray, Stainless Steel', category: 'Equipment', brand: 'Titanix', hsn: '73269099', gst: 18, cost: 1800, rate: 3400, mrp: 4800, expiry: false, supplier: 'PRC' },
  { code: 'OC-ASCAN', name: 'OptiClear A-Scan Biometer (Portable)', category: 'Equipment', brand: 'OptiClear', hsn: '90185010', gst: 5, cost: 145000, rate: 215000, mrp: 265000, serial: true, expiry: false, supplier: 'CLR' },
  { code: 'OC-KERA', name: 'OptiClear Handheld Keratometer', category: 'Equipment', brand: 'OptiClear', hsn: '90185010', gst: 5, cost: 52000, rate: 82000, mrp: 99000, serial: true, expiry: false, supplier: 'CLR' },
];

const CUSTOMERS = [
  { key: 'H1', type: 'HOSPITAL', name: 'Netra Jyoti Eye Hospital Pvt. Ltd.', city: 'Pune', pincode: '411001', stateCode: '27', contactPerson: 'Mr. Prakash Joshi (Purchase)', paymentTermsDays: 30, creditLimit: 500000, list: 'PVT' },
  { key: 'H2', type: 'HOSPITAL', name: 'Sankara Kiran Hospital Trust', city: 'Bengaluru', pincode: '560082', stateCode: '29', contactPerson: 'Central Pharmacy', paymentTermsDays: 45, creditLimit: 800000, list: 'GOVT' },
  { key: 'H3', type: 'HOSPITAL', name: 'District Government Eye Hospital', city: 'Vadodara', pincode: '390001', stateCode: '24', contactPerson: 'Medical Superintendent', paymentTermsDays: 60, creditLimit: 300000, list: 'GOVT' },
  { key: 'C1', type: 'CLINIC', name: 'Drishti Eye Care Clinic', city: 'Ahmedabad', pincode: '380009', stateCode: '24', contactPerson: 'Ms. Hetal Shah', paymentTermsDays: 15, creditLimit: 150000, list: 'PVT' },
  { key: 'C2', type: 'CLINIC', name: 'ClearView Phaco Centre', city: 'Surat', pincode: '395007', stateCode: '24', contactPerson: 'Dr. Nirav Patel', paymentTermsDays: 30, creditLimit: 200000, list: null },
  { key: 'C3', type: 'CLINIC', name: 'Nayan Eye Clinic', city: 'Nashik', pincode: '422005', stateCode: '27', contactPerson: 'Reception', paymentTermsDays: 15, creditLimit: 75000, list: 'PVT' },
  { key: 'D1', type: 'DOCTOR', name: 'Dr. Meera Iyer', city: 'Pune', pincode: '411004', stateCode: '27', parent: 'H1', paymentTermsDays: 30, list: null },
  { key: 'D2', type: 'DOCTOR', name: 'Dr. Arvind Rao', city: 'Bengaluru', pincode: '560011', stateCode: '29', parent: 'H2', paymentTermsDays: 30, list: null },
  { key: 'D3', type: 'DOCTOR', name: 'Dr. Kavita Desai', city: 'Rajkot', pincode: '360001', stateCode: '24', paymentTermsDays: 7, list: null },
  { key: 'D4', type: 'DOCTOR', name: 'Dr. Sameer Kulkarni', city: 'Mumbai', pincode: '400050', stateCode: '27', paymentTermsDays: 7, list: null },
] as const;

// GSTINs are generated with valid check digits from fictional PANs.
const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function gstin(state: string, pan: string) {
  const b = `${state}${pan}1Z`;
  let sum = 0;
  for (let i = 0; i < 14; i++) { const p = GST_CHARS.indexOf(b[i]!) * (i % 2 ? 2 : 1); sum += Math.floor(p / 36) + (p % 36); }
  return b + GST_CHARS[(36 - (sum % 36)) % 36];
}

async function main() {
  const owner = await prisma.user.findFirst({ where: { role: 'OWNER' }, orderBy: { createdAt: 'asc' } });
  if (!owner) throw new Error('Run `pnpm db:seed` first (it creates the owner).');
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.name, c.id]));
  for (const n of ['IOL / Lens', 'Surgical Instrument', 'Consumable', 'Equipment']) if (!categories.has(n)) categories.set(n, (await prisma.category.create({ data: { name: n } })).id);
  const loc = await prisma.location.findFirst({ where: { isDefault: true } });
  if (!loc) await prisma.location.create({ data: { name: 'Main store', isDefault: true } });

  // Demo staff (dev only) so "assigned employee" and permission screens have data.
  const demoPw = await hash(process.env.DEMO_STAFF_PASSWORD ?? 'DemoStaff2026', { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const staff = [];
  for (const s of [
    { name: 'Ravi Mehta', email: 'ravi.counter@demo.local', permissions: ['VIEW_ORDERS', 'CREATE_ORDERS', 'CREATE_PROFORMA', 'CREATE_TAX_INVOICE', 'RECORD_PAYMENTS', 'MANAGE_CUSTOMERS'] },
    { name: 'Sunita Pawar', email: 'sunita.store@demo.local', permissions: ['VIEW_ORDERS', 'UPDATE_ORDER_STATUS', 'SCAN_DISPATCH', 'MANAGE_STOCK', 'MANAGE_PRODUCTS'] },
  ] as const) {
    staff.push(await prisma.user.upsert({ where: { email: s.email }, create: { role: 'EMPLOYEE', name: s.name, email: s.email, passwordHash: demoPw, permissions: [...s.permissions] }, update: {} }));
  }

  const brandIds = new Map<string, string>();
  for (const [name, manufacturer] of BRANDS) brandIds.set(name, (await prisma.brand.upsert({ where: { name }, create: { name, manufacturer }, update: {} })).id);

  const supplierIds = new Map<string, string>();
  for (const [i, s] of SUPPLIERS.entries()) {
    const existing = await prisma.supplier.findFirst({ where: { name: s.name } });
    const { key, ...data } = s;
    const pan = `AAB${'CFP'[i]}V${String(1200 + i * 37).padStart(4, '0')}${'KLM'[i]}`;
    supplierIds.set(key, existing?.id ?? (await prisma.supplier.create({ data: { ...data, gstin: gstin(s.stateCode, pan), code: `SUP-${String(await counter('supplier')).padStart(3, '0')}`, email: `orders@${key.toLowerCase()}.example` } })).id);
  }

  let variants = 0;
  const productIds = new Map<string, { id: string; rate: number; mrp: number; isLens: boolean }>();
  for (const p of PRODUCTS) {
    let prod = await prisma.product.findUnique({ where: { code: p.code } });
    if (!prod) {
      prod = await prisma.product.create({
        data: {
          code: p.code, name: p.name, categoryId: categories.get(p.category)!, brandId: brandIds.get(p.brand)!, hsnCode: p.hsn, gstRate: p.gst, unit: p.unit ?? 'pcs',
          purchaseCost: p.cost, defaultRate: p.rate, mrp: p.mrp, trackSerial: !!p.serial, trackExpiry: p.expiry !== false,
          isLens: !!p.lens, lensType: p.lens?.type, material: p.lens?.material, aConstant: p.lens?.a, opticSizeMm: p.lens?.optic, overallLenMm: p.lens?.len, preloaded: p.lens?.preloaded ?? null,
          description: p.lens ? `${p.lens.type.toLowerCase()} IOL, ${p.lens.material.toLowerCase()}, ${p.lens.optic.toFixed(2)} mm optic. Powers ${formatPower(p.lens.range.from)} to ${formatPower(p.lens.range.to)}.` : null,
        },
      });
      const combos = p.lens ? expandPowerRange(p.lens.range) : [{ powerSph: null, cylinder: null, addPower: null }];
      for (const c of combos) {
        await prisma.productVariant.create({ data: { productId: prod.id, sku: p.lens ? variantSku(p.code, c) : p.code, powerSph: c.powerSph, cylinder: c.cylinder, addPower: c.addPower, label: variantLabel(c) || null, barcode: await barcode() } });
        variants++;
      }
      await prisma.priceChangeLog.create({ data: { productId: prod.id, scope: 'DEFAULT', newRate: p.rate, changedById: owner.id, source: 'seed' } });
      await prisma.supplierProduct.create({ data: { supplierId: supplierIds.get(p.supplier)!, productId: prod.id, lastPurchaseRate: p.cost, supplierSku: `${p.supplier}-${p.code}` } });
    }
    productIds.set(p.code, { id: prod.id, rate: p.rate, mrp: p.mrp, isLens: !!p.lens });
  }

  // Price lists: Govt hospitals get 12% off lenses and 8% off the rest; private Tier A gets 5% off everything.
  const lists = new Map<string, string>();
  for (const [key, name, description, lensPct, otherPct] of [
    ['GOVT', 'Govt hospitals', 'Government and trust hospitals', 12, 8],
    ['PVT', 'Private clinics – Tier A', 'High-volume private hospitals and clinics', 5, 5],
  ] as const) {
    const l = await prisma.priceList.upsert({ where: { name }, create: { name, description }, update: {} });
    lists.set(key, l.id);
    for (const p of productIds.values()) {
      const rate = percentOff(p.rate, p.isLens ? lensPct : otherPct);
      const exists = await prisma.priceListItem.findUnique({ where: { priceListId_productId: { priceListId: l.id, productId: p.id } } });
      if (!exists) {
        await prisma.priceListItem.create({ data: { priceListId: l.id, productId: p.id, rate } });
        await prisma.priceChangeLog.create({ data: { productId: p.id, scope: 'PRICE_LIST', scopeRefId: l.id, newRate: rate, changedById: owner.id, source: 'seed' } });
      }
    }
  }

  const customerIds = new Map<string, string>();
  for (const [i, c] of CUSTOMERS.entries()) {
    const existing = await prisma.customer.findFirst({ where: { name: c.name } });
    if (existing) { customerIds.set(c.key, existing.id); continue; }
    const pan = c.type === 'DOCTOR' ? `ABCP${'IRDK'[i - 6] ?? 'X'}${String(4100 + i).padStart(4, '0')}Q` : `AAA${c.type === 'HOSPITAL' ? 'T' : 'F'}N${String(4500 + i * 11).padStart(4, '0')}${'ABCDEF'[i]}`;
    const withGst = c.type !== 'DOCTOR' || i % 2 === 0;
    const cust = await prisma.customer.create({
      data: {
        code: `CUST-${String(await counter('customer')).padStart(4, '0')}`, type: c.type, name: c.name, stateCode: c.stateCode,
        contactPerson: 'contactPerson' in c ? c.contactPerson : null,
        mobile: normalizeIndianMobile(`90000${String(10001 + i).slice(-5)}`),
        email: `accounts${i + 1}@customer.example`,
        gstin: withGst ? gstin(c.stateCode, pan) : null, pan,
        drugLicenceNo: c.type === 'DOCTOR' ? null : `DL-${c.stateCode}-${20000 + i * 137}`,
        creditLimit: 'creditLimit' in c ? c.creditLimit : null, paymentTermsDays: c.paymentTermsDays,
        parentId: 'parent' in c && c.parent ? customerIds.get(c.parent) : null,
        assignedEmployeeId: staff[i % 2]!.id,
        priceListId: c.list ? lists.get(c.list) : null,
        addresses: { create: [
          { kind: 'BILLING', isDefault: true, line1: `${12 + i} ${['MG Road', 'Station Road', 'Ring Road', 'Lake View Road'][i % 4]}`, city: c.city, pincode: c.pincode, stateCode: c.stateCode },
          ...(c.type === 'HOSPITAL' ? [{ kind: 'SHIPPING' as const, isDefault: true, label: 'OT Stores', line1: `OT Stores, 2nd Floor, ${12 + i} ${['MG Road', 'Station Road', 'Ring Road'][i % 3]}`, city: c.city, pincode: c.pincode, stateCode: c.stateCode }] : []),
        ] },
      },
    });
    customerIds.set(c.key, cust.id);
  }

  // A few negotiated special prices that win over the price list.
  const specials: [string, string, number, string | null, string | null, string][] = [
    ['H1', 'LV-HA600', 2750, null, null, 'Annual rate contract'],
    ['H1', 'OC-T300', 12900, null, null, 'Annual rate contract'],
    ['H2', 'LV-HA600', 2600, '2026-04-01', '2027-03-31', 'Tender FY 2026-27'],
    ['C2', 'OC-TV3', 20500, null, null, 'Launch offer'],
    ['D4', 'LV-ED50', 17000, null, '2025-12-31', 'Expired offer (falls back to default)'],
  ];
  for (const [ck, pc, rate, from, to, note] of specials) {
    const customerId = customerIds.get(ck)!;
    const productId = productIds.get(pc)!.id;
    const exists = await prisma.customerPrice.findUnique({ where: { customerId_productId: { customerId, productId } } });
    if (exists) continue;
    const d = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);
    await prisma.customerPrice.create({ data: { customerId, productId, rate, validFrom: d(from), validTo: d(to), note } });
    await prisma.priceChangeLog.create({ data: { productId, scope: 'CUSTOMER', scopeRefId: customerId, newRate: new Prisma.Decimal(rate), validFrom: d(from), validTo: d(to), changedById: owner.id, source: 'seed' } });
  }

  // One demo customer login (OTP) for the portal / app.
  const demoLogin = normalizeIndianMobile('9000010001')!;
  if (!(await prisma.user.findUnique({ where: { mobile: demoLogin } }))) {
    await prisma.user.create({ data: { role: 'CUSTOMER', name: 'Mr. Prakash Joshi', mobile: demoLogin, customerId: customerIds.get('H1') } });
  }

  await seedStock(owner.id);

  console.log(`Demo masters ready: ${SUPPLIERS.length} suppliers, ${PRODUCTS.length} products (${variants} new variants), ${CUSTOMERS.length} customers, 2 price lists.`);
  console.log(`Demo staff: ravi.counter@demo.local / sunita.store@demo.local (password: ${process.env.DEMO_STAFF_PASSWORD ? 'DEMO_STAFF_PASSWORD' : 'DemoStaff2026'}). Demo customer OTP login: ${demoLogin}.`);
}



/**
 * Opening stock for the demo: one opening-stock receipt with batches, expiries (incl. one batch
 * expiring soon and one already expired) and serial numbers for serial-tracked items.
 * Skipped if any stock movement already exists.
 */
async function seedStock(ownerId: string) {
  if (await prisma.stockMovement.count()) return;
  const loc = (await prisma.location.findFirst({ where: { isDefault: true } }))!;
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plusDays = (n: number) => iso(new Date(today.getTime() + n * 86_400_000));
  const fy = (() => { const y = today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; })();
  const series = await prisma.$queryRaw<{ prefix: string; nextNumber: number }[]>`
    UPDATE "NumberSeries" SET "nextNumber" = "nextNumber" + 1 WHERE "docType" = 'GRN'::"DocType" AND "financialYear" = ${fy} RETURNING "prefix", "nextNumber" - 1 AS "nextNumber"`;
  const number = series[0] ? `${series[0].prefix}${fy}/${String(series[0].nextNumber).padStart(4, '0')}` : `KE/GRN/${fy}/0001`;
  const grn = await prisma.grn.create({ data: { number, date: new Date(`${iso(today)}T00:00:00Z`), isOpening: true, note: 'Demo opening stock', createdById: ownerId } });

  const products = await prisma.product.findMany({ include: { variants: { orderBy: [{ powerSph: 'asc' }, { cylinder: 'asc' }] } }, orderBy: { code: 'asc' } });
  let lines = 0, units = 0;
  let serialSeq = 1000;
  for (const [pi, p] of products.entries()) {
    // Lenses: stock the commonly used powers (+18 to +24 D), every other step; others: one batch.
    const picks = p.isLens
      ? p.variants.filter((v) => { const ps = Number(v.powerSph); return ps >= 18 && ps <= 24 && Math.round(ps * 2) % 2 === 0 && (v.cylinder == null || Number(v.cylinder) === 2.25); })
      : p.variants;
    for (const [vi, v] of picks.entries()) {
      const qty = p.isLens ? 2 + ((pi + vi) % 5) : p.categoryId && /Equipment/.test(p.name) ? 1 : p.trackExpiry ? 20 + ((pi * 7) % 60) : 2 + (pi % 8);
      const isExpiringDemo = p.code === 'VG-TB06';
      const isExpiredDemo = p.code === 'VG-HP2' && vi === 0;
      const batchNo = p.trackBatch ? `${p.code.replace(/[^A-Z0-9]/g, '').slice(0, 4)}${String(2400 + pi).slice(-4)}${p.isLens ? String.fromCharCode(65 + (vi % 3)) : ''}` : 'NA';
      const expiry = !p.trackExpiry ? null : isExpiredDemo ? plusDays(-12) : isExpiringDemo ? plusDays(45) : plusDays(p.isLens ? 700 + vi * 10 : 420 + pi * 9);
      const batch = await prisma.batch.upsert({
        where: { variantId_batchNo: { variantId: v.id, batchNo } },
        create: { variantId: v.id, batchNo, expiryDate: expiry ? new Date(`${expiry}T00:00:00Z`) : null, unitCost: p.purchaseCost },
        update: {},
      });
      const serials = p.trackSerial ? Array.from({ length: qty }, () => `${batchNo}${String(serialSeq++).padStart(5, '0')}`) : [];
      for (const sn of serials) await prisma.serialUnit.create({ data: { batchId: batch.id, serialNo: sn, status: 'IN_STOCK', locationId: loc.id } });
      await prisma.grnLine.create({ data: { grnId: grn.id, variantId: v.id, batchId: batch.id, batchNo, expiryDate: batch.expiryDate, serialNos: serials, qty, rate: p.purchaseCost, locationId: loc.id } });
      await prisma.stockMovement.create({ data: { type: 'OPENING', variantId: v.id, batchId: batch.id, locationId: loc.id, qty, serialNos: serials, unitCost: p.purchaseCost, refType: 'Grn', refId: grn.id, note: number, createdById: ownerId } });
      await prisma.stockBalance.create({ data: { variantId: v.id, batchId: batch.id, locationId: loc.id, qty } });
      lines++; units += qty;
    }
  }
  await prisma.activityLog.create({ data: { actorId: ownerId, action: 'stock.opening', entityType: 'Grn', entityId: grn.id, summary: `Demo opening stock ${number}: ${lines} line(s), ${units} unit(s)` } });
  console.log(`Demo opening stock ${number}: ${lines} lines, ${units} units.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
