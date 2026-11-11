import { PATCH as priceRoute } from '@/app/api/products/[productId]/price/route';
import { GET as listProductsRoute } from '@/app/api/products/route';
import {
  apiRequest, countRows, figure, logInAs, noUrlParams, placeOrderAs, sneakers, startWithFreshDatabase, stockInDatabase, urlParams,
} from './helpers/testApp';

beforeEach(startWithFreshDatabase);

async function changeSneakersPrice(priceCents: number) {
  const response = await priceRoute(
    apiRequest('PATCH', '/api/products/1/price', { cookie: await logInAs('admin'), body: { priceCents } }),
    urlParams({ productId: String(sneakers.id) }),
  );
  return (await response.json()).product as { priceCents: number; priceVersion: number };
}

describe('A customer is never charged a price they have not seen', () => {
  test('if the price changed after the customer saw it, the order is refused and the new price is returned', async () => {
    const alice = await logInAs('alice');
    await changeSneakersPrice(29900); // the customer still has version 1 on screen

    const response = await placeOrderAs(alice, { items: [{ productId: sneakers.id, quantity: 1, priceVersion: 1 }] });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'PRICE_CHANGED',
        details: { changes: [{ productId: sneakers.id, productName: 'Midnight Runner sneakers', newPriceCents: 29900, newPriceVersion: 2 }] },
      },
    });
    expect(await countRows('orders')).toBe(0);
    expect(await stockInDatabase(sneakers.id)).toBe(sneakers.stock);
  });

  test('once the customer confirms with the new version, the order goes through at the new price', async () => {
    const alice = await logInAs('alice');
    const { priceVersion } = await changeSneakersPrice(29900);

    const response = await placeOrderAs(alice, { items: [{ productId: sneakers.id, quantity: 1, priceVersion }] });

    expect(response.status).toBe(201);
    expect((await response.json()).order.totalCents).toBe(29900);
  });

  test('one changed price refuses the whole cart, including products whose price did not change', async () => {
    const alice = await logInAs('alice');
    await changeSneakersPrice(19900);

    const response = await placeOrderAs(alice, {
      items: [
        { productId: figure.id, quantity: 1, priceVersion: 1 },
        { productId: sneakers.id, quantity: 1, priceVersion: 1 },
      ],
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error.details.changes).toHaveLength(1);
    expect(await countRows('orders')).toBe(0);
    expect(await stockInDatabase(figure.id)).toBe(figure.stock);
  });

  test('the version sent by the browser never sets the price', async () => {
    const response = await placeOrderAs(await logInAs('alice'), {
      items: [{ productId: sneakers.id, quantity: 1, priceVersion: 1, price: 1 }],
    });
    expect((await response.json()).order.totalCents).toBe(sneakers.priceCents);
  });

  test('an order without a version is charged the current price', async () => {
    await changeSneakersPrice(19900);
    const response = await placeOrderAs(await logInAs('alice'), { items: [{ productId: sneakers.id, quantity: 1 }] });
    expect(response.status).toBe(201);
    expect((await response.json()).order.totalCents).toBe(19900);
  });

  test('the version goes up only when the price really changes', async () => {
    expect((await changeSneakersPrice(sneakers.priceCents)).priceVersion).toBe(1); // same price again
    expect((await changeSneakersPrice(19900)).priceVersion).toBe(2);

    const { products } = await (
      await listProductsRoute(apiRequest('GET', '/api/products', { cookie: await logInAs('alice') }), noUrlParams)
    ).json();
    expect(products[0]).toMatchObject({ priceCents: 19900, priceVersion: 2 });
  });
});
