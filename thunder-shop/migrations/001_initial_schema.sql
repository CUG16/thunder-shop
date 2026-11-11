-- Release shop schema (PostgreSQL).
-- Money is stored as whole cents. Timestamps are set by the database, never by the client.

CREATE TABLE users (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL,
  -- Only a bcrypt hash fits this pattern, so a plain password can never be stored by mistake.
  password_hash text NOT NULL CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'),
  role          text NOT NULL CHECK (role IN ('customer', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

-- Server-side sessions. Only a hash of the cookie token is stored,
-- so a leaked database cannot be used to log in as someone.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users (id),
  expires_at timestamptz NOT NULL,
  -- Where the login came from. Kept as evidence, not used to block anyone.
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL CHECK (length(btrim(name)) > 0),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  -- Goes up by one every time the price changes. The cart sends the version it showed,
  -- so the server can tell when a customer is looking at an old price.
  price_version integer NOT NULL DEFAULT 1,
  stock       integer NOT NULL CHECK (stock >= 0),          -- stock can never go below zero
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         integer NOT NULL REFERENCES users (id),
  idempotency_key text NOT NULL,
  total_cents     integer NOT NULL CHECK (total_cents >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- A retried request cannot create a second order.
  CONSTRAINT orders_one_per_idempotency_key UNIQUE (user_id, idempotency_key)
);

CREATE TABLE order_items (
  order_id         integer NOT NULL REFERENCES orders (id),
  product_id       integer NOT NULL REFERENCES products (id),
  quantity         integer NOT NULL CHECK (quantity >= 1),          -- rule 6
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),  -- rule 3: price charged, copied from products
  PRIMARY KEY (order_id, product_id)
);

-- Rule 4 backstop: running total of units each customer has bought of each product.
-- Even if the application check had a bug, the database refuses a third unit.
CREATE TABLE customer_product_totals (
  user_id      integer NOT NULL REFERENCES users (id),
  product_id   integer NOT NULL REFERENCES products (id),
  units_bought integer NOT NULL,
  PRIMARY KEY (user_id, product_id),
  CONSTRAINT customer_product_totals_limit CHECK (units_bought BETWEEN 1 AND 2)
);

-- Who changed what, and when. Written in the same transaction as the change itself.
CREATE TABLE audit_log (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  happened_at   timestamptz NOT NULL DEFAULT now(),
  actor_user_id integer NOT NULL REFERENCES users (id),
  actor_email   text NOT NULL,
  action        text NOT NULL CHECK (action IN ('product.created', 'product.price_changed', 'product.stock_changed')),
  product_id    integer NOT NULL REFERENCES products (id),
  old_value     jsonb,
  new_value     jsonb NOT NULL,
  request_id    text NOT NULL
);

-- History is append-only: orders, order items and the audit log can be added to,
-- but rows can never be edited, deleted or truncated.
CREATE FUNCTION refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: rows cannot be changed or removed', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER orders_append_only BEFORE UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER orders_no_truncate BEFORE TRUNCATE ON orders
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();

CREATE TRIGGER order_items_append_only BEFORE UPDATE OR DELETE ON order_items
  FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER order_items_no_truncate BEFORE TRUNCATE ON order_items
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();

CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
