import bcrypt from 'bcryptjs';
import { withTransaction } from './connection';

export const PASSWORD_HASH_ROUNDS = 12;

export const seedUsers = [
  { email: 'admin@releaseshop.test', password: 'Admin-Pass-123', role: 'admin' },
  { email: 'alice@releaseshop.test', password: 'Alice-Pass-123', role: 'customer' },
  { email: 'bob@releaseshop.test', password: 'Bob-Pass-123', role: 'customer' },
] as const;

export const seedProducts = [
  { name: 'Midnight Runner sneakers', priceCents: 24900, stock: 10 },
  { name: 'Founders Edition vinyl figure', priceCents: 8900, stock: 5 },
  { name: 'Signed tour poster', priceCents: 4500, stock: 3 },
] as const;

// Hashing is slow on purpose. The tests re-seed a fresh database many times, so the hashes are reused.
let cachedPasswordHashes: string[] | undefined;

/** Adds the seed users and products. Does nothing if the database already has users. */
export async function seedDatabase(): Promise<boolean> {
  cachedPasswordHashes ??= await Promise.all(
    seedUsers.map((user) => bcrypt.hash(user.password, PASSWORD_HASH_ROUNDS)),
  );
  const passwordHashes = cachedPasswordHashes;

  return withTransaction(async (transaction) => {
    const { rows } = await transaction.query<{ userCount: number }>('SELECT count(*)::int AS "userCount" FROM users');
    if (rows[0].userCount > 0) return false;

    for (const [index, user] of seedUsers.entries()) {
      await transaction.query('INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)', [
        user.email,
        passwordHashes[index],
        user.role,
      ]);
    }
    for (const product of seedProducts) {
      await transaction.query('INSERT INTO products (name, price_cents, stock) VALUES ($1, $2, $3)', [
        product.name,
        product.priceCents,
        product.stock,
      ]);
    }
    return true;
  });
}
