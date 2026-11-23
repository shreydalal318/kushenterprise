import { prisma } from '@kush/db';
import { describe, expect, it } from 'vitest';
import { outbox } from '../src/notify/sms';
import { anon, callerWithHeaders, makeUser, PASSWORD, randomMobile } from './helpers';

describe('password login', () => {
  it('signs in with email or mobile and sets an HttpOnly cookie', async () => {
    const mobile = randomMobile();
    const u = await makeUser('EMPLOYEE', { mobile });
    const { api, resHeaders } = await anon();
    const r = await api.auth.loginWithPassword({ identifier: u.email!.toUpperCase(), password: PASSWORD, client: 'web' });
    expect(r.user.id).toBe(u.id);
    expect(r.token).toBeNull(); // web never sees the token
    const cookie = resHeaders.get('set-cookie')!;
    expect(cookie).toMatch(/^ke_session=[\w-]{40,};/);
    expect(cookie).toContain('HttpOnly');

    const byMobile = await (await anon()).api.auth.loginWithPassword({ identifier: `${mobile.slice(3, 8)} ${mobile.slice(8)}`, password: PASSWORD, client: 'web' });
    expect(byMobile.user.id).toBe(u.id);

    const token = cookie.split(';')[0]!.split('=')[1]!;
    const me = await (await callerWithHeaders({ cookie: `ke_session=${token}` })).api.auth.me();
    expect(me?.id).toBe(u.id);
  });

  it('returns a bearer token for the mobile app', async () => {
    const u = await makeUser('OWNER');
    const r = await (await anon()).api.auth.loginWithPassword({ identifier: u.email!, password: PASSWORD, client: 'mobile' });
    expect(r.token).toBeTruthy();
    const me = await (await callerWithHeaders({ authorization: `Bearer ${r.token}` })).api.auth.me();
    expect(me?.role).toBe('OWNER');
  });

  it('gives the same error for unknown users and wrong passwords', async () => {
    const u = await makeUser('EMPLOYEE');
    const { api } = await anon();
    await expect(api.auth.loginWithPassword({ identifier: 'nobody@test.local', password: 'x', client: 'web' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'Incorrect email/mobile or password' });
    await expect(api.auth.loginWithPassword({ identifier: u.email!, password: 'wrong', client: 'web' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'Incorrect email/mobile or password' });
  });

  it('locks the account after 5 failed attempts', async () => {
    const u = await makeUser('EMPLOYEE');
    const { api } = await anon();
    for (let i = 0; i < 5; i++) {
      await expect(api.auth.loginWithPassword({ identifier: u.email!, password: 'wrong', client: 'web' })).rejects.toThrow();
    }
    await expect(api.auth.loginWithPassword({ identifier: u.email!, password: PASSWORD, client: 'web' }))
      .rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    const log = await prisma.activityLog.findFirst({ where: { entityId: u.id, action: 'auth.locked' } });
    expect(log).toBeTruthy();
  });

  it('rejects deactivated users and logout revokes the session', async () => {
    const u = await makeUser('EMPLOYEE');
    const r = await (await anon()).api.auth.loginWithPassword({ identifier: u.email!, password: PASSWORD, client: 'mobile' });
    const authed = await callerWithHeaders({ authorization: `Bearer ${r.token}` });
    await authed.api.auth.logout();
    expect(await (await callerWithHeaders({ authorization: `Bearer ${r.token}` })).api.auth.me()).toBeNull();

    await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
    await expect((await anon()).api.auth.loginWithPassword({ identifier: u.email!, password: PASSWORD, client: 'web' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('OTP login', () => {
  const lastCode = (to: string) => {
    const m = [...outbox].reverse().find((o) => o.to === to);
    return m ? /^(\d{6})/.exec(m.message)![1]! : null;
  };

  it('does not reveal whether a number is registered', async () => {
    const before = outbox.length;
    const r = await (await anon()).api.auth.requestOtp({ mobile: randomMobile() });
    expect(r.sent).toBe(true);
    expect(outbox.length).toBe(before);
  });

  it('logs in with the right code, once', async () => {
    const mobile = randomMobile();
    const u = await makeUser('EMPLOYEE', { mobile });
    const { api } = await anon();
    await api.auth.requestOtp({ mobile: mobile.slice(3) });
    const code = lastCode(mobile)!;
    expect(code).toMatch(/^\d{6}$/);

    const wrong = code === '000000' ? '111111' : '000000';
    await expect(api.auth.verifyOtp({ mobile, code: wrong, client: 'web' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    const ok = await api.auth.verifyOtp({ mobile, code, client: 'mobile' });
    expect(ok.user.id).toBe(u.id);
    expect(ok.token).toBeTruthy();
    await expect(api.auth.verifyOtp({ mobile, code, client: 'web' })).rejects.toThrow(); // single use
  });

  it('throttles resends and locks a code after 5 wrong tries', async () => {
    const mobile = randomMobile();
    await makeUser('EMPLOYEE', { mobile });
    const { api } = await anon();
    await api.auth.requestOtp({ mobile });
    const first = lastCode(mobile);
    await api.auth.requestOtp({ mobile }); // within 30 s: not re-sent
    expect(outbox.filter((o) => o.to === mobile)).toHaveLength(1);

    const wrong = first === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await expect(api.auth.verifyOtp({ mobile, code: wrong, client: 'web' })).rejects.toThrow();
    }
    await expect(api.auth.verifyOtp({ mobile, code: first!, client: 'web' })).rejects.toThrow();
  });
});
