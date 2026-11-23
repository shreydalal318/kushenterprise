import { prisma } from '@kush/db';
import { describe, expect, it } from 'vitest';
import { anon, callerFor, ensureCustomer, makeUser, PASSWORD } from './helpers';

describe('server-side role & permission enforcement', () => {
  it('blocks anonymous callers', async () => {
    const { api } = await anon();
    await expect(api.settings.get()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(api.employees.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('lets staff read settings but only the owner change them', async () => {
    const emp = await makeUser('EMPLOYEE', { permissions: ['VIEW_ORDERS', 'MANAGE_STOCK'] });
    const { api } = await callerFor(emp.id);
    expect((await api.settings.get()).legalName).toBe('Kush Enterprise');
    await expect(api.settings.updateBank({ bankName: 'X', bankAccountNo: '1', bankIfsc: 'HDFC0001234', bankBranch: 'B', upiId: '' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(api.employees.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(api.activity.list({ limit: 10 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(api.settings.numberSeries()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('keeps customers out of staff endpoints', async () => {
    const c = await ensureCustomer();
    const cu = await makeUser('CUSTOMER', { customerId: c.id });
    const { api } = await callerFor(cu.id);
    await expect(api.settings.get()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(api.settings.categories()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('forces a password change before anything else', async () => {
    const emp = await makeUser('EMPLOYEE', { mustChangePassword: true });
    const { api } = await callerFor(emp.id);
    await expect(api.settings.get()).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'PASSWORD_CHANGE_REQUIRED' });
    await api.auth.changePassword({ currentPassword: PASSWORD, newPassword: 'BrandNew2026pw' });
    const again = await callerFor(emp.id);
    expect((await again.api.settings.get()).id).toBe('company');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: emp.id } })).mustChangePassword).toBe(false);
  });

  it('applies permission changes immediately on the next request', async () => {
    const owner = await makeUser('OWNER');
    const emp = await makeUser('EMPLOYEE');
    const ownerApi = (await callerFor(owner.id)).api;
    const empSession = await callerFor(emp.id);
    expect((await empSession.api.auth.me())?.permissions).toEqual([]);
    await ownerApi.employees.setPermissions({ id: emp.id, permissions: ['VIEW_ANALYTICS'] });
    // Same token, new request context:
    const { createContext } = await import('../src/trpc');
    const { createCaller } = await import('../src/root');
    const fresh = createCaller(await createContext({ headers: new Headers({ authorization: `Bearer ${empSession.token}` }) }));
    expect((await fresh.auth.me())?.permissions).toEqual(['VIEW_ANALYTICS']);
  });
});
