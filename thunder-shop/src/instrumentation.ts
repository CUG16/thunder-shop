/**
 * Runs once when the Next.js server starts, before it accepts any request.
 * A production server with no DATABASE_URL stops here with a clear message,
 * instead of starting up and failing on the first customer request.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // `next build` also runs with NODE_ENV=production but never needs the database.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { resolveDatabaseUrl } = await import('./server/db/connection');
  try {
    resolveDatabaseUrl();
  } catch (error) {
    // A thrown error here only makes Next.js answer every request with a 500 while the process keeps
    // running. Exiting lets the process manager or container platform see the failed start.
    console.error(`Refusing to start: ${(error as Error).message}`);
    process.exit(1);
  }
}
