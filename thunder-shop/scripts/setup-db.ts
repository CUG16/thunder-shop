import { closePool, resolveDatabaseUrl, withPasswordHidden } from '@/server/db/connection';
import { runMigrations } from '@/server/db/migrate';
import { seedDatabase, seedUsers } from '@/server/db/seed';

async function main() {
  const appliedMigrations = await runMigrations();
  console.log(appliedMigrations.length ? `Applied migrations: ${appliedMigrations.join(', ')}` : 'Database schema is up to date.');

  const seeded = await seedDatabase();
  console.log(seeded ? 'Seed data added.' : 'Seed data already present, left untouched.');

  console.log('\nSeed logins:');
  for (const user of seedUsers) {
    console.log(`  ${user.role.padEnd(8)} ${user.email}  /  ${user.password}`);
  }
}

main()
  .catch((error) => {
    if ((error as { code?: string }).code === 'ECONNREFUSED') {
      console.error(`Could not reach PostgreSQL at ${withPasswordHidden(resolveDatabaseUrl())}.`);
      console.error('With Docker:     pnpm db:up   then run this again.');
      console.error('Without Docker:  start your own PostgreSQL and set DATABASE_URL. See "Setup without Docker" in README.md.');
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(closePool);
