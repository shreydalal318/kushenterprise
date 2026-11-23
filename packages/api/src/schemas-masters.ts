/** Phase 2 input schemas: products, suppliers, customers, pricing. */
import { z } from 'zod';
import {
  LENS_TYPES, gstinError, isValidHsn, isValidPan, isValidPincode, normalizeGtin, panFromGstin, stateCodeFromGstin,
} from '@kush/core';
import { mobileSchema, stateCodeSchema } from './schemas-common';

const text = (max = 200) => z.string().trim().max(max);
const optText = (max = 200) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const money = z.coerce.number().min(0, 'Cannot be negative').max(99_99_99_999, 'Too large').transform((n) => Math.round(n * 100) / 100);
const optMoney = z.union([z.null(), z.literal('').transform(() => null), money]).optional().transform((v) => (v === undefined ? undefined : v));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date');
const optDate = z.union([isoDate, z.literal('').transform(() => null), z.null()]).optional().transform((v) => v ?? null);

export const gtinSchema = z.string().trim().transform((v, ctx) => {
  const g = normalizeGtin(v);
  if (!g) { ctx.addIssue({ code: 'custom', message: 'Not a valid GTIN/EAN (check digit failed)' }); return z.NEVER; }
  return g;
});
const optGtin = z.union([z.null(), z.literal('').transform(() => null), gtinSchema]).optional().transform((v) => v ?? null);

// ---------- brands ----------
export const brandInput = z.object({ name: text(80).min(2), manufacturer: optText(120) });

// ---------- products ----------
export const productCodeSchema = text(30).min(2).transform((v) => v.toUpperCase())
  .refine((v) => /^[A-Z0-9][A-Z0-9/_-]*$/.test(v), 'Letters, numbers, - / _ only');

export const powerRangeInput = z.object({
  from: z.coerce.number().min(-60).max(60),
  to: z.coerce.number().min(-60).max(60),
  step: z.coerce.number().refine((s) => [0.25, 0.5, 1].includes(s), 'Step must be 0.25, 0.5 or 1'),
  cylinders: z.array(z.coerce.number().min(0).max(12)).max(20).optional(),
  addPowers: z.array(z.coerce.number().min(0).max(6)).max(10).optional(),
});

const productFields = {
  code: productCodeSchema,
  name: text(160).min(2),
  categoryId: z.string().min(1, 'Choose a category'),
  brandId: z.string().min(1).nullable().optional().transform((v) => v ?? null),
  model: optText(80),
  hsnCode: text(8).refine(isValidHsn, 'HSN must be 4, 6 or 8 digits'),
  gstRate: z.coerce.number().min(0).max(40),
  unit: text(20).min(1),
  description: optText(4000),
  purchaseCost: optMoney, // only accepted from users who may see costs
  defaultRate: money,
  mrp: money,
  reorderLevel: z.union([z.null(), z.literal('').transform(() => null), z.coerce.number().int().min(0).max(100000)]).optional().transform((v) => v ?? null),
  trackBatch: z.boolean().default(true),
  trackExpiry: z.boolean().default(true),
  trackSerial: z.boolean().default(false),
  isLens: z.boolean().default(false),
  lensType: z.enum(LENS_TYPES).nullable().optional().transform((v) => v ?? null),
  material: optText(80),
  aConstant: z.union([z.null(), z.literal('').transform(() => null), z.coerce.number().min(100).max(130)]).optional().transform((v) => v ?? null),
  opticSizeMm: z.union([z.null(), z.literal('').transform(() => null), z.coerce.number().min(3).max(10)]).optional().transform((v) => v ?? null),
  overallLenMm: z.union([z.null(), z.literal('').transform(() => null), z.coerce.number().min(5).max(16)]).optional().transform((v) => v ?? null),
  preloaded: z.boolean().nullable().optional().transform((v) => v ?? null),
  showOnWebsite: z.boolean().default(true),
};

