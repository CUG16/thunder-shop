import { closePool, DEFAULT_DATABASE_URL } from '@/server/db/connection';
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
      console.error(`Could not reach PostgreSQL at ${process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL}.`);
      console.error('Start it with:  pnpm db:up');
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(closePool);
