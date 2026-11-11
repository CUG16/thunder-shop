import { GET as auditLogRoute } from '@/app/api/admin/audit-log/route';
import { PATCH as priceRoute } from '@/app/api/products/[productId]/price/route';
import { PATCH as stockRoute } from '@/app/api/products/[productId]/stock/route';
import { GET as listProductsRoute, POST as createProductRoute } from '@/app/api/products/route';
import { apiRequest, logInAs, noUrlParams, poster, sneakers, startWithFreshDatabase, urlParams } from './helpers/testApp';

beforeEach(startWithFreshDatabase);

const newProduct = { name: 'Gold edition cap', priceCents: 5900, stock: 4 };
const sneakersUrl = urlParams({ productId: String(sneakers.id) });

const listProducts = async (cookie: string) =>
  (await (await listProductsRoute(apiRequest('GET', '/api/products', { cookie }), noUrlParams)).json()).products as {
    id: number;
    priceCents: number;
    stock: number;
  }[];

describe('Product list', () => {
  test('a customer sees the current price and stock of every product in stock', async () => {
    const products = await listProducts(await logInAs('alice'));
    expect(products).toHaveLength(3);
    expect(products[0]).toMatchObject({ id: sneakers.id, priceCents: sneakers.priceCents, stock: sneakers.stock, priceVersion: 1 });
  });

  test('sold-out products are hidden from customers but still shown to admins', async () => {
    const admin = await logInAs('admin');
    await stockRoute(apiRequest('PATCH', '/api/products/3/stock', { cookie: admin, body: { stock: 0 } }), urlParams({ productId: String(poster.id) }));

    expect((await listProducts(await logInAs('alice'))).map((product) => product.id)).not.toContain(poster.id);
    expect((await listProducts(admin)).map((product) => product.id)).toContain(poster.id);
  });

  test('a price change shows up straight away and moves the price version on', async () => {
    const admin = await logInAs('admin');
    await priceRoute(apiRequest('PATCH', '/api/products/1/price', { cookie: admin, body: { priceCents: 19900 } }), sneakersUrl);

    const [updatedSneakers] = await listProducts(await logInAs('alice'));
    expect(updatedSneakers).toMatchObject({ priceCents: 19900, priceVersion: 2 });
  });
});

describe('Rule 1: only admins manage products', () => {
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

  test('changing a product that does not exist gives 404, and a bad id in the URL gives 400', async () => {
    const cookie = await logInAs('admin');
    const missing = await priceRoute(apiRequest('PATCH', '/api/products/9999/price', { cookie, body: { priceCents: 100 } }), urlParams({ productId: '9999' }));
    const badId = await priceRoute(apiRequest('PATCH', '/api/products/abc/price', { cookie, body: { priceCents: 100 } }), urlParams({ productId: 'abc' }));
    expect([missing.status, badId.status]).toEqual([404, 400]);
  });
});
