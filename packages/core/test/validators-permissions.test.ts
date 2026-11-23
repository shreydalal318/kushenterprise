import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { gstinCheckChar, gstinError, normalizeIndianMobile, panFromGstin, passwordError } from '../src/validators';
import { ALL_PERMISSIONS, can, sanitizePermissions } from '../src/permissions';
import { formatDocNumber } from '../src/numbering';

describe('validators', () => {
  it('validates GSTIN checksum', () => {
    const base = '29AABTS7712M1Z';
    const valid = base + gstinCheckChar(base);
    expect(gstinError(valid)).toBeNull();
    const wrong = base + (gstinCheckChar(base) === 'A' ? 'B' : 'A');
    expect(gstinError(wrong)).toMatch(/check digit/);
    expect(gstinError('29AABTS7712M1Q5')).toMatch(/15 characters/);
    expect(panFromGstin(valid)).toBe('AABTS7712M');
  });
  it('normalises Indian mobiles', () => {
    expect(normalizeIndianMobile('98765 43210')).toBe('+919876543210');
    expect(normalizeIndianMobile('+91-98765-43210')).toBe('+919876543210');
    expect(normalizeIndianMobile('09876543210')).toBe('+919876543210');
    expect(normalizeIndianMobile('12345')).toBeNull();
    expect(normalizeIndianMobile('5876543210')).toBeNull();
  });
  it('enforces the password policy', () => {
    expect(passwordError('short1')).not.toBeNull();
    expect(passwordError('longbutnodigits')).not.toBeNull();
    expect(passwordError('Kush2026secure')).toBeNull();
  });
  it('formats document numbers', () => {
    expect(formatDocNumber('KE/', '2026-27', 1)).toBe('KE/2026-27/0001');
    expect(formatDocNumber('KE/PO/', '2026-27', 12345)).toBe('KE/PO/2026-27/12345');
  });
});

describe('permissions', () => {
  it('owner can do everything, employees only what is ticked, customers nothing', () => {
    expect(can({ role: 'OWNER', permissions: [] }, 'VIEW_ANALYTICS')).toBe(true);
    expect(can({ role: 'EMPLOYEE', permissions: ['VIEW_ORDERS'] }, 'VIEW_ORDERS')).toBe(true);
    expect(can({ role: 'EMPLOYEE', permissions: ['VIEW_ORDERS'] }, 'VIEW_ANALYTICS')).toBe(false);
    expect(can({ role: 'CUSTOMER', permissions: ['VIEW_ORDERS'] }, 'VIEW_ORDERS')).toBe(false);
    expect(can({ role: 'OWNER', permissions: [], isActive: false }, 'VIEW_ORDERS')).toBe(false);
  });
  it('drops unknown permission strings', () => {
    expect(sanitizePermissions(['VIEW_ORDERS', 'HACK'])).toEqual(['VIEW_ORDERS']);
  });
  it('stays in sync with the Prisma Permission enum', () => {
    const schema = readFileSync(fileURLToPath(new URL('../../db/prisma/schema.prisma', import.meta.url)), 'utf8');
    const block = /enum Permission \{([\s\S]*?)\}/.exec(schema)![1]!;
    const enumValues = block.split('\n').map((l) => l.replace(/\/\/.*/, '').trim()).filter(Boolean);
    expect([...enumValues].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
});
