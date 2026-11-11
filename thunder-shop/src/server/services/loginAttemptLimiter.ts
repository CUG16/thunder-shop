// Slows down password guessing: after too many failed logins for one email, further tries are refused for a while.
// Kept in memory, which is fine for one server. With several servers this would move to the database or Redis.

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

const failedAttemptTimesByEmail = new Map<string, number[]>();

function recentFailures(email: string): number[] {
  const windowStart = Date.now() - LOCKOUT_WINDOW_MS;
  return (failedAttemptTimesByEmail.get(email) ?? []).filter((attemptTime) => attemptTime > windowStart);
}

export function isLockedOut(email: string): boolean {
  return recentFailures(email).length >= MAX_FAILED_ATTEMPTS;
}

export function recordFailedLogin(email: string): void {
  failedAttemptTimesByEmail.set(email, [...recentFailures(email), Date.now()]);
}

export function clearFailedLogins(email: string): void {
  failedAttemptTimesByEmail.delete(email);
}

export function resetLoginAttemptLimiter(): void {
  failedAttemptTimesByEmail.clear();
}
