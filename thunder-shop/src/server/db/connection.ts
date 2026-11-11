import { Pool, types, type PoolClient } from 'pg';

/** Anything that can run a query: the shared pool, or one connection that is inside a transaction. */
export type Queryable = Pool | PoolClient;

/** The local Docker database from docker-compose.yml. Only ever used outside production. */
export const DEFAULT_DATABASE_URL = 'postgres://shop:shop@localhost:5433/thunder_shop';

/**
 * Where the database is. In production DATABASE_URL must be set: silently falling back to a
 * well-known local password would hide a broken deploy, or connect it to the wrong database.
 */
export function resolveDatabaseUrl(env: { DATABASE_URL?: string; NODE_ENV?: string } = process.env): string {
  const configuredUrl = env.DATABASE_URL?.trim();
  if (configuredUrl) return configuredUrl;
  if (env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is not set. It is required in production; the local development default is not used there.');
  }
  return DEFAULT_DATABASE_URL;
}

/** The URL with its password hidden, safe to print in logs and error messages. */
export function withPasswordHidden(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '(DATABASE_URL is not a valid URL)';
  }
}

// Timestamps come back as ISO strings, the same shape the API returns.
types.setTypeParser(types.builtins.TIMESTAMPTZ, (value) => new Date(value).toISOString());

// Kept on globalThis so Next.js hot reload in development does not open a new pool on every edit.
const globalStore = globalThis as typeof globalThis & { thunderShopPool?: Pool };

export function getPool(): Pool {
  if (!globalStore.thunderShopPool) {
    globalStore.thunderShopPool = new Pool({
      connectionString: resolveDatabaseUrl(),
      max: 10,
      // One slow or stuck query must not hold up the shop during a release.
      statement_timeout: 10_000,
      lock_timeout: 5_000,
      idle_in_transaction_session_timeout: 15_000,
    });
  }
  return globalStore.thunderShopPool;
}

export async function closePool(): Promise<void> {
  const pool = globalStore.thunderShopPool;
  globalStore.thunderShopPool = undefined;
  await pool?.end();
}

/**
 * Runs the work inside one database transaction.
 * If the work throws, everything it wrote is rolled back and the error is passed on.
 */
export async function withTransaction<Result>(work: (transaction: PoolClient) => Promise<Result>): Promise<Result> {
  const connection = await getPool().connect();
  try {
    await connection.query('BEGIN');
    const result = await work(connection);
    await connection.query('COMMIT');
    return result;
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

/** PostgreSQL error codes this app reacts to. */
export const postgresErrorCode = {
  uniqueViolation: '23505',
  checkViolation: '23514',
  lockNotAvailable: '55P03',
  deadlockDetected: '40P01',
} as const;

export function isPostgresError(error: unknown, code: string, constraintName?: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const postgresError = error as { code?: string; constraint?: string };
  return postgresError.code === code && (constraintName === undefined || postgresError.constraint === constraintName);
}
