import { GET as auditLogRoute } from '@/app/api/admin/audit-log/route';
import { PATCH as priceRoute } from '@/app/api/products/[productId]/price/route';
import { getPool } from '@/server/db/connection';
import { apiRequest, countRows, logInAs, noUrlParams, sneakers, startWithFreshDatabase, urlParams } from './helpers/testApp';

beforeEach(startWithFreshDatabase);

const sneakersUrl = urlParams({ productId: String(sneakers.id) });

describe('Audit log: an admin cannot later deny a change', () => {
  test('a price change records who did it, the old and new price, and when', async () => {
    const admin = await logInAs('admin');
    const change = await priceRoute(apiRequest('PATCH', '/api/products/1/price', { cookie: admin, body: { priceCents: 19900 } }), sneakersUrl);

    const { entries } = await (await auditLogRoute(apiRequest('GET', '/api/admin/audit-log', { cookie: admin }), noUrlParams)).json();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorEmail: 'admin@releaseshop.test',
      action: 'product.price_changed',
      productId: sneakers.id,
      oldValue: { priceCents: sneakers.priceCents },
      newValue: { priceCents: 19900 },
      requestId: change.headers.get('x-request-id'),
    });
    expect(Date.parse(entries[0].happenedAt)).toBeGreaterThan(Date.now() - 60_000);
  });

  test('a change that is rejected leaves no audit entry', async () => {
    const admin = await logInAs('admin');
    await priceRoute(apiRequest('PATCH', '/api/products/1/price', { cookie: admin, body: { priceCents: -5 } }), sneakersUrl);
    await priceRoute(apiRequest('PATCH', '/api/products/9999/price', { cookie: admin, body: { priceCents: 100 } }), urlParams({ productId: '9999' }));
    expect(await countRows('audit_log')).toBe(0);
  });

  test('audit entries cannot be edited or deleted', async () => {
    const admin = await logInAs('admin');
    await priceRoute(apiRequest('PATCH', '/api/products/1/price', { cookie: admin, body: { priceCents: 19900 } }), sneakersUrl);

    await expect(getPool().query("UPDATE audit_log SET actor_email = 'someone-else'")).rejects.toThrow(/append-only/);
    await expect(getPool().query('DELETE FROM audit_log')).rejects.toThrow(/append-only/);
    await expect(getPool().query('TRUNCATE audit_log')).rejects.toThrow(/append-only/);
  });
});
