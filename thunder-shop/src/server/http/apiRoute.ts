import { unstable_rethrow } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { isPostgresError, postgresErrorCode } from '../db/connection';
import { AppError, crossSiteRequest, validationFailed } from '../errors';

export type RouteContext<Params> = { params: Promise<Params> };

const MAX_BODY_CHARACTERS = 10_000;

export function jsonResponse(body: unknown, httpStatus = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status: httpStatus, headers });
}

function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof AppError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message, details: error.details, requestId } },
      error.httpStatus,
    );
  }
  // The database gave up waiting for a lock, or stopped a deadlock. Nothing was saved, so it is safe to retry.
  if (isPostgresError(error, postgresErrorCode.lockNotAvailable) || isPostgresError(error, postgresErrorCode.deadlockDetected)) {
    return jsonResponse(
      { error: { code: 'SHOP_BUSY', message: 'The shop is very busy. Nothing was charged, please try again.', requestId } },
      503,
    );
  }
  // Unexpected errors are logged on the server. The caller only gets the request id to quote.
  console.error(`[${requestId}]`, error);
  return jsonResponse(
    { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.', requestId } },
    500,
  );
}

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection. Browsers add an Origin header to every POST and PATCH, saying which website the
 * request came from. If that is a different website from ours, the request is refused, so another
 * site cannot use a logged-in customer's cookie to place an order. Tools such as curl send no
 * Origin header and are not affected.
 */
function refuseCrossSiteWrites(request: Request): void {
  if (READ_ONLY_METHODS.has(request.method)) return;
  const origin = request.headers.get('origin');
  if (!origin) return;

  const ourHost = request.headers.get('host') ?? new URL(request.url).host;
  let originHost: string | undefined;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = undefined;
  }
  if (originHost !== ourHost) throw crossSiteRequest();
}

/**
 * Wraps a route handler so every route gets the same behaviour:
 * a cross-site check, a request id, clear JSON errors, and no caching of personal data.
 */
export function apiRoute<Params = unknown>(
  handler: (request: Request, extras: { params: Params; requestId: string }) => Promise<Response> | Response,
) {
  return async (request: Request, context: RouteContext<Params>): Promise<Response> => {
    const requestId = randomUUID();
    let response: Response;
    try {
      refuseCrossSiteWrites(request);
      response = await handler(request, { params: await context.params, requestId });
    } catch (error) {
      // With Cache Components on, Next.js tries to prerender GET routes at build time and stops
      // when a route reads the request (cookies, headers). That stop is a thrown error Next.js must
      // handle itself, so it is passed on instead of being turned into a 500.
      unstable_rethrow(error);
      response = errorResponse(error, requestId);
    }
    response.headers.set('x-request-id', requestId);
    response.headers.set('cache-control', 'no-store');
    return response;
  };
}

const describeProblems = (error: z.ZodError) =>
  error.issues.map((issue) => ({ field: issue.path.join('.') || '(body)', problem: issue.message }));

/** Reads the JSON body and checks it against a schema. Throws a 400 with the list of problems if it does not fit. */
export async function readJsonBody<Schema extends z.ZodType>(request: Request, schema: Schema): Promise<z.infer<Schema>> {
  // Only JSON is accepted. Plain HTML forms on other websites cannot send JSON, which blocks cross-site form posts.
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new AppError(415, 'JSON_REQUIRED', 'Send the request body as application/json.');
  }

  const bodyText = await request.text();
  if (bodyText.length > MAX_BODY_CHARACTERS) {
    throw new AppError(413, 'BODY_TOO_LARGE', 'The request body is too large.');
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw validationFailed([{ field: '(body)', problem: 'Body is not valid JSON.' }]);
  }

  const result = schema.safeParse(body);
  if (!result.success) throw validationFailed(describeProblems(result.error));
  return result.data;
}

/** Checks a value that did not come from the body, such as an id in the URL or a header. */
export function parseOrReject<Schema extends z.ZodType>(schema: Schema, value: unknown, field: string): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw validationFailed([{ field, problem: result.error.issues[0].message }]);
  return result.data;
}
