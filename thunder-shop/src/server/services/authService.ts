import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { getPool } from '../db/connection';
import { PASSWORD_HASH_ROUNDS } from '../db/seed';
import { AppError, tooManyLoginAttempts } from '../errors';
import { deleteExpiredSessions, deleteSession, findUserByActiveSession, insertSession } from '../repositories/sessionRepository';
import { findUserByEmail } from '../repositories/userRepository';
import type { PublicUser } from '../schemas/auth';
import { clearFailedLogins, isLockedOut, recordFailedLogin } from './loginAttemptLimiter';

export const SESSION_LIFETIME_SECONDS = 60 * 60;

// The cookie holds a random token. The database only stores its hash.
const hashSessionToken = (sessionToken: string) => createHash('sha256').update(sessionToken).digest('hex');

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
let placeholderPasswordHash: string | undefined;

/** Where a login came from. Recorded on the session as evidence. */
export type ClientDetails = { ipAddress: string | null; userAgent: string | null };

export async function logIn(
  email: string,
  password: string,
  client: ClientDetails,
): Promise<{ sessionToken: string; user: PublicUser }> {
  if (isLockedOut(email)) throw tooManyLoginAttempts();

  const user = await findUserByEmail(getPool(), email);
  placeholderPasswordHash ??= await bcrypt.hash('placeholder-password', PASSWORD_HASH_ROUNDS);
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? placeholderPasswordHash);

  if (!user || !passwordMatches) {
    recordFailedLogin(email);
    // Same message for both cases, so the API does not reveal which emails exist.
    throw new AppError(401, 'INVALID_LOGIN', 'Email or password is incorrect.');
  }
  clearFailedLogins(email);

  await deleteExpiredSessions(getPool());
  const sessionToken = randomBytes(32).toString('base64url');
  await insertSession(getPool(), {
    tokenHash: hashSessionToken(sessionToken),
    userId: user.id,
    lifetimeSeconds: SESSION_LIFETIME_SECONDS,
    ...client,
  });

  return { sessionToken, user: { id: user.id, email: user.email, role: user.role } };
}

export async function logOut(sessionToken: string): Promise<void> {
  await deleteSession(getPool(), hashSessionToken(sessionToken));
}

export async function findUserBySessionToken(sessionToken: string): Promise<PublicUser | undefined> {
  return findUserByActiveSession(getPool(), hashSessionToken(sessionToken));
}
