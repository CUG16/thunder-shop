import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { getPool } from '@/server/db/connection';
import { addUnitsBought } from '@/server/repositories/purchaseTotalRepository';
import {
  aliceUserId, buy, countRows, figure, logInAs, placeOrderAs, poster, sneakers, startWithFreshDatabase, stockInDatabase,
} from './helpers/testApp';

const runFile = promisify(execFile);

beforeEach(startWithFreshDatabase);

describe('Rule 4: at most 2 units of a product per customer, across all of their orders', () => {
  test('2 units in one order is allowed, a third unit in a later order is refused', async () => {
    const alice = await logInAs('alice');

    expect((await placeOrderAs(alice, buy(sneakers.id, 2))).status).toBe(201);

    const thirdUnit = await placeOrderAs(alice, buy(sneakers.id, 1));
    expect(thirdUnit.status).toBe(409);
    expect(await thirdUnit.json()).toMatchObject({
      error: { code: 'PURCHASE_LIMIT_EXCEEDED', details: { alreadyBought: 2, limitPerCustomer: 2 } },
    });
    expect(await stockInDatabase(sneakers.id)).toBe(sneakers.stock - 2);
  });

  test('1 unit, then 1 more is allowed, then another is refused', async () => {
    const alice = await logInAs('alice');
    expect((await placeOrderAs(alice, buy(sneakers.id, 1))).status).toBe(201);
    expect((await placeOrderAs(alice, buy(sneakers.id, 1))).status).toBe(201);
    expect((await placeOrderAs(alice, buy(sneakers.id, 1))).status).toBe(409);
  });

  test('3 units in a single order is refused and nothing is saved', async () => {
    const response = await placeOrderAs(await logInAs('alice'), buy(sneakers.id, 3));
    expect(response.status).toBe(409);
    expect(await countRows('orders')).toBe(0);
    expect(await stockInDatabase(sneakers.id)).toBe(sneakers.stock);
  });

  test('the limit is per customer and per product', async () => {
    const alice = await logInAs('alice');
    const bob = await logInAs('bob');
    await placeOrderAs(alice, buy(sneakers.id, 2));

    expect((await placeOrderAs(bob, buy(sneakers.id, 2))).status).toBe(201); // another customer
    expect((await placeOrderAs(alice, buy(figure.id, 2))).status).toBe(201); // another product
  });

  test('10 orders sent at the same time by one customer: exactly 2 units are sold', async () => {
    const alice = await logInAs('alice');

    const responses = await Promise.all(Array.from({ length: 10 }, () => placeOrderAs(alice, buy(sneakers.id, 1))));
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses.filter((status) => status === 201)).toHaveLength(2);
    expect(statuses.filter((status) => status === 409)).toHaveLength(8);
    expect(await stockInDatabase(sneakers.id)).toBe(sneakers.stock - 2);
  });

  test('8 separate server processes ordering at the same instant: still exactly 2 units are sold', async () => {
    // Real separate processes, each with its own database connection, all starting at the same instant.
    // Nothing in application memory is shared, so only the database locks can keep the rule here.
    const workerFile = path.join(__dirname, 'helpers', 'placeOrderInSeparateProcess.ts');
    const startAtTime = Date.now() + 4000;

    const results = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const { stdout } = await runFile(
          process.execPath,
          ['--import', 'tsx', workerFile, String(aliceUserId), String(sneakers.id), '1', String(startAtTime)],
          { env: process.env, cwd: process.cwd() },
        );
        return JSON.parse(stdout.trim().split('\n').pop()!) as { placed: boolean; code?: string };
      }),
    );

    expect(results.filter((result) => result.placed)).toHaveLength(2);
    expect(results.filter((result) => result.code === 'PURCHASE_LIMIT_EXCEEDED')).toHaveLength(6);
    expect(await stockInDatabase(sneakers.id)).toBe(sneakers.stock - 2);
    expect(await countRows('orders')).toBe(2);
  });

  test('the database itself refuses a third unit, even if the application check were skipped', async () => {
    await expect(addUnitsBought(getPool(), aliceUserId, sneakers.id, 3)).rejects.toMatchObject({
      constraint: 'customer_product_totals_limit',
    });
  });

  test('two customers ordering the last units at the same time: stock never goes below zero', async () => {
    // The poster has 3 in stock. Alice and Bob each ask for 2 at the same moment. Only one can win.
    const [alice, bob] = await Promise.all([logInAs('alice'), logInAs('bob')]);

    const responses = await Promise.all([placeOrderAs(alice, buy(poster.id, 2)), placeOrderAs(bob, buy(poster.id, 2))]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await stockInDatabase(poster.id)).toBe(1);
  });

  test('two customers cannot both buy the last units in stock', async () => {
    // The poster has 3 in stock. Alice takes 2, so Bob can only get 1.
    await placeOrderAs(await logInAs('alice'), buy(poster.id, 2));

    const bobTooMany = await placeOrderAs(await logInAs('bob'), buy(poster.id, 2));
    expect(bobTooMany.status).toBe(409);
    expect((await bobTooMany.json()).error.code).toBe('OUT_OF_STOCK');
    expect(await stockInDatabase(poster.id)).toBe(1);
  });
});