const productRules = <T extends { defaultRate: number; mrp: number; isLens: boolean; lensType: string | null }>(v: T, ctx: z.RefinementCtx) => {
  if (v.defaultRate > v.mrp) ctx.addIssue({ code: 'custom', path: ['defaultRate'], message: 'Selling rate cannot be above MRP' });
  if (v.isLens && !v.lensType) ctx.addIssue({ code: 'custom', path: ['lensType'], message: 'Choose the lens type' });
};

export const productCreateInput = z.object({ ...productFields, powerRange: powerRangeInput.optional() }).superRefine(productRules);
export const productUpdateInput = z.object({ id: z.string().min(1), ...productFields }).superRefine(productRules);

export const productListInput = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  lensType: z.enum(LENS_TYPES).optional(),
  power: z.coerce.number().optional(), // products that have a variant with this exact power
  includeInactive: z.boolean().default(false),
}).optional();

export const variantAddInput = z.object({
  productId: z.string().min(1),
  powerSph: z.coerce.number().min(-60).max(60).nullable().optional().transform((v) => v ?? null),
  cylinder: z.coerce.number().min(0).max(12).nullable().optional().transform((v) => v ?? null),
  addPower: z.coerce.number().min(0).max(6).nullable().optional().transform((v) => v ?? null),
  gtin: optGtin,
});
export const variantGenerateInput = z.object({ productId: z.string().min(1), range: powerRangeInput });
export const variantUpdateInput = z.object({
  id: z.string().min(1),
  gtin: optGtin,
  isActive: z.boolean(),
  reorderLevel: z.union([z.null(), z.literal('').transform(() => null), z.coerce.number().int().min(0)]).optional().transform((v) => v ?? null),
  mrp: optMoney,
  purchaseCost: optMoney,
});

// ---------- suppliers ----------
const gstinOptional = z.string().trim().toUpperCase().max(15).optional().nullable().transform((v) => v || null);
const panOptional = z.string().trim().toUpperCase().max(10).optional().nullable().transform((v) => v || null);

function taxIdRules(v: { gstin: string | null; stateCode: string; pan?: string | null }, ctx: z.RefinementCtx) {
  if (v.gstin) {
    const err = gstinError(v.gstin);
    if (err) ctx.addIssue({ code: 'custom', path: ['gstin'], message: err });
    else if (stateCodeFromGstin(v.gstin) !== v.stateCode) ctx.addIssue({ code: 'custom', path: ['stateCode'], message: `GSTIN starts with ${stateCodeFromGstin(v.gstin)}; the state must match` });
    else if (v.pan && panFromGstin(v.gstin) !== v.pan) ctx.addIssue({ code: 'custom', path: ['pan'], message: 'PAN does not match the PAN inside the GSTIN' });
  }
  if (v.pan && !isValidPan(v.pan)) ctx.addIssue({ code: 'custom', path: ['pan'], message: 'PAN must look like ABCDE1234F' });
}

export const supplierInput = z.object({
  name: text(160).min(2),
  addressLine1: text(200).min(1),
  addressLine2: optText(200),
  city: text(80).min(1),
  pincode: z.string().trim().optional().nullable().transform((v) => v || null).refine((v) => !v || isValidPincode(v), 'Enter a 6-digit PIN code'),
  stateCode: stateCodeSchema,
  gstin: gstinOptional,
  contactPerson: optText(120),
  mobile: z.union([z.null(), z.literal('').transform(() => null), mobileSchema]).optional().transform((v) => v ?? null),
  email: z.union([z.null(), z.literal('').transform(() => null), z.email().trim().toLowerCase()]).optional().transform((v) => v ?? null),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
}).superRefine((v, ctx) => taxIdRules(v, ctx));
export const supplierUpdateInput = z.intersection(z.object({ id: z.string().min(1) }), supplierInput);

export const supplierProductsInput = z.object({
  supplierId: z.string().min(1),
  rows: z.array(z.object({ productId: z.string().min(1), supplierSku: optText(60), lastPurchaseRate: optMoney })).max(1000),
});

// ---------- customers ----------
export const addressInput = z.object({
  label: optText(60),
  line1: text(200).min(1, 'Enter the address'),
  line2: optText(200),
  city: text(80).min(1, 'Enter the city'),
  pincode: text(10).refine(isValidPincode, 'Enter a 6-digit PIN code'),
  stateCode: stateCodeSchema,
  gstin: gstinOptional,
});

