import { PATCH as priceRoute } from '@/app/api/products/[productId]/price/route';
import { PATCH as stockRoute } from '@/app/api/products/[productId]/stock/route';
import { GET as listProductsRoute } from '@/app/api/products/route';
import { apiRequest, logInAs, noUrlParams, poster, sneakers, startWithFreshDatabase, urlParams } from './helpers/testApp';

beforeEach(startWithFreshDatabase);

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

describe('Admin product changes', () => {
  test('changing a product that does not exist gives 404, and a bad id in the URL gives 400', async () => {
    const cookie = await logInAs('admin');
    const missing = await priceRoute(apiRequest('PATCH', '/api/products/9999/price', { cookie, body: { priceCents: 100 } }), urlParams({ productId: '9999' }));
    const badId = await priceRoute(apiRequest('PATCH', '/api/products/abc/price', { cookie, body: { priceCents: 100 } }), urlParams({ productId: 'abc' }));
    expect([missing.status, badId.status]).toEqual([404, 400]);
  });
});
