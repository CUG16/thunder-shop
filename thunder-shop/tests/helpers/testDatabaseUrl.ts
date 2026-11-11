export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://shop:shop@localhost:5433/thunder_shop_test';

/** The tests wipe their database before every test, so they refuse to run against anything not named *_test. */
export function testDatabaseName(): string {
  const databaseName = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(databaseName)) {
    throw new Error(`Refusing to run tests against "${databaseName}". The test database name must end in _test.`);
  }
  return databaseName;
}
