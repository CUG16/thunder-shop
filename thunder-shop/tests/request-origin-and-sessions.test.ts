import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as ordersRoute } from '@/app/api/orders/route';
import { getPool } from '@/server/db/connection';
import { apiRequest, buy, countRows, logInAs, noUrlParams, sneakers, startWithFreshDatabase } from './helpers/testApp';

beforeEach(startWithFreshDatabase);

const orderFromWebsite = (cookie: string, origin: string) =>
  ordersRoute(apiRequest('POST', '/api/orders', { cookie, body: buy(sneakers.id, 1), headers: { origin } }), noUrlParams);

describe('Requests from other websites (CSRF)', () => {
  test("another website cannot place an order with a logged-in customer's cookie", async () => {
    const response = await orderFromWebsite(await logInAs('alice'), 'https://evil.example');

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('CROSS_SITE_REQUEST');
    expect(await countRows('orders')).toBe(0);
  });

  test('a made-up or look-alike origin is refused too', async () => {
    const alice = await logInAs('alice');
    expect((await orderFromWebsite(alice, 'null')).status).toBe(403);
    expect((await orderFromWebsite(alice, 'http://localhost.evil.example')).status).toBe(403);
  });

  test('our own pages can place an order', async () => {
    const response = await orderFromWebsite(await logInAs('alice'), 'http://localhost');
    expect(response.status).toBe(201);
  });
});

describe('Session records', () => {
  test('a login records the IP address and browser it came from', async () => {
    await loginRoute(
      apiRequest('POST', '/api/auth/login', {
        body: { email: 'alice@releaseshop.test', password: 'Alice-Pass-123' },
        headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'Mozilla/5.0 (test browser)' },
      }),
      noUrlParams,
    );

    const { rows } = await getPool().query('SELECT ip_address, user_agent FROM sessions');
    expect(rows).toEqual([{ ip_address: '203.0.113.7', user_agent: 'Mozilla/5.0 (test browser)' }]);
  });

  test('the session token itself is never stored, only its hash', async () => {
    const cookie = await logInAs('alice');
    const sessionToken = cookie.split('=')[1];

    const { rows } = await getPool().query<{ token_hash: string }>('SELECT token_hash FROM sessions');
    expect(rows[0].token_hash).not.toBe(sessionToken);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
