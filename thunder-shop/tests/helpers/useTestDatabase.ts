// Runs in every test file before anything else: point the app at the test database.
import { TEST_DATABASE_URL, testDatabaseName } from './testDatabaseUrl';

testDatabaseName();
process.env.DATABASE_URL = TEST_DATABASE_URL;
