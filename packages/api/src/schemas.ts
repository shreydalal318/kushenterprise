/**
 * Input schemas shared by the API (validation) and the web/mobile forms (client-side checks).
 */
import { z } from 'zod';
import {
  ALL_PERMISSIONS, DOC_TYPES, INDIAN_STATES, gstinError, isValidIfsc, isValidPan, isValidPincode,
  normalizeIndianMobile, panFromGstin, passwordError, stateCodeFromGstin,
} from '@kush/core';

const isPlaceholder = (s: string) => /^\[.*\]$/.test(s.trim());
const trimmed = (max = 200) => z.string().trim().max(max);
const optionalText = (max = 200) => trimmed(max).optional().transform((v) => (v ? v : null));

export { mobileSchema, passwordSchema, stateCodeSchema } from './schemas-common';
import { mobileSchema, passwordSchema } from './schemas-common';

// ---------- auth ----------
export const loginPasswordInput = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or mobile').max(200),
  password: z.string().min(1, 'Enter your password').max(200),
  client: z.enum(['web', 'mobile']).default('web'),
});
export const requestOtpInput = z.object({ mobile: mobileSchema });
export const verifyOtpInput = z.object({
  mobile: mobileSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  client: z.enum(['web', 'mobile']).default('web'),
});
export const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

// ---------- employees ----------
export const permissionsSchema = z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).max(ALL_PERMISSIONS.length);

export const employeeCreateInput = z.object({
  name: trimmed(120).min(2, 'Enter a name'),
  email: z.email('Enter a valid email').trim().toLowerCase().optional().or(z.literal('').transform(() => undefined)),
  mobile: mobileSchema.optional().or(z.literal('').transform(() => undefined)),
  password: passwordSchema,
  permissions: permissionsSchema.default([]),
}).refine((v) => v.email || v.mobile, { message: 'Enter an email or a mobile number', path: ['email'] });

export const employeeUpdateInput = z.object({
  id: z.string().min(1),
  name: trimmed(120).min(2),
  email: z.email().trim().toLowerCase().nullable(),
  mobile: mobileSchema.nullable(),
}).refine((v) => v.email || v.mobile, { message: 'Enter an email or a mobile number', path: ['email'] });

export const employeePermissionsInput = z.object({ id: z.string().min(1), permissions: permissionsSchema });
export const employeeResetPasswordInput = z.object({ id: z.string().min(1), password: passwordSchema });
export const employeeSetActiveInput = z.object({ id: z.string().min(1), isActive: z.boolean() });

// ---------- settings ----------
export const companySettingsInput = z.object({
  legalName: trimmed(150).min(2),
  addressLine1: trimmed(200).min(1),
  addressLine2: optionalText(200),
  city: trimmed(80).min(1),
  pincode: trimmed(10).refine((v) => isPlaceholder(v) || isValidPincode(v), 'Enter a 6-digit PIN code'),
  stateCode: z.string().refine((c) => c === 'XX' || INDIAN_STATES.some((s) => s.code === c), 'Choose a state'),
  phone: optionalText(40),
  email: z.email().trim().nullable().optional().or(z.literal('').transform(() => null)),
  gstin: trimmed(20).transform((v) => v.toUpperCase()).superRefine((v, ctx) => {
    const err = isPlaceholder(v) ? null : gstinError(v);
    if (err) ctx.addIssue({ code: 'custom', message: err });
  }),
  pan: trimmed(12).transform((v) => v.toUpperCase()).refine((v) => isPlaceholder(v) || isValidPan(v), 'PAN must look like ABCDE1234F'),
  drugLicenceNo: trimmed(100).min(1),
  jurisdictionCity: trimmed(80).min(1),
}).superRefine((v, ctx) => {
  if (isPlaceholder(v.gstin)) return;
  if (v.stateCode !== 'XX' && stateCodeFromGstin(v.gstin) !== v.stateCode) {
    ctx.addIssue({ code: 'custom', path: ['stateCode'], message: `GSTIN starts with ${stateCodeFromGstin(v.gstin)}; the state must match` });
  }
  if (!isPlaceholder(v.pan) && panFromGstin(v.gstin) !== v.pan) {
    ctx.addIssue({ code: 'custom', path: ['pan'], message: 'PAN does not match the PAN inside the GSTIN' });
  }
});

export const bankSettingsInput = z.object({
  bankName: trimmed(100).min(1),
  bankAccountNo: trimmed(40).min(1),
  bankIfsc: trimmed(20).transform((v) => v.toUpperCase()).refine((v) => isPlaceholder(v) || isValidIfsc(v), 'IFSC must look like HDFC0001234'),
  bankBranch: trimmed(100).min(1),
  upiId: z.string().trim().max(100).regex(/^$|^[\w.-]{2,}@[\w.-]{2,}$/, 'UPI ID must look like name@bank').transform((v) => v || null),
});

export const documentSettingsInput = z.object({
  invoiceDeclaration: trimmed(1000).min(10),
  defaultInvoiceTerms: optionalText(2000),
  defaultPoTerms: optionalText(2000),
  proformaValidityDays: z.coerce.number().int().min(1).max(365),
  defaultInvoiceCopies: z.array(z.enum(['ORIGINAL', 'DUPLICATE', 'TRIPLICATE'])).min(1),
});

export const mastersSettingsInput = z.object({
  gstRates: z.array(z.coerce.number().min(0).max(40)).min(1).transform((a) => [...new Set(a)].sort((x, y) => x - y)),
  units: z.array(trimmed(20).min(1)).min(1).transform((a) => [...new Set(a.map((u) => u.toLowerCase()))]),
});

export const inventorySettingsInput = z.object({
  defaultReorderLevel: z.coerce.number().int().min(0).max(100000),
  expiryAlertDays: z.array(z.coerce.number().int().min(1).max(730)).min(1).max(5)
    .transform((a) => [...new Set(a)].sort((x, y) => x - y)),
});

export const NOTIFY_CHANNELS = ['inApp', 'push', 'sms', 'whatsapp', 'email'] as const;
export const notificationSettingsInput = z.object({
  channels: z.object(Object.fromEntries(NOTIFY_CHANNELS.map((c) => [c, z.boolean()])) as Record<(typeof NOTIFY_CHANNELS)[number], z.ZodBoolean>),
  orderStatusToCustomer: z.boolean(),
  lowStockToOwner: z.boolean(),
  expiryToOwner: z.boolean(),
});

export const labelSizeSchema = z.object({
  name: trimmed(40).min(1),
  widthMm: z.coerce.number().min(10).max(300),
  heightMm: z.coerce.number().min(10).max(300),
  perSheet: z.coerce.number().int().min(1).max(200).default(1),
});
export const labelSettingsInput = z.object({ labelSizes: z.array(labelSizeSchema).min(1).max(20) });

export const numberSeriesUpdateInput = z.object({
  docType: z.enum(DOC_TYPES),
  financialYear: z.string().regex(/^\d{4}-\d{2}$/),
  prefix: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9/_-]+$/, 'Letters, numbers, / _ - only'),
  nextNumber: z.coerce.number().int().min(1).max(999_999),
  padding: z.coerce.number().int().min(1).max(8),
});

export const categoryInput = z.object({ name: trimmed(80).min(2) });
export const categoryRenameInput = z.object({ id: z.string().min(1), name: trimmed(80).min(2) });

export const activityListInput = z.object({
  actorId: z.string().optional(),
  entityType: z.string().optional(),
  action: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export * from './schemas-masters';
