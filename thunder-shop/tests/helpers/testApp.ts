import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as ordersRoute } from '@/app/api/orders/route';
import { getPool } from '@/server/db/connection';
import { runMigrations } from '@/server/db/migrate';
import { seedDatabase, seedUsers } from '@/server/db/seed';
import { resetLoginAttemptLimiter } from '@/server/services/loginAttemptLimiter';
import { testDatabaseName } from './testDatabaseUrl';

// Ids and prices of the seed data, in the order it is inserted.
export const sneakers = { id: 1, priceCents: 24900, stock: 10, priceVersion: 1 };
export const figure = { id: 2, priceCents: 8900, stock: 5 };
export const poster = { id: 3, priceCents: 4500, stock: 3 };
export const adminUserId = 1;
export const aliceUserId = 2;

/** Every test starts from an empty schema with only the seed data in it. */
export async function startWithFreshDatabase(): Promise<void> {
  testDatabaseName(); // throws unless the database name ends in _test
  await getPool().query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations();
  await seedDatabase();
  resetLoginAttemptLimiter();
}

export const noUrlParams = { params: Promise.resolve({}) };
export const urlParams = <Params>(params: Params) => ({ params: Promise.resolve(params) });

export function apiRequest(
  method: string,
  urlPath: string,
  options: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {},
): Request {
  const headers: Record<string, string> = { ...options.headers };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  return new Request(`http://localhost${urlPath}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export function loginRequest(email: string, password: string, headers?: Record<string, string>) {
  return loginRoute(apiRequest('POST', '/api/auth/login', { body: { email, password }, headers }), noUrlParams);
}

/** Logs in through the real login route and returns the session cookie to send on later requests. */
export async function logInAs(who: 'admin' | 'alice' | 'bob'): Promise<string> {
  const user = seedUsers.find((seedUser) => seedUser.email.startsWith(who))!;
  const response = await loginRequest(user.email, user.password);
  if (response.status !== 200) throw new Error(`Login failed for ${who}: ${response.status}`);
  return response.headers.get('set-cookie')!.split(';')[0];
}

export function placeOrderAs(cookie: string | undefined, body: unknown, headers?: Record<string, string>) {
  return ordersRoute(apiRequest('POST', '/api/orders', { body, cookie, headers }), noUrlParams);
}

export const buy = (productId: number, quantity: unknown) => ({ items: [{ productId, quantity }] });

// Straight-from-the-database checks, so the tests do not rely on the API to verify the API.
export async function stockInDatabase(productId: number): Promise<number> {
  const { rows } = await getPool().query<{ stock: number }>('SELECT stock FROM products WHERE id = $1', [productId]);
  return rows[0].stock;
}

export async function countRows(table: 'orders' | 'order_items' | 'customer_product_totals' | 'audit_log' | 'sessions'): Promise<number> {
  const { rows } = await getPool().query<{ total: number }>(`SELECT count(*)::int AS total FROM ${table}`);
  return rows[0].total;
}
