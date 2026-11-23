import { financialYear } from '@kush/core';
import { prisma } from '@kush/db';
import { describe, expect, it } from 'vitest';
import { gstinCheckChar } from '@kush/core';
import { nextDocNumber } from '../src/services/numbering';
import { anon, callerFor, makeUser, PASSWORD, randomMobile, tag } from './helpers';

describe('employees (owner)', () => {
  it('creates an employee with a temporary password and logs it', async () => {
    const owner = await makeUser('OWNER');
    const { api } = await callerFor(owner.id);
    const email = `ravi-${tag()}@test.local`;
    const mobile = randomMobile();
    const emp = await api.employees.create({
      name: 'Ravi Counter', email, mobile: mobile.slice(3), password: 'TempPass2026',
      permissions: ['VIEW_ORDERS', 'CREATE_TAX_INVOICE', 'NOT_A_PERMISSION' as never],
    }).catch((e) => e);
    // Unknown permission strings are rejected by validation
    expect(emp).toBeInstanceOf(Error);

    const ok = await api.employees.create({
      name: 'Ravi Counter', email, mobile: mobile.slice(3), password: 'TempPass2026',
      permissions: ['VIEW_ORDERS', 'CREATE_TAX_INVOICE'],
    });
    expect(ok.mustChangePassword).toBe(true);
    expect(ok.mobile).toBe(mobile);
    const log = await prisma.activityLog.findFirst({ where: { entityId: ok.id, action: 'employee.create' } });
    expect(log?.actorId).toBe(owner.id);

    await expect(api.employees.create({ name: 'Dup', email, password: 'TempPass2026', permissions: [] }))
      .rejects.toMatchObject({ code: 'CONFLICT' });

    const login = await (await anon()).api.auth.loginWithPassword({ identifier: email, password: 'TempPass2026', client: 'web' });
    expect(login.user.mustChangePassword).toBe(true);
  });

  it('logs permission diffs and deactivation signs the employee out everywhere', async () => {
    const owner = await makeUser('OWNER');
    const emp = await makeUser('EMPLOYEE', { permissions: ['VIEW_ORDERS'] });
    const { api } = await callerFor(owner.id);
    const empCaller = await callerFor(emp.id);

    await api.employees.setPermissions({ id: emp.id, permissions: ['MANAGE_STOCK'] });
    const log = await prisma.activityLog.findFirst({ where: { entityId: emp.id, action: 'employee.permissions' } });
    expect(log?.summary).toContain('+MANAGE_STOCK');
    expect(log?.summary).toContain('-VIEW_ORDERS');

    await api.employees.setActive({ id: emp.id, isActive: false });
    const sessions = await prisma.session.count({ where: { userId: emp.id, revokedAt: null } });
    expect(sessions).toBe(0);
    expect(await empCaller.api.auth.me()).not.toBeNull(); // context was built before deactivation
    const { createContext } = await import('../src/trpc');
    const { createCaller } = await import('../src/root');
    const fresh = createCaller(await createContext({ headers: new Headers({ authorization: `Bearer ${empCaller.token}` }) }));
    expect(await fresh.auth.me()).toBeNull();
    await expect((await anon()).api.auth.loginWithPassword({ identifier: emp.email!, password: PASSWORD, client: 'web' })).rejects.toThrow();
  });

  it('cannot be used to edit the owner account', async () => {
    const owner = await makeUser('OWNER');
    const other = await makeUser('OWNER');
    const { api } = await callerFor(owner.id);
    await expect(api.employees.setActive({ id: other.id, isActive: false })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(api.employees.setPermissions({ id: owner.id, permissions: [] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('settings (owner)', () => {
  const company = {
    legalName: 'Kush Enterprise', addressLine1: '12 Test Road', addressLine2: '', city: 'Ahmedabad', pincode: '380009',
    stateCode: '24', phone: '', email: '', gstin: '[GSTIN]', pan: '[PAN]', drugLicenceNo: '[Drug Licence No]', jurisdictionCity: 'Ahmedabad',
  };

  it('validates GSTIN checksum and that it matches the state and PAN', async () => {
    const owner = await makeUser('OWNER');
    const { api } = await callerFor(owner.id);
    const base = '24ABCDE1234F1Z';
    const gstin = base + gstinCheckChar(base);
    await expect(api.settings.updateCompany({ ...company, gstin: base + '0' === gstin ? base + '1' : base + '0' })).rejects.toThrow(/check digit/);
    await expect(api.settings.updateCompany({ ...company, gstin, stateCode: '27' })).rejects.toThrow(/state must match/);
    await expect(api.settings.updateCompany({ ...company, gstin, pan: 'ZZZZZ9999Z' })).rejects.toThrow(/PAN does not match/);
    const saved = await api.settings.updateCompany({ ...company, gstin, pan: 'ABCDE1234F' });
    expect(saved.gstin).toBe(gstin);
    expect(saved.addressLine2).toBeNull();
  });

  it('logs only the fields that changed', async () => {
    const owner = await makeUser('OWNER');
    const { api } = await callerFor(owner.id);
    const current = await api.settings.get();
    await api.settings.updateInventory({ defaultReorderLevel: current.defaultReorderLevel + 1, expiryAlertDays: [90, 30, 60, 30] });
    const s = await api.settings.get();
    expect(s.expiryAlertDays).toEqual([30, 60, 90]);
    expect(s.defaultReorderLevel).toBe(current.defaultReorderLevel + 1);
    const log = await prisma.activityLog.findFirst({ where: { action: 'settings.update', actorId: owner.id }, orderBy: { createdAt: 'desc' } });
    expect(log?.summary).toBe('Inventory defaults: defaultReorderLevel');

    const m = await api.settings.updateMasters({ gstRates: [18, 5, 0, 12, 5], units: ['PCS', 'box', 'Box'] });
    expect(m.gstRates).toEqual([0, 5, 12, 18]);
    expect(m.units).toEqual(['pcs', 'box']);
  });

  it('manages categories and refuses to delete one in use', async () => {
    const owner = await makeUser('OWNER');
    const { api } = await callerFor(owner.id);
    const name = `Test Category ${tag()}`;
    const c = await api.settings.createCategory({ name });
    await expect(api.settings.createCategory({ name })).rejects.toMatchObject({ code: 'CONFLICT' });
    await prisma.product.create({ data: { code: `P-${tag()}`, name: 'P', categoryId: c.id, hsnCode: '9018', gstRate: 5, purchaseCost: 1, defaultRate: 2, mrp: 3 } });
    await expect(api.settings.deleteCategory({ id: c.id })).rejects.toThrow(/1 product/);
  });
});

describe('document numbering', () => {
  it('hands out unique, gap-free numbers under concurrency', async () => {
    const fy = financialYear();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => prisma.$transaction((tx) => nextDocNumber(tx, 'PROFORMA'))),
    );
    expect(new Set(results).size).toBe(20);
    const nums = results.map((r) => Number(r.split('/').pop())).sort((a, b) => a - b);
    expect(nums[nums.length - 1]! - nums[0]! + 1).toBe(20);
    const series = await prisma.numberSeries.findUniqueOrThrow({ where: { docType_financialYear: { docType: 'PROFORMA', financialYear: fy } } });
    expect(results.every((r) => r.startsWith(`${series.prefix}${fy}/`))).toBe(true);
  });

  it('starts a new series each financial year, keeping the prefix', async () => {
    const owner = await makeUser('OWNER');
    const { api } = await callerFor(owner.id);
    // A far-future year unique to this run, so the series is always fresh.
    const y = 2100 + Math.floor(Math.random() * 3000);
    const fy = (n: number) => `${n}-${String((n + 1) % 100).padStart(2, '0')}`;
    const prefix = `T${tag()}/`;
    await api.settings.updateNumberSeries({ docType: 'PURCHASE_ORDER', financialYear: fy(y), prefix, nextNumber: 41, padding: 4 });
    const n1 = await prisma.$transaction((tx) => nextDocNumber(tx, 'PURCHASE_ORDER', `${y + 1}-03-31`));
    expect(n1).toBe(`${prefix}${fy(y)}/0041`);
    const n2 = await prisma.$transaction((tx) => nextDocNumber(tx, 'PURCHASE_ORDER', `${y + 1}-04-01`));
    expect(n2).toBe(`${prefix}${fy(y + 1)}/0001`);
  });
});
