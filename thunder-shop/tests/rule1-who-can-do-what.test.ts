import { GET as auditLogRoute } from '@/app/api/admin/audit-log/route';
import { PATCH as priceRoute } from '@/app/api/products/[productId]/price/route';
import { PATCH as stockRoute } from '@/app/api/products/[productId]/stock/route';
import { GET as listProductsRoute, POST as createProductRoute } from '@/app/api/products/route';
import { apiRequest, buy, logInAs, loginRequest, noUrlParams, placeOrderAs, sneakers, startWithFreshDatabase, urlParams } from './helpers/testApp';

beforeEach(startWithFreshDatabase);

const newProduct = { name: 'Gold edition cap', priceCents: 5900, stock: 4 };
const sneakersUrl = urlParams({ productId: String(sneakers.id) });

describe('Rule 1: only customers order, only admins manage products', () => {
  test('someone who is not logged in cannot place an order', async () => {
    const response = await placeOrderAs(undefined, buy(sneakers.id, 1));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('NOT_LOGGED_IN');
  });

  test('a made-up session cookie is treated as not logged in', async () => {
    const response = await placeOrderAs('thunder_shop_session=not-a-real-token', buy(sneakers.id, 1));
    expect(response.status).toBe(401);
  });

  test('an admin cannot place an order', async () => {
    const response = await placeOrderAs(await logInAs('admin'), buy(sneakers.id, 1));
    expect(response.status).toBe(403);
  });

  test('a customer can place an order', async () => {
    const response = await placeOrderAs(await logInAs('alice'), buy(sneakers.id, 1));
    expect(response.status).toBe(201);
  });

  test('a customer cannot create a product or change price or stock', async () => {
    const cookie = await logInAs('alice');

    const create = await createProductRoute(apiRequest('POST', '/api/products', { cookie, body: newProduct }), noUrlParams);
    const price = await priceRoute(apiRequest('PATCH', '/api/products/1/price', { cookie, body: { priceCents: 1 } }), sneakersUrl);
    const stock = await stockRoute(apiRequest('PATCH', '/api/products/1/stock', { cookie, body: { stock: 999 } }), sneakersUrl);
    const auditLog = await auditLogRoute(apiRequest('GET', '/api/admin/audit-log', { cookie }), noUrlParams);

    expect([create.status, price.status, stock.status, auditLog.status]).toEqual([403, 403, 403, 403]);
  });

  test('someone who is not logged in cannot see products or change them', async () => {
    const list = await listProductsRoute(apiRequest('GET', '/api/products'), noUrlParams);
    const create = await createProductRoute(apiRequest('POST', '/api/products', { body: newProduct }), noUrlParams);
    const price = await priceRoute(apiRequest('PATCH', '/api/products/1/price', { body: { priceCents: 1 } }), sneakersUrl);

    expect([list.status, create.status, price.status]).toEqual([401, 401, 401]);
  });

  test('an admin can create a product and change its price and stock', async () => {
    const cookie = await logInAs('admin');

    const create = await createProductRoute(apiRequest('POST', '/api/products', { cookie, body: newProduct }), noUrlParams);
    expect(create.status).toBe(201);
    const { product } = await create.json();
    const productUrl = urlParams({ productId: String(product.id) });

    const price = await priceRoute(
      apiRequest('PATCH', `/api/products/${product.id}/price`, { cookie, body: { priceCents: 6500 } }),
      productUrl,
    );
    const stock = await stockRoute(
      apiRequest('PATCH', `/api/products/${product.id}/stock`, { cookie, body: { stock: 9 } }),
      productUrl,
    );

    expect((await price.json()).product.priceCents).toBe(6500);
    expect((await stock.json()).product.stock).toBe(9);
  });

  test('admin input is validated: negative price, decimal stock and empty name are rejected', async () => {
    const cookie = await logInAs('admin');

    const negativePrice = await priceRoute(apiRequest('PATCH', '/api/products/1/price', { cookie, body: { priceCents: -1 } }), sneakersUrl);
    const decimalStock = await stockRoute(apiRequest('PATCH', '/api/products/1/stock', { cookie, body: { stock: 2.5 } }), sneakersUrl);
    const emptyName = await createProductRoute(
      apiRequest('POST', '/api/products', { cookie, body: { ...newProduct, name: '   ' } }),
      noUrlParams,
    );

    expect([negativePrice.status, decimalStock.status, emptyName.status]).toEqual([400, 400, 400]);
  });

  test('a wrong password is refused, and repeated failures lock the login for a while', async () => {
    const wrongLogin = () => loginRequest('alice@releaseshop.test', 'wrong');

    for (let attempt = 1; attempt <= 5; attempt++) {
      expect((await wrongLogin()).status).toBe(401);
    }
    expect((await wrongLogin()).status).toBe(429);
  });

  test('the login response never contains the password hash', async () => {
    const response = await loginRequest('alice@releaseshop.test', 'Alice-Pass-123');
    const bodyText = await response.text();
    expect(bodyText).not.toMatch(/password|hash|\$2[aby]\$/i);
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Lax/);
  });
});
