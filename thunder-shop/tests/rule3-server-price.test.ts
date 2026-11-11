import { PATCH as priceRoute } from '@/app/api/products/[productId]/price/route';
import { GET as orderHistoryRoute } from '@/app/api/orders/route';
import { getPool } from '@/server/db/connection';
import { apiRequest, logInAs, noUrlParams, placeOrderAs, sneakers, startWithFreshDatabase, urlParams } from './helpers/testApp';

beforeEach(startWithFreshDatabase);

async function changeSneakersPrice(priceCents: number) {
  const response = await priceRoute(
    apiRequest('PATCH', '/api/products/1/price', { cookie: await logInAs('admin'), body: { priceCents } }),
    urlParams({ productId: String(sneakers.id) }),
  );
  expect(response.status).toBe(200);
}

describe('Rule 3: the price is worked out on the server and saved on the order', () => {
  test('a price sent by the browser is ignored', async () => {
    const tamperedOrder = {
      items: [{ productId: sneakers.id, quantity: 2, price: 1, priceCents: 1, unitPriceCents: 1 }],
      price: 1,
      totalCents: 1,
    };

    const response = await placeOrderAs(await logInAs('alice'), tamperedOrder);
    const { order } = await response.json();

    expect(response.status).toBe(201);
    expect(order.items[0].unitPriceCents).toBe(sneakers.priceCents);
    expect(order.totalCents).toBe(sneakers.priceCents * 2);

    const { rows } = await getPool().query('SELECT unit_price_cents FROM order_items WHERE order_id = $1', [order.id]);
    expect(rows).toEqual([{ unit_price_cents: sneakers.priceCents }]);
  });

  test('an order uses the price in the database at the moment it is placed', async () => {
    await changeSneakersPrice(19900);
    const { order } = await (await placeOrderAs(await logInAs('alice'), { items: [{ productId: sneakers.id, quantity: 1 }] })).json();
    expect(order.items[0].unitPriceCents).toBe(19900);
    expect(order.totalCents).toBe(19900);
  });

  test('a later price change does not alter what an earlier order was charged', async () => {
    const alice = await logInAs('alice');
    await placeOrderAs(alice, { items: [{ productId: sneakers.id, quantity: 1 }] });

    await changeSneakersPrice(99900);

    const { orders } = await (await orderHistoryRoute(apiRequest('GET', '/api/orders', { cookie: alice }), noUrlParams)).json();
    expect(orders[0].items[0].unitPriceCents).toBe(sneakers.priceCents);
    expect(orders[0].totalCents).toBe(sneakers.priceCents);
  });

  test('the price saved on an order cannot be edited afterwards, even with direct database access', async () => {
    await placeOrderAs(await logInAs('alice'), { items: [{ productId: sneakers.id, quantity: 1 }] });
    await expect(getPool().query('UPDATE order_items SET unit_price_cents = 1')).rejects.toThrow(/append-only/);
    await expect(getPool().query('DELETE FROM order_items')).rejects.toThrow(/append-only/);
    await expect(getPool().query('TRUNCATE orders CASCADE')).rejects.toThrow(/append-only/);
  });
});
