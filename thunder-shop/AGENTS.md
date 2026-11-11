<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Thunder Shop: notes for coding agents

A limited-release shop for the ThunderLabs technical assessment. Next.js App Router + TypeScript + PostgreSQL.
The full requirements and the six business rules are in `.github/agents/feature-builder.agent.md`. Setup for
humans (with or without Docker) is in `README.md`.

## Running things

- Database: `pnpm db:up` (Docker, localhost:5433), or any PostgreSQL with `DATABASE_URL` and
  `TEST_DATABASE_URL` exported. `pnpm db:setup` migrates and seeds.
- Before you finish, run `pnpm test` (needs the database), `pnpm lint` and `npx tsc --noEmit`. Report any you could not run.
- Tests wipe the database named by `TEST_DATABASE_URL` and refuse to run unless its name ends in `_test`.
  Never point it at the dev database.

## Where code goes

Keep the layers separate. Each one only calls the layer below it.

1. `src/app/api/**/route.ts`: wrap every handler in `apiRoute()`. Check access with `requireRole()` /
   `requireLoggedInUser()`. Read bodies only with `readJsonBody(request, schema)` and URL or header values
   with `parseOrReject()`. Filter every response through an output schema (`userOutput.parse(...)` etc.).
2. `src/server/schemas/`: Zod input and output schemas.
3. `src/server/services/`: business rules and transactions (`withTransaction`).
4. `src/server/repositories/`: SQL only.
5. `migrations/NNN_*.sql`: schema changes go in a **new** numbered file. Never edit an applied migration.

## Security rules that must not regress

- SQL is always parameterized (`$1`, `$2`). Never build SQL from request values.
- Never trust identity, role, price or totals from the request body. The user comes from the session, and the price comes from
  the product row locked in the order transaction (rule 3).
- Do not read `request.json()` / `request.text()` directly: `readJsonBody` enforces the JSON content type
  and the 10 KB byte limit before buffering.
- Every order query filters on the session user's id (rule 2). Someone else's record gives 404, not 403.
- Business rules are enforced twice where possible: in the service, and by a database constraint.
- `DATABASE_URL` is required in production (`resolveDatabaseUrl`, checked at startup in
  `src/instrumentation.ts`). Do not add new hard-coded credentials or fallbacks.
- Print database URLs only through `withPasswordHidden()`.
- `orders`, `order_items` and `audit_log` are append-only (database triggers). Admin product changes write an
  audit entry in the same transaction.

## Tests

- Add API tests in `tests/` for every business rule or security behaviour you change, using the helpers in
  `tests/helpers/testApp.ts`. Check results directly in the database where it matters, not only through the API.
- Keep `README.md` in step with what is actually implemented.
- When you add or change an endpoint, request or response shape, or error code, update `openapi.yaml` to
  match and check it with `npx @redocly/cli lint openapi.yaml`.
