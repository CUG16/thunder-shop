import { Client } from 'pg';
import { TEST_DATABASE_URL, testDatabaseName } from './testDatabaseUrl';

/** Runs once before all tests: creates the test database if it is not there yet. */
export default async function globalSetup(): Promise<void> {
  const databaseName = testDatabaseName();
  const maintenanceUrl = new URL(TEST_DATABASE_URL);
  maintenanceUrl.pathname = '/postgres';

  const client = new Client({ connectionString: maintenanceUrl.toString() });
  try {
    await client.connect();
  } catch {
    throw new Error(`Could not reach PostgreSQL for the tests (${TEST_DATABASE_URL}). Start it with: pnpm db:up`);
  }
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
  if (!rowCount) await client.query(`CREATE DATABASE "${databaseName}"`);
  await client.end();
}
