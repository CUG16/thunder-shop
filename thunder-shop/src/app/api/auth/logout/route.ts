import { apiRoute, jsonResponse } from '@/server/http/apiRoute';
import { expiredSessionCookie, readSessionToken } from '@/server/http/session';
import { logOut } from '@/server/services/authService';

export const POST = apiRoute(async (request) => {
  const sessionToken = readSessionToken(request);
  if (sessionToken) await logOut(sessionToken);
  return jsonResponse({ loggedOut: true }, 200, { 'set-cookie': expiredSessionCookie() });
});
