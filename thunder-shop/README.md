# Thunder Shop

A small online shop for limited-release collectibles. Customers log in, see what's in stock at today's
price, and place orders. Admins add products and change prices and stock.

Built with Next.js, TypeScript and PostgreSQL. The browser is never trusted: every rule is checked on the
server, and the most important ones are checked a second time by the database.

---

## 1. Running it locally

You need **Node.js 20.9+**, **pnpm** (run `corepack enable` if you don't have it) and a **PostgreSQL** database.

### If you have Docker (4 commands)

```bash
pnpm install
pnpm db:up       # starts PostgreSQL in Docker on localhost:5433
pnpm db:setup    # creates the tables and adds the seed users and products
pnpm dev         # open http://localhost:3000
```

### If you don't have Docker

Without Docker, `pnpm db:up` fails with `docker: command not found`, and every other command then says
*"Could not reach PostgreSQL"*. That's fine: the app only needs some PostgreSQL server, not Docker.

1. Install and start PostgreSQL (version 14 or newer):

   | System | Install and start |
   | --- | --- |
   | macOS (Homebrew) | `brew install postgresql@17 && brew services start postgresql@17` |
   | macOS (app) | Install [Postgres.app](https://postgresapp.com) and click **Start** |
   | Windows | `winget install PostgreSQL.PostgreSQL.17`, or the installer from [postgresql.org](https://www.postgresql.org/download/windows/). It runs as a Windows service and asks you for a password for the `postgres` user. |

2. Create the user and database. You have to run these as a PostgreSQL admin user, which differs by system:

   | System | Run the commands with |
   | --- | --- |
   | macOS | `psql -d postgres -c "…"` (your Mac user is the admin) |
   | Windows | `psql -U postgres -c "…"` (asks for the password you chose in the installer). If `psql` isn't found, it's in `C:\Program Files\PostgreSQL\17\bin`. |

   The two commands are:
   ```sql
   CREATE ROLE shop LOGIN PASSWORD 'shop' CREATEDB;
   CREATE DATABASE thunder_shop OWNER shop;
   ```
   For example, on macOS:
   ```bash
   psql -d postgres -c "CREATE ROLE shop LOGIN PASSWORD 'shop' CREATEDB;"
   psql -d postgres -c "CREATE DATABASE thunder_shop OWNER shop;"
   ```

3. Tell the app where the database is (a local install usually uses port 5432).

   macOS:
   ```bash
   export DATABASE_URL=postgres://shop:shop@localhost:5432/thunder_shop
   export TEST_DATABASE_URL=postgres://shop:shop@localhost:5432/thunder_shop_test
   ```
   Windows (PowerShell):
   ```powershell
   $env:DATABASE_URL = "postgres://shop:shop@localhost:5432/thunder_shop"
   $env:TEST_DATABASE_URL = "postgres://shop:shop@localhost:5432/thunder_shop_test"
   ```
   These only last for the current terminal window. Run them again in each new window, or add them to your
   shell profile.

4. Then run `pnpm install`, `pnpm db:setup` and `pnpm dev` as above.

   On Windows, use Git Bash or WSL if you want to run `pnpm smoke`, since it's a bash script. Everything else
   works in PowerShell.

### Logins

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@releaseshop.test` | `Admin-Pass-123` |
| Customer | `alice@releaseshop.test` | `Alice-Pass-123` |
| Customer | `bob@releaseshop.test` | `Bob-Pass-123` |

There are three seed products: sneakers ($249, 10 in stock), a vinyl figure ($89, 5 in stock) and a signed
poster ($45, 3 in stock).

### Tests

```bash
pnpm test
```

The tests run against a separate database (`thunder_shop_test`) that is created automatically and wiped
before every test. As a safety catch, they refuse to run against any database whose name doesn't end in `_test`.

### API documentation

Every endpoint is described in [openapi.yaml](openapi.yaml) (OpenAPI 3.1). It covers what to send, what
comes back, and every error code with examples. To browse it:

- paste the file into [editor.swagger.io](https://editor.swagger.io), or
- run `npx @redocly/cli preview-docs openapi.yaml` and open the link it prints, or
- open it in VS Code with an OpenAPI extension.

To try the API by hand, log in to get the session cookie, then send it with each request:

```bash
curl -c jar -X POST localhost:3000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"alice@releaseshop.test","password":"Alice-Pass-123"}'
curl -b jar localhost:3000/api/products
curl -b jar -X POST localhost:3000/api/orders -H 'content-type: application/json' \
  -d '{"items":[{"productId":1,"quantity":2}]}'
```

### If something goes wrong

- **"Could not reach PostgreSQL"**: the database isn't running, or `DATABASE_URL` has the wrong port
  (5433 for Docker, usually 5432 otherwise).
- **"password authentication failed for user shop"**: step 2 above hasn't been run on that server.
- **"Too many failed logins"**: 5 wrong passwords lock that email for 15 minutes. Restarting `pnpm dev`
  clears it.
- **`pnpm start` says "DATABASE_URL is not set"**: production mode has no default database on purpose,
  so set it.

---

## 2. The database and why it looks like this

| Table | What it holds |
| --- | --- |
| `users` | Email, bcrypt password hash, and role (`customer` or `admin`) |
| `sessions` | Who is logged in. Only a hash of the cookie is stored, plus when it expires |
| `products` | Name, price in cents, a **price version** number, and stock |
| `orders` | One row per order: who placed it, the total, and an idempotency key |
| `order_items` | The lines of an order, each with the **price actually charged** |
| `customer_product_totals` | How many units of each product each customer has bought so far |
| `audit_log` | Every admin change to a product: who, what, old value, new value, when |

The reasoning behind it:

- **Money is stored as whole cents** (`integer`), never as decimals, so there are no rounding errors.
- **Each order line keeps its own price.** The price is copied from the product when the order is placed, so
  changing a product's price later never changes what an old order cost.
- **Prices have a version number** that goes up every time the price changes. The browser sends back the
  version it showed the customer, so the server can tell when they're looking at an old price.
- **A running total per customer and product** makes the "max 2" rule a single row to check and lock, rather
  than adding up every past order each time. The database itself refuses any value above 2.
- **The database guards the important rules too.** Stock can't go below zero, quantities must be 1 or more,
  passwords must look like a bcrypt hash, and a customer's total can't go over 2. Even a bug in the
  application code can't break these.
- **History can't be rewritten.** Database triggers stop anyone from editing or deleting orders, order lines
  or audit entries.
- **Sessions are stored in the database** rather than in a signed cookie, so logging out really ends the
  session, and a stolen copy of the database can't be used to log in.

The full schema is in [migrations/001_initial_schema.sql](migrations/001_initial_schema.sql).

---

## 3. How the code is organised and why

```
src/app/api/…            The API endpoints. Thin: read the request, check who's logged in, call a service, reply.
src/server/schemas/      What valid input and output look like (Zod). Anything else is rejected or dropped.
src/server/services/     The business rules: placing orders, changing products, logging in.
src/server/repositories/ The SQL. One file per table, always with parameters, never string-built.
src/server/http/         Shared plumbing: error replies, the cross-site check, body size limit, session cookie.
src/app/page.tsx         The single web page: product list, cart and order history.
migrations/              The database schema.
tests/                   API tests, one file per business rule.
```

Why it's split like this:

- **Each layer has one job**, so it's easy to find where something happens. Rules live in services, SQL lives
  in repositories, and HTTP details stay in the endpoints.
- **Every endpoint goes through the same wrapper** (`apiRoute`), so error handling, the cross-site check and
  "don't cache personal data" can't be forgotten on a new endpoint.
- **Input is checked against a schema before it reaches any business logic**, and output is filtered through
  a schema too. A password hash, for example, can never slip into a response by accident.
- **The tests call the real endpoints against a real PostgreSQL**, because the rules that matter most
  (locking, transactions, constraints) only behave properly in a real database.

---

## 4. How each business rule is enforced

**Rule 1: only customers can order, only admins can change products.**
Every endpoint checks the logged-in user's role, read fresh from the database on each request. An admin
can't place an order, and a customer gets "403 not allowed" on product changes.

**Rule 2: customers only see their own orders.**
Every order query includes "and the order belongs to the logged-in customer". Asking for someone else's order
gives the same "not found" as an order that doesn't exist, so you can't even tell it's there. The customer is
always taken from the session, never from anything sent in the request.

**Rule 3: the price is worked out on the server.**
- The order request simply has no price field. If the browser sends `price` or `total`, it's thrown away
  before the order code ever sees it.
- When an order is placed, the product rows are locked and the price is read from the database at that moment.
  That price is saved on each order line, and the total is calculated from it.
- Locking the row means an admin's price change waits for any order in progress to finish, so an order is
  never half at the old price and half at the new one.
- **Customers are never charged a price they didn't see.** The cart sends the price version it displayed. If
  the price has changed since, the whole order is refused and the new price is shown. The customer confirms
  and tries again. The version is only used for this check; it never decides the price.
- Saved prices can't be edited afterwards, even directly in the database.

**Rule 4: at most 2 units of a product per customer, across all their orders.**
- Inside the order's transaction, the product row is locked, then the customer's running total for that
  product is checked. Already bought + this order must be 2 or less.
- Because the product row is locked, two orders from the same customer at the same moment take turns. The
  second one sees the first one's units.
- As a second line of defence, the database refuses to store a total above 2. Even if the application check
  were skipped, the third unit is rejected.
- Tested with 10 simultaneous orders from one customer, and with 8 separate server processes ordering at
  the same instant. Exactly 2 units are sold every time.

**Rule 5: an order fully succeeds or fully fails.**
The whole order (checks, stock, running totals, order and lines) is one database transaction. If any line
fails, everything is rolled back and nothing is saved. Stock is taken with a single "only if enough is left"
statement, so two customers can never both buy the last unit. Retries and double clicks are safe: an order
sent twice with the same `Idempotency-Key` is only placed once.

**Rule 6: quantities are whole numbers of 1 or more.**
The input schema rejects `0`, `-1`, `1.5` and `"2"` (text) with a clear error, and the database has the same
check on order lines.

---

## 5. What I'd do next with more time

- Move the login lockout counter from memory into the database or Redis, so it works across several servers
  and survives restarts.
- Add per-IP rate limiting on login. Today someone can lock out a known email (including the admin's) by
  failing 5 times, and a flood of logins is expensive because password checking is deliberately slow.
- Make sure seed accounts can never be created in production, and require a real admin password from config.
- Connect the app with a database user that can only read and insert, so even a compromised app couldn't
  switch off the "history can't be changed" triggers.
- Add security headers (Content-Security-Policy, HSTS, frame protection).
- A "log out everywhere" option, and a limit on sessions per user.
- Admin screens in the web page. Admin actions are API-only for now.
- Add a check that compares the fields in `openapi.yaml` with the Zod schemas, so the API docs can't drift
  from the code.
- A queue or waiting room for big releases, so a sudden rush is handled fairly rather than first-come by the
  millisecond.

---

## 6. How AI tools were used

I used AI as a fast pair programmer, not as the decision-maker. I made the design calls and wrote the
rules down. I treated everything the AI produced as a draft that had to pass tests I could read and trust.

**How I set it up**
- Before writing code, I turned the assessment into an agent brief
  ([.github/agents/feature-builder.agent.md](.github/agents/feature-builder.agent.md)): the six business
  rules, the required layering, and "the API is the security boundary". Every AI session worked from the
  same checklist, so it couldn't quietly change scope.
- [Tool(s) you used to build the shop, e.g. "GitHub Copilot in VS Code with that custom agent"] for the
  build, and Claude Code for a security review at the end.

**What I decided myself**
- The design choices that make the rules hold under real load: locking product rows inside one
  transaction, a per-customer running total backed by a database CHECK constraint (rule 4), copying the
  price onto each order line (rule 3), price versions so nobody is charged a price they didn't see, and
  append-only orders and audit log.
- Making the database the second line of defence, so a bug in application code still can't oversell or
  break the 2-unit limit.

**What the AI helped with**
- Boilerplate and repetitive work: route handlers, Zod schemas, repository SQL, test scaffolding, styling.
- Test cases at the edges I asked for, especially concurrency: 10 simultaneous orders, and 8 separate
  server processes ordering at once, must still sell exactly 2 units.
- An attacker's-eye review of the finished app, which ranked the weak spots. I chose which to fix now
  (oversized request bodies, silent fallback to a default database password) and which to list under
  "next steps" (login rate limiting).

**How I checked its work**
- I didn't take "done" on trust. Each rule has its own test file that checks the database directly, not
  just the API's answer.
- Example from the security pass: the first fix for a missing `DATABASE_URL` threw an error at startup and
  looked correct. Running the real production server showed that this version of Next.js keeps serving
  500s instead of stopping, so I changed it to exit and confirmed the exit code. A first test run also
  "passed" only because an old server was still holding the port. Reading the logs caught it.
- I tested the "no Docker" setup instructions on a fresh PostgreSQL install rather than assuming they
  worked.
- [One real example from the build where you rejected or rewrote AI output, and why. For example: it put
  the purchase-limit check outside the transaction, it trusted a price from the request, or it wrote a
  test that couldn't fail.]

**What I'd keep doing**
Writing the rules down first and making tests the definition of "done" is what made AI safe to use here.
It let me move quickly without giving up correctness on the parts that matter: money, stock and who can
see what.

---

## 7. Assumptions and unknowns

### Assumptions I made

- **The 2-unit limit is for life, not per release.** The brief says "in total, across all of their orders", so
  I took it literally: once a customer has 2 of a product, they can never buy more of that product.
- **One person, one account.** The limit is per account. Someone with two accounts can buy 4.
- **Payment is out of scope.** A placed order counts as a completed purchase. There is no card payment,
  so there are also no failed payments, refunds or cancellations, and units are never given back.
- **Customers should never be charged a price they didn't see.** If an admin changes a price while a
  customer is checking out, I refuse the order and show the new price rather than charging it silently.
  This applies to price drops too: the customer just confirms again.
- **Admins are staff, not shoppers.** An admin account cannot place orders.
- **Sold-out products are hidden from customers.** Admins still see them.
- **"Update stock" means "set the number in stock"**, for example "we now have 25". It doesn't mean
  "add 5 more".
- **One currency, prices stored in cents, no GST or shipping.** The total is simply price × quantity.
- **Sensible limits I picked myself:** a price of at most $100,000, stock of at most 1,000,000, at most
  20 different products per order, sessions that last 1 hour, and 5 wrong passwords lock a login for
  15 minutes.
- **One server.** The login lockout counter is kept in memory, which is fine for one server but not
  for several.

### Things I wasn't sure about, and what I did

- **I didn't know how busy a release gets**, so I didn't build a queue. Instead I made sure the database
  handles a rush correctly: product rows are locked during an order, and the database itself refuses to
  oversell or go over the limit. I tested it with 10 simultaneous orders, and with 8 separate server
  processes ordering at the same instant. It holds, but I haven't load-tested it at release-day scale.
- **I didn't know what should happen when a price changes mid-checkout.** The brief only says the server
  sets the price. So I added a price version number: the customer gets the new price and confirms, and
  nobody is surprised by their bill.
- **I didn't know if this version of Next.js stops when a startup check fails.** I tested it, and it
  doesn't: it keeps running and answers with errors. So I made the app exit, and confirmed that it does.
- **I didn't know whether admin changes need a history**, so I kept an audit log of every price and stock
  change: who made it, when, and the old and new values. It's cheap now and hard to add later.

### Questions I'd ask the business

1. Is the 2-unit limit per product for life, per release, or per day? Does it reset if an order is
   refunded or cancelled?
2. How do we stop one person using several accounts? Is a limit per payment card or delivery address
   acceptable?
3. Should releases go live at a set time, with products hidden until then? At the moment a product is on
   sale as soon as an admin adds it.
4. On a busy drop, is "first come, first served" fair enough, or do you want a waiting room or a draw?
5. If a price drops mid-checkout, should the customer automatically get the lower price without being asked?
6. When the team updates stock, do they think "we now have 25" or "we received 5 more"? If two people
   update it at the same time, the second number wins.
7. Should staff be able to buy releases with a separate customer account?
8. Which payment provider, and do prices include GST?
9. How long should customers stay logged in, and do admins need stronger login (for example a second factor)?

---

## 8. A note to the General Manager

We've built the online shop for your releases. Customers log in, see what's in stock and what it costs
right now, and buy it, and your team has its own login to add new items and change stock and prices. Both
of the problems you had before are now blocked by the shop itself, not just by the website's screens. A
customer can't buy more than 2 of any item, even across separate orders or by clicking "buy" many times at
once: the shop counts everything they've already bought and refuses the extra. And nobody can pay less by
changing the price in their browser, because the shop ignores any price sent by the customer and always
charges the price on record at the moment they buy. If your team changes a price while someone is checking
out, the customer is shown the new price and asked to confirm, so nobody gets a surprise bill. Every price
and stock change your team makes is also recorded, with who made it and when. One thing it doesn't do yet:
it can't stop one person from opening several accounts to get around the 2-item limit. We'd like to
discuss with you how you'd want to handle that, for example a limit per card or per delivery address.
