import type { Queryable } from '../db/connection';
import type { PublicUser } from '../schemas/auth';

export async function insertSession(
  db: Queryable,
  session: { tokenHash: string; userId: number; lifetimeSeconds: number; ipAddress: string | null; userAgent: string | null },
): Promise<void> {
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, ip_address, user_agent)
     VALUES ($1, $2, now() + make_interval(secs => $3), $4, $5)`,
    [session.tokenHash, session.userId, session.lifetimeSeconds, session.ipAddress, session.userAgent],
  );
}

/** The user comes from the database on every request, so a role change or logout takes effect straight away. */
export async function findUserByActiveSession(db: Queryable, tokenHash: string): Promise<PublicUser | undefined> {
  const { rows } = await db.query<PublicUser>(
    `SELECT users.id, users.email, users.role
       FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
    [tokenHash],
  );
  return rows[0];
}

export async function deleteSession(db: Queryable, tokenHash: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

export async function deleteExpiredSessions(db: Queryable): Promise<void> {
  await db.query('DELETE FROM sessions WHERE expires_at <= now()');
}
