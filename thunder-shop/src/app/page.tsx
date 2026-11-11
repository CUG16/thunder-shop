'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type User = { id: number; email: string; role: 'customer' | 'admin' };
type Product = {
  id: number;
  name: string;
  priceCents: number;
  priceVersion: number;
  stock: number;
};
type Notice = { kind: 'success' | 'error'; text: string };

const LIMIT_PER_PRODUCT = 2; // shown to the customer. The server enforces it.

const formatPrice = (priceCents: number) => `$${(priceCents / 100).toFixed(2)}`;

/** Calls our API and returns the JSON body, or throws the API's own error message. */
async function callApi(urlPath: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(urlPath, {
    method: options.method ?? 'GET',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? 'Something went wrong.');
  return body;
}

export default function ShopPage() {
  const [user, setUser] = useState<User | null>(null);
  // false until the first session check finishes, so the login form does not flash for someone already logged in.
  const [sessionChecked, setSessionChecked] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);

  const loadProducts = useCallback(async () => {
    const { products: latestProducts } = (await callApi('/api/products')) as { products: Product[] };
    setProducts(latestProducts);
  }, []);

  // On page load, check whether there is already a session.
  useEffect(() => {
    callApi('/api/auth/session')
      .then(async ({ user: loggedInUser }) => {
        setUser(loggedInUser);
        await loadProducts();
      })
      .catch(() => setUser(null))
      .finally(() => setSessionChecked(true));
  }, [loadProducts]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const { user: loggedInUser } = await callApi('/api/auth/login', {
        method: 'POST',
        body: { email: form.get('email'), password: form.get('password') },
      });
      setUser(loggedInUser);
      setNotice(null);
      await loadProducts();
    } catch (error) {
      setNotice({ kind: 'error', text: (error as Error).message });
    }
  }

  async function handleLogout() {
    await callApi('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setProducts([]);
    setNotice(null);
  }

  const noticeBox = notice && (
    <p
      role={notice.kind === 'error' ? 'alert' : 'status'}
      style={{
        padding: '0.75rem',
        border: '1px solid',
        borderColor: notice.kind === 'error' ? '#b00020' : '#1b7a3d',
        background: notice.kind === 'error' ? '#fdecee' : '#e9f7ee',
      }}
    >
      {notice.text}
    </p>
  );

  if (!sessionChecked) {
    return (
      <main>
        <h1>Thunder Shop</h1>
        <p>Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main>
        <h1>Thunder Shop</h1>
        <form onSubmit={handleLogin}>
          <p>
            <label>
              Email <input name="email" type="email" required autoComplete="username" />
            </label>
          </p>
          <p>
            <label>
              Password <input name="password" type="password" required autoComplete="current-password" />
            </label>
          </p>
          <p>
            <button type="submit">Log in</button>
          </p>
        </form>
        {noticeBox}
      </main>
    );
  }

  const isCustomer = user.role === 'customer';

  return (
    <main>
      <h1>Thunder Shop</h1>
      <p>
        Logged in as {user.email} ({user.role}) <button onClick={handleLogout}>Log out</button>
      </p>

      <h2>{isCustomer ? 'Available now' : 'All products'}</h2>
      {products.length === 0 && <p>Nothing is available right now.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {products.map((product) => (
          <li key={product.id} style={{ borderTop: '1px solid #ccc', padding: '0.75rem 0' }}>
            <strong>{product.name}</strong> — {formatPrice(product.priceCents)} —{' '}
            {product.stock > 0 ? `${product.stock} left` : 'sold out'}
            {isCustomer && (
              <div>
                <small>Limit {LIMIT_PER_PRODUCT} per customer.</small>
              </div>
            )}
          </li>
        ))}
      </ul>
      {noticeBox}
    </main>
  );
}
