// Run as its own Node process by the race test. Several of these start at the same moment
// against the same database, which is what several servers taking orders at once looks like.
import { randomUUID } from 'node:crypto';
import { closePool, getPool } from '@/server/db/connection';
import { placeOrder } from '@/server/services/orderService';

const [customerId, productId, quantity, startAtTime] = process.argv.slice(2).map(Number);

async function main() {
  await getPool().query('SELECT 1'); // connect first, so the wait below ends with every process ready to go
  while (Date.now() < startAtTime) {
    /* wait for the shared start time */
  }
  try {
    await placeOrder({ customerId, items: [{ productId, quantity }], idempotencyKey: randomUUID() });
    console.log(JSON.stringify({ placed: true }));
  } catch (error) {
    console.log(JSON.stringify({ placed: false, code: (error as { code?: string }).code }));
  }
  await closePool();
}

main();