const customerFields = {
  type: z.enum(['DOCTOR', 'HOSPITAL', 'CLINIC']),
  name: text(160).min(2),
  contactPerson: optText(120),
  mobile: z.union([z.null(), z.literal('').transform(() => null), mobileSchema]).optional().transform((v) => v ?? null),
  email: z.union([z.null(), z.literal('').transform(() => null), z.email().trim().toLowerCase()]).optional().transform((v) => v ?? null),
  stateCode: stateCodeSchema,
  gstin: gstinOptional,
  pan: panOptional,
  drugLicenceNo: optText(100),
  creditLimit: optMoney,
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
  assignedEmployeeId: z.string().min(1).nullable().optional().transform((v) => v ?? null),
  parentId: z.string().min(1).nullable().optional().transform((v) => v ?? null),
  notes: optText(2000),
};

export const customerCreateInput = z.object({ ...customerFields, billingAddress: addressInput, fromLeadId: z.string().optional() }).superRefine((v, ctx) => taxIdRules(v, ctx));
export const customerUpdateInput = z.object({ id: z.string().min(1), ...customerFields }).superRefine((v, ctx) => taxIdRules(v, ctx));
export const customerListInput = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(['DOCTOR', 'HOSPITAL', 'CLINIC']).optional(),
  assignedEmployeeId: z.string().optional(),
  priceListId: z.string().optional(),
  includeInactive: z.boolean().default(false),
}).optional();

export const customerAddressAddInput = z.object({ customerId: z.string().min(1), kind: z.enum(['BILLING', 'SHIPPING']), isDefault: z.boolean().default(false), address: addressInput });
export const customerAddressUpdateInput = z.object({ id: z.string().min(1), isDefault: z.boolean(), address: addressInput });
export const customerLoginInput = z.object({ customerId: z.string().min(1), name: text(120).min(2), mobile: mobileSchema, email: z.union([z.literal('').transform(() => null), z.email().trim().toLowerCase()]).optional().transform((v) => v ?? null) });

// ---------- pricing ----------
export const priceRowInput = z.object({
  productId: z.string().min(1),
  rate: z.union([z.null(), money]), // null removes the special price
  validFrom: optDate,
  validTo: optDate,
  note: optText(200),
}).refine((r) => !r.validFrom || !r.validTo || r.validFrom <= r.validTo, { message: '"Valid from" must be on or before "Valid to"', path: ['validTo'] })
  .refine((r) => r.rate === null || r.rate > 0, { message: 'Rate must be above zero', path: ['rate'] });

export const setCustomerPricesInput = z.object({ customerId: z.string().min(1), rows: z.array(priceRowInput).min(1).max(5000), source: z.enum(['ui', 'excel-import', 'bulk']).default('ui') });
export const setPriceListItemsInput = z.object({ priceListId: z.string().min(1), rows: z.array(priceRowInput).min(1).max(5000), source: z.enum(['ui', 'excel-import', 'bulk']).default('ui') });

export const bulkAdjustInput = z.object({
  customerId: z.string().min(1),
  productIds: z.array(z.string().min(1)).min(1).max(5000),
  mode: z.enum(['PERCENT_OFF_DEFAULT', 'FIXED', 'CLEAR']),
  value: z.coerce.number().optional(),
  validFrom: optDate,
  validTo: optDate,
}).superRefine((v, ctx) => {
  if (v.mode === 'PERCENT_OFF_DEFAULT' && (v.value === undefined || v.value < -100 || v.value >= 100)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a percentage below 100' });
  if (v.mode === 'FIXED' && (v.value === undefined || v.value <= 0)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a rate above zero' });
});

export const customerSheetInput = z.object({
  customerId: z.string().min(1),
  q: z.string().trim().max(100).optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  onlySpecial: z.boolean().default(false),
  onDate: isoDate.optional(),
});

export const priceListInput = z.object({ name: text(80).min(2), description: optText(300) });
export const priceHistoryInput = z.object({
  productId: z.string().optional(),
  customerId: z.string().optional(),
  priceListId: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
