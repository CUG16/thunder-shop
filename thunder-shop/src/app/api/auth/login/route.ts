import { apiRoute, jsonResponse, readJsonBody } from '@/server/http/apiRoute';
import { readClientDetails, sessionCookie } from '@/server/http/session';
import { loginInput, userOutput } from '@/server/schemas/auth';
import { logIn } from '@/server/services/authService';

export const POST = apiRoute(async (request) => {
  const { email, password } = await readJsonBody(request, loginInput);
  const { sessionToken, user } = await logIn(email, password, readClientDetails(request));
  return jsonResponse({ user: userOutput.parse(user) }, 200, { 'set-cookie': sessionCookie(sessionToken) });
});
