import { apiRoute, jsonResponse } from '@/server/http/apiRoute';
import { requireLoggedInUser } from '@/server/http/session';
import { userOutput } from '@/server/schemas/auth';

/** Who am I logged in as? Used by the front end when the page loads. */
export const GET = apiRoute(async (request) => {
  const user = await requireLoggedInUser(request);
  return jsonResponse({ user: userOutput.parse(user) });
});
