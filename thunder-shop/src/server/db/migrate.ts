import fs from 'node:fs';
import path from 'node:path';
import { withTransaction } from './connection';

const migrationsFolder = path.join(process.cwd(), 'migrations');

/** Applies every .sql file in /migrations that has not been applied yet, in file-name order. */
export async function runMigrations(): Promise<string[]> {
  return withTransaction(async (transaction) => {
    // Only one process may migrate at a time.
    await transaction.query('SELECT pg_advisory_xact_lock(727274)');
    await transaction.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        file_name  text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const { rows } = await transaction.query<{ file_name: string }>('SELECT file_name FROM schema_migrations');
    const alreadyApplied = new Set(rows.map((row) => row.file_name));

    const pendingFiles = fs
      .readdirSync(migrationsFolder)
      .filter((fileName) => fileName.endsWith('.sql') && !alreadyApplied.has(fileName))
      .sort();

    for (const fileName of pendingFiles) {
      await transaction.query(fs.readFileSync(path.join(migrationsFolder, fileName), 'utf8'));
      await transaction.query('INSERT INTO schema_migrations (file_name) VALUES ($1)', [fileName]);
    }
    return pendingFiles;
  });
}
