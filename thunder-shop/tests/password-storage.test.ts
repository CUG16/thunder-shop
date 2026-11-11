import { getPool } from '@/server/db/connection';
import { loginRequest, startWithFreshDatabase } from './helpers/testApp';

beforeEach(startWithFreshDatabase);

describe('Password storage', () => {
  test('passwords are stored as bcrypt hashes, never as plain text', async () => {
    const { rows } = await getPool().query<{ password_hash: string }>('SELECT password_hash FROM users');
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.password_hash).toMatch(/^\$2[aby]\$12\$/);
  });

  test('the database refuses to store anything that is not a bcrypt hash', async () => {
    await expect(
      getPool().query("INSERT INTO users (email, password_hash, role) VALUES ('eve@releaseshop.test', 'plain-password', 'customer')"),
    ).rejects.toThrow(/users_password_hash_check/);
  });

  test('a password longer than bcrypt can read is rejected', async () => {
    const response = await loginRequest('alice@releaseshop.test', 'x'.repeat(73));
    expect(response.status).toBe(400);
  });

  test('logging out ends the session on the server, so the old cookie stops working', async () => {
    const { POST: logoutRoute } = await import('@/app/api/auth/logout/route');
    const { GET: sessionRoute } = await import('@/app/api/auth/session/route');
    const { apiRequest, logInAs, noUrlParams } = await import('./helpers/testApp');

    const cookie = await logInAs('alice');
    expect((await sessionRoute(apiRequest('GET', '/api/auth/session', { cookie }), noUrlParams)).status).toBe(200);

    await logoutRoute(apiRequest('POST', '/api/auth/logout', { cookie }), noUrlParams);
    expect((await sessionRoute(apiRequest('GET', '/api/auth/session', { cookie }), noUrlParams)).status).toBe(401);
  });
});
