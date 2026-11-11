import type { Queryable } from '../db/connection';
import type { UserRole } from '../schemas/auth';

export type UserRecord = { id: number; email: string; passwordHash: string; role: UserRole };

export async function findUserByEmail(db: Queryable, email: string): Promise<UserRecord | undefined> {
  const { rows } = await db.query<UserRecord>(
    'SELECT id, email, password_hash AS "passwordHash", role FROM users WHERE lower(email) = lower($1)',
    [email],
  );
  return rows[0];
}
