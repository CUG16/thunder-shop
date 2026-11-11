import { buy, countRows, figure, logInAs, placeOrderAs, sneakers, startWithFreshDatabase, stockInDatabase } from './helpers/testApp';

beforeEach(startWithFreshDatabase);

describe('Rule 5: an order fully succeeds or fully fails', () => {
  test('when the second item breaks a rule, the first item is not saved either', async () => {
    const alice = await logInAs('alice');
    const response = await placeOrderAs(alice, {
      items: [
        { productId: sneakers.id, quantity: 1 }, // fine on its own
        { productId: figure.id, quantity: 3 }, // over the limit
      ],
    });

    expect(response.status).toBe(409);
    expect(await countRows('orders')).toBe(0);
    expect(await countRows('order_items')).toBe(0);
    expect(await countRows('customer_product_totals')).toBe(0);
    expect(await stockInDatabase(sneakers.id)).toBe(sneakers.stock);
    expect(await stockInDatabase(figure.id)).toBe(figure.stock);

    // The failed order did not use up any of Alice's allowance.
    expect((await placeOrderAs(alice, buy(sneakers.id, 2))).status).toBe(201);
  });

  test('an order for a product that does not exist saves nothing', async () => {
    const response = await placeOrderAs(await logInAs('alice'), {
      items: [
        { productId: sneakers.id, quantity: 1 },
        { productId: 9999, quantity: 1 },
      ],
    });
    expect(response.status).toBe(404);
    expect(await countRows('orders')).toBe(0);
    expect(await stockInDatabase(sneakers.id)).toBe(sneakers.stock);
  });

  test('sending the same order twice with the same Idempotency-Key creates one order', async () => {
    const alice = await logInAs('alice');
    const sameKey = { 'idempotency-key': 'checkout-click-0001' };

    const first = await placeOrderAs(alice, buy(sneakers.id, 1), sameKey);
    const retry = await placeOrderAs(alice, buy(sneakers.id, 1), sameKey);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect((await retry.json()).order.id).toBe((await first.json()).order.id);
    expect(await countRows('orders')).toBe(1);
    expect(await stockInDatabase(sneakers.id)).toBe(sneakers.stock - 1);
  });
});

describe('Double clicks and retries', () => {
  test('5 copies of the same order sent at the same moment create one order', async () => {
    const alice = await logInAs('alice');
    const sameKey = { 'idempotency-key': 'checkout-click-0002' };

    const responses = await Promise.all(Array.from({ length: 5 }, () => placeOrderAs(alice, buy(sneakers.id, 1), sameKey)));
    const orderIds = await Promise.all(responses.map(async (response) => (await response.json()).order.id));

    expect(responses.every((response) => response.status === 200 || response.status === 201)).toBe(true);
    expect(new Set(orderIds).size).toBe(1);
    expect(await countRows('orders')).toBe(1);
    expect(await stockInDatabase(sneakers.id)).toBe(sneakers.stock - 1);
  });
});

describe('Rule 6: quantities are whole numbers of 1 or more', () => {
  test.each([
    ['zero', 0],
    ['a negative number', -1],
    ['a decimal', 1.5],
    ['text', '2'],
    ['nothing', null],
    ['true', true],
  ])('quantity of %s is rejected with a clear error', async (_label, quantity) => {
    const response = await placeOrderAs(await logInAs('alice'), buy(sneakers.id, quantity));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details[0].field).toBe('items.0.quantity');
    expect(await countRows('orders')).toBe(0);
  });

  test('an empty order, a repeated product and a broken body are rejected', async () => {
    const alice = await logInAs('alice');
    const noItems = await placeOrderAs(alice, { items: [] });
    const repeatedProduct = await placeOrderAs(alice, {
      items: [
        { productId: sneakers.id, quantity: 1 },
        { productId: sneakers.id, quantity: 1 },
      ],
    });
    const notAnObject = await placeOrderAs(alice, 'buy everything');

    expect([noItems.status, repeatedProduct.status, notAnObject.status]).toEqual([400, 400, 400]);
  });
});
