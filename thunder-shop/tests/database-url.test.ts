import { DEFAULT_DATABASE_URL, resolveDatabaseUrl, withPasswordHidden } from '@/server/db/connection';

describe('Choosing the database', () => {
  test('DATABASE_URL is used when it is set', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: 'postgres://app:secret@db.internal/shop', NODE_ENV: 'production' })).toBe(
      'postgres://app:secret@db.internal/shop',
    );
  });

  test('in development and tests the local Docker database is the default', () => {
    expect(resolveDatabaseUrl({ NODE_ENV: 'development' })).toBe(DEFAULT_DATABASE_URL);
    expect(resolveDatabaseUrl({ NODE_ENV: 'test' })).toBe(DEFAULT_DATABASE_URL);
  });

  test('production refuses to fall back to the local default password', () => {
    expect(() => resolveDatabaseUrl({ NODE_ENV: 'production' })).toThrow('DATABASE_URL is not set');
    expect(() => resolveDatabaseUrl({ NODE_ENV: 'production', DATABASE_URL: '   ' })).toThrow('DATABASE_URL is not set');
  });

  test('the password is hidden when the URL is printed', () => {
    expect(withPasswordHidden('postgres://app:secret@db.internal:5432/shop')).toBe('postgres://app:***@db.internal:5432/shop');
    expect(withPasswordHidden('not a url')).not.toContain('not a url');
  });
});
