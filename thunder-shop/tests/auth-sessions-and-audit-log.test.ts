import { GET as auditLogRoute } from '@/app/api/admin/audit-log/route';
import { POST as logoutRoute } from '@/app/api/auth/logout/route';
import { GET as sessionRoute } from '@/app/api/auth/session/route';
import { getPool } from '@/server/db/connection';
import { insertAuditEntry } from '@/server/repositories/auditLogRepository';
import { adminUserId, apiRequest, countRows, logInAs, loginRequest, noUrlParams, sneakers, startWithFreshDatabase } from './helpers/testApp';

beforeEach(startWithFreshDatabase);

const readAuditLog = (cookie?: string) => auditLogRoute(apiRequest('GET', '/api/admin/audit-log', { cookie }), noUrlParams);
const readSession = (cookie?: string) => sessionRoute(apiRequest('GET', '/api/auth/session', { cookie }), noUrlParams);

describe('Login', () => {
  test('a seeded user can log in and the session says who they are', async () => {
    const response = await readSession(await logInAs('alice'));
    expect(response.status).toBe(200);
    expect((await response.json()).user).toEqual({ id: 2, email: 'alice@releaseshop.test', role: 'customer' });
  });

  test('invalid input is rejected with a clear 400', async () => {
    const response = await loginRequest('not-an-email', '');
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('VALIDATION_FAILED');
  });

  test('a wrong password and an unknown email get the same answer', async () => {
    const wrongPassword = await loginRequest('alice@releaseshop.test', 'wrong');
    const unknownEmail = await loginRequest('nobody@releaseshop.test', 'wrong');
    expect([wrongPassword.status, unknownEmail.status]).toEqual([401, 401]);
    expect((await wrongPassword.json()).error.message).toBe((await unknownEmail.json()).error.message);
  });

});

describe('Sessions', () => {
  test('no cookie, or a made-up cookie, is treated as not logged in', async () => {
    expect((await readSession()).status).toBe(401);
    const madeUp = await readSession('thunder_shop_session=not-a-real-token');
    expect(madeUp.status).toBe(401);
    expect((await madeUp.json()).error.code).toBe('NOT_LOGGED_IN');
  });

  test('logging out ends the session on the server and clears the cookie', async () => {
    const cookie = await logInAs('alice');
    const logout = await logoutRoute(apiRequest('POST', '/api/auth/logout', { cookie }), noUrlParams);

    expect(logout.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect(await countRows('sessions')).toBe(0);
    expect((await readSession(cookie)).status).toBe(401);
  });

  test('a login posted from another website is refused (CSRF)', async () => {
    const response = await loginRequest('alice@releaseshop.test', 'Alice-Pass-123', { origin: 'https://evil.example' });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('CROSS_SITE_REQUEST');
    expect(await countRows('sessions')).toBe(0);
  });
});

describe('Admin audit log', () => {
  test('only admins can read it', async () => {
    expect((await readAuditLog()).status).toBe(401);
    expect((await readAuditLog(await logInAs('alice'))).status).toBe(403);
    expect((await readAuditLog(await logInAs('admin'))).status).toBe(200);
  });

  test('entries are returned newest first with who, what and when', async () => {
    for (const newPrice of [19900, 17900]) {
      await insertAuditEntry(getPool(), {
        actorUserId: adminUserId,
        actorEmail: 'admin@releaseshop.test',
        action: 'product.price_changed',
        productId: sneakers.id,
        oldValue: { priceCents: sneakers.priceCents },
        newValue: { priceCents: newPrice },
        requestId: `request-${newPrice}`,
      });
    }

    const { entries } = await (await readAuditLog(await logInAs('admin'))).json();
    expect(entries.map((entry: { requestId: string }) => entry.requestId)).toEqual(['request-17900', 'request-19900']);
    expect(entries[0]).toMatchObject({ actorEmail: 'admin@releaseshop.test', action: 'product.price_changed', newValue: { priceCents: 17900 } });
    expect(Date.parse(entries[0].happenedAt)).toBeGreaterThan(Date.now() - 60_000);
  });

  test('audit entries cannot be edited or deleted', async () => {
    await insertAuditEntry(getPool(), {
      actorUserId: adminUserId,
      actorEmail: 'admin@releaseshop.test',
      action: 'product.stock_changed',
      productId: sneakers.id,
      oldValue: { stock: 10 },
      newValue: { stock: 8 },
      requestId: 'request-1',
    });

    await expect(getPool().query("UPDATE audit_log SET actor_email = 'someone-else'")).rejects.toThrow(/append-only/);
    await expect(getPool().query('DELETE FROM audit_log')).rejects.toThrow(/append-only/);
    await expect(getPool().query('TRUNCATE audit_log')).rejects.toThrow(/append-only/);
  });
});
