import { notAllowed, notLoggedIn } from '../errors';
import type { PublicUser, UserRole } from '../schemas/auth';
import { findUserBySessionToken, SESSION_LIFETIME_SECONDS, type ClientDetails } from '../services/authService';

const SESSION_COOKIE_NAME = 'thunder_shop_session';

export function readSessionToken(request: Request): string | undefined {
  const cookieHeader = request.headers.get('cookie') ?? '';
  for (const cookie of cookieHeader.split(';')) {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (name === SESSION_COOKIE_NAME) return valueParts.join('=');
  }
  return undefined;
}

/**
 * The caller's IP address and browser, for the session record.
 * The address comes from the X-Forwarded-For header, which is only trustworthy when the app runs
 * behind a proxy we control. That is why it is recorded as evidence and not used to block anyone.
 */
export function readClientDetails(request: Request): ClientDetails {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0].trim();
  const userAgent = request.headers.get('user-agent');
  return {
    ipAddress: forwardedFor ? forwardedFor.slice(0, 64) : null,
    userAgent: userAgent ? userAgent.slice(0, 300) : null,
  };
}

// HttpOnly: page scripts cannot read the cookie. SameSite=Lax: other websites cannot send it on POST or PATCH.
const cookieFlags = `Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

export const sessionCookie = (sessionToken: string) =>
  `${SESSION_COOKIE_NAME}=${sessionToken}; Max-Age=${SESSION_LIFETIME_SECONDS}; ${cookieFlags}`;

export const expiredSessionCookie = () => `${SESSION_COOKIE_NAME}=; Max-Age=0; ${cookieFlags}`;

export async function findLoggedInUser(request: Request): Promise<PublicUser | undefined> {
  const sessionToken = readSessionToken(request);
  return sessionToken ? findUserBySessionToken(sessionToken) : undefined;
}

/** 401 when nobody is logged in. */
export async function requireLoggedInUser(request: Request): Promise<PublicUser> {
  const user = await findLoggedInUser(request);
  if (!user) throw notLoggedIn();
  return user;
}

/** 401 when nobody is logged in, 403 when the account has the wrong role (rule 1). */
export async function requireRole(request: Request, requiredRole: UserRole): Promise<PublicUser> {
  const user = await requireLoggedInUser(request);
  if (user.role !== requiredRole) {
    throw notAllowed(requiredRole === 'admin' ? 'Only admins can do this.' : 'Only customers can do this.');
  }
  return user;
}
