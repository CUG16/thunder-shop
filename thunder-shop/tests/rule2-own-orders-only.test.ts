import { GET as orderByIdRoute } from '@/app/api/orders/[orderId]/route';
import { GET as orderHistoryRoute } from '@/app/api/orders/route';
import { apiRequest, buy, figure, logInAs, noUrlParams, placeOrderAs, sneakers, startWithFreshDatabase, urlParams } from './helpers/testApp';

beforeEach(startWithFreshDatabase);

describe('Rule 2: customers only see their own orders', () => {
  test('order history lists only the orders of the logged-in customer', async () => {
    const alice = await logInAs('alice');
    const bob = await logInAs('bob');
    await placeOrderAs(alice, buy(sneakers.id, 1));
    await placeOrderAs(bob, buy(figure.id, 2));

    const aliceHistory = await (await orderHistoryRoute(apiRequest('GET', '/api/orders', { cookie: alice }), noUrlParams)).json();
    const bobHistory = await (await orderHistoryRoute(apiRequest('GET', '/api/orders', { cookie: bob }), noUrlParams)).json();

    expect(aliceHistory.orders).toHaveLength(1);
    expect(aliceHistory.orders[0].items[0].productId).toBe(sneakers.id);
    expect(bobHistory.orders).toHaveLength(1);
    expect(bobHistory.orders[0].items[0].productId).toBe(figure.id);
  });

  test("asking for another customer's order by id gives 404, the same as an order that does not exist", async () => {
    const alice = await logInAs('alice');
    const bob = await logInAs('bob');
    const { order } = await (await placeOrderAs(alice, buy(sneakers.id, 1))).json();

    const asAlice = await orderByIdRoute(apiRequest('GET', `/api/orders/${order.id}`, { cookie: alice }), urlParams({ orderId: String(order.id) }));
    const asBob = await orderByIdRoute(apiRequest('GET', `/api/orders/${order.id}`, { cookie: bob }), urlParams({ orderId: String(order.id) }));
    const missing = await orderByIdRoute(apiRequest('GET', '/api/orders/9999', { cookie: bob }), urlParams({ orderId: '9999' }));

    expect(asAlice.status).toBe(200);
    expect(asBob.status).toBe(404);
    expect(await asBob.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(missing.status).toBe(404);
  });

  test('a user id sent in the request cannot place an order for someone else', async () => {
    const bob = await logInAs('bob');
    await placeOrderAs(bob, { ...buy(sneakers.id, 1), userId: 2, customerId: 2 });

    const alice = await logInAs('alice');
    const aliceHistory = await (await orderHistoryRoute(apiRequest('GET', '/api/orders', { cookie: alice }), noUrlParams)).json();
    expect(aliceHistory.orders).toHaveLength(0);
  });

  test('order history needs a login', async () => {
    const response = await orderHistoryRoute(apiRequest('GET', '/api/orders'), noUrlParams);
    expect(response.status).toBe(401);
  });
});
