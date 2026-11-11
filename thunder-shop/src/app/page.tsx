'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

type User = { id: number; email: string; role: 'customer' | 'admin' };
type Product = {
  id: number;
  name: string;
  priceCents: number;
  priceVersion: number;
  stock: number;
};
// What the customer saw when they put the product in the cart.
type CartEntry = { quantity: number; priceCents: number; priceVersion: number };
type PriceChange = { productId: number; productName: string; newPriceCents: number; newPriceVersion: number };

const LIMIT_PER_PRODUCT = 2; // shown to the customer. The server enforces it.
type Order = {
  id: number;
  createdAt: string;
  totalCents: number;
  items: { productId: number; productName: string; quantity: number; unitPriceCents: number }[];
};
type Notice = { kind: 'success' | 'error'; text: string };

const formatPrice = (priceCents: number) => `$${(priceCents / 100).toFixed(2)}`;
const formatDateTime = (isoTime: string) =>
  new Date(isoTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

class ApiError extends Error {
  constructor(
    message: string,
    public readonly details?: { productId?: number; changes?: PriceChange[] },
  ) {
    super(message);
  }
}

/** Calls our API and returns the JSON body, or throws the API's own error message. */
async function callApi(urlPath: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const response = await fetch(urlPath, {
    method: options.method ?? 'GET',
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error?.message ?? 'Something went wrong.', body.error?.details);
  return body;
}

export default function ShopPage() {
  const [user, setUser] = useState<User | null>(null);
  // false until the first session check finishes, so the login form does not flash for someone already logged in.
  const [sessionChecked, setSessionChecked] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  // How many units of each product this customer has already bought, worked out from their order history.
  const [unitsBought, setUnitsBought] = useState<Record<number, number>>({});
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  // The cart: product id -> quantity and the price shown. It lives only in the browser until "Buy now" is clicked.
  const [cart, setCart] = useState<Record<number, CartEntry>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isBuying, setIsBuying] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // One key per cart. If the same cart is sent twice (double click, retry), the server returns the first order.
  // Made on first use, not during render: Next.js does not allow random values while prerendering the page.
  // null means "the next Buy now is a new order".
  const checkoutKey = useRef<string | null>(null);

  const loadShop = useCallback(async (loggedInUser: User) => {
    const { products: latestProducts } = await callApi('/api/products');
    setProducts(latestProducts);

    if (loggedInUser.role === 'customer') {
      const { orders } = (await callApi('/api/orders')) as { orders: Order[] };
      const bought: Record<number, number> = {};
      for (const order of orders) {
        for (const item of order.items) bought[item.productId] = (bought[item.productId] ?? 0) + item.quantity;
      }
      setUnitsBought(bought);
      setOrderHistory(orders);
    }
  }, []);

  // On page load, check whether there is already a session.
  useEffect(() => {
    callApi('/api/auth/session')
      .then(({ user: loggedInUser }) => {
        setUser(loggedInUser);
        return loadShop(loggedInUser);
      })
      .catch(() => setUser(null))
      .finally(() => setSessionChecked(true));
  }, [loadShop]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsLoggingIn(true);
    try {
      const { user: loggedInUser } = await callApi('/api/auth/login', {
        method: 'POST',
        body: { email: form.get('email'), password: form.get('password') },
      });
      setUser(loggedInUser);
      setNotice(null);
      await loadShop(loggedInUser);
    } catch (error) {
      setNotice({ kind: 'error', text: (error as Error).message });
    }
    setIsLoggingIn(false);
  }

  async function handleLogout() {
    await callApi('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setProducts([]);
    setUnitsBought({});
    setOrderHistory([]);
    setCart({});
    setNotice(null);
  }

  /** How many more units of this product the customer can still add to the cart. */
  function unitsStillAllowed(product: Product): number {
    const inCart = cart[product.id]?.quantity ?? 0;
    const leftOfLimit = LIMIT_PER_PRODUCT - (unitsBought[product.id] ?? 0) - inCart;
    return Math.max(0, Math.min(leftOfLimit, product.stock - inCart));
  }

  function changeCart(product: Product, quantity: number) {
    setCart((currentCart) => {
      const nextCart = { ...currentCart };
      if (quantity > 0) {
        // Keep the price the customer first saw for this product. The server tells us if it has moved.
        const { priceCents, priceVersion } = currentCart[product.id] ?? product;
        nextCart[product.id] = { quantity, priceCents, priceVersion };
      } else {
        delete nextCart[product.id];
      }
      return nextCart;
    });
    checkoutKey.current = null; // a changed cart is a new order
    setNotice(null);
  }

  function handleAddToCart(event: FormEvent<HTMLFormElement>, product: Product) {
    event.preventDefault();
    const quantity = Number(new FormData(event.currentTarget).get('quantity'));
    changeCart(product, (cart[product.id]?.quantity ?? 0) + quantity);
  }

  const cartLines = products
    .filter((product) => cart[product.id])
    .map((product) => {
      const { quantity, priceCents, priceVersion } = cart[product.id];
      return { product, quantity, priceCents, priceVersion, lineTotalCents: priceCents * quantity };
    });
  const cartTotalCents = cartLines.reduce((total, line) => total + line.lineTotalCents, 0);
  const totalSpentCents = orderHistory.reduce((total, order) => total + order.totalCents, 0);

  async function handleBuy() {
    if (!user || cartLines.length === 0) return;
    setIsBuying(true);
    try {
      // Only product ids and quantities are sent. The server looks up the prices itself.
      const { order } = (await callApi('/api/orders', {
        method: 'POST',
        // priceVersion says which price the customer was shown, so the server can stop the order if it changed.
        body: {
          items: cartLines.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity,
            priceVersion: line.priceVersion,
          })),
        },
        headers: { 'idempotency-key': (checkoutKey.current ??= crypto.randomUUID()) },
      })) as { order: Order };

      const summary = order.items.map((item) => `${item.quantity} x ${item.productName}`).join(', ');
      setNotice({ kind: 'success', text: `Order #${order.id} placed: ${summary}. Total charged ${formatPrice(order.totalCents)}.` });
      setCart({});
      checkoutKey.current = null;
    } catch (error) {
      // The whole order failed, so nothing was bought. The cart is kept so it can be fixed and tried again.
      const { message, details } = error as ApiError;
      if (details?.changes) {
        // A price moved while the customer was shopping. Show the new prices in the cart and let them decide.
        const changes = details.changes;
        const changeSummary = changes
          .map((change) => {
            const oldPriceCents = cart[change.productId]?.priceCents ?? 0;
            return `${change.productName} changed from ${formatPrice(oldPriceCents)} to ${formatPrice(change.newPriceCents)}`;
          })
          .join('; ');
        setCart((currentCart) => {
          const nextCart = { ...currentCart };
          for (const change of changes) {
            const entry = nextCart[change.productId];
            if (entry) {
              nextCart[change.productId] = { ...entry, priceCents: change.newPriceCents, priceVersion: change.newPriceVersion };
            }
          }
          return nextCart;
        });
        setNotice({
          kind: 'error',
          text: `Order not placed, nothing was charged. ${changeSummary}. Your cart now shows the new price. Click Buy now again if you still want it.`,
        });
      } else {
        const productName = products.find((product) => product.id === details?.productId)?.name;
        setNotice({ kind: 'error', text: `Order not placed. ${productName ? `${productName}: ` : ''}${message}` });
      }
    }
    setIsBuying(false);
    await loadShop(user).catch(() => undefined);
  }

  const noticeBox = notice && (
    <p
      role={notice.kind === 'error' ? 'alert' : 'status'}
      className={`rounded-md border-l-2 px-3 py-2 text-sm ${
        notice.kind === 'error'
          ? 'border-red-600 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300'
          : 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
      }`}
    >
      {notice.text}
    </p>
  );

  const inputClass =
    'mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300';
  const primaryButton =
    'rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300';
  const sectionTitle = 'text-sm font-medium uppercase tracking-wide text-zinc-500';

  if (!sessionChecked) {
    return <main className="grid min-h-screen place-items-center text-sm text-zinc-500">Loading…</main>;
  }

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Thunder Shop</h1>
          <p className="mt-1 text-sm text-zinc-500">Log in to see what is available.</p>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <label className="block text-sm">
              Email
              <input name="email" type="email" required autoComplete="username" className={inputClass} />
            </label>
            <label className="block text-sm">
              Password
              <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
            </label>
            <button type="submit" disabled={isLoggingIn} className={`${primaryButton} w-full`}>
              {isLoggingIn ? 'Logging in…' : 'Log in'}
            </button>
            {noticeBox}
          </form>
        </div>
      </main>
    );
  }

  const isCustomer = user.role === 'customer';

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="font-semibold tracking-tight">Thunder Shop</span>
          <div className="flex items-center gap-4 text-sm text-zinc-500">
            <span className="hidden sm:inline">
              {user.email} · {user.role}
            </span>
            <button onClick={handleLogout} className="text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100">
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-12 px-4 py-10 lg:grid-cols-[1fr_300px]">
        <section className={isCustomer ? '' : 'lg:col-span-2'}>
          <h2 className={sectionTitle}>{isCustomer ? 'Available now' : 'All products'}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {isCustomer
              ? `Limit ${LIMIT_PER_PRODUCT} per customer for each product.`
              : 'Includes sold-out products. Products, prices and stock are managed through the API.'}
          </p>

          {!isCustomer && noticeBox && <div className="mt-4">{noticeBox}</div>}

          {products.length === 0 ? (
            <p className="mt-6 text-sm text-zinc-500">Nothing is available right now.</p>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {products.map((product) => {
                const allowed = unitsStillAllowed(product);
                const bought = unitsBought[product.id] ?? 0;
                const inCart = cart[product.id]?.quantity ?? 0;
                return (
                  <li key={product.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                    <div className="min-w-0">
                      <p className="font-medium">{product.name}</p>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {product.stock > 0 ? `${product.stock} left` : 'Sold out'}
                        {isCustomer && ` · You have bought ${bought} of ${LIMIT_PER_PRODUCT}`}
                        {inCart > 0 && ` · ${inCart} in cart`}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="tabular-nums">{formatPrice(product.priceCents)}</span>
                      {isCustomer && (
                        <form onSubmit={(event) => handleAddToCart(event, product)} className="flex items-center gap-2">
                          {allowed > 0 ? (
                            <>
                              <label className="sr-only" htmlFor={`quantity-${product.id}`}>
                                Quantity
                              </label>
                              <select
                                id={`quantity-${product.id}`}
                                name="quantity"
                                defaultValue={1}
                                key={allowed}
                                className="rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
                              >
                                {Array.from({ length: allowed }, (_, index) => (
                                  <option key={index + 1}>{index + 1}</option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:border-zinc-900 dark:border-zinc-700 dark:hover:border-zinc-300"
                              >
                                Add
                              </button>
                            </>
                          ) : (
                            <span className="text-sm text-zinc-400">
                              {bought + inCart >= LIMIT_PER_PRODUCT ? 'Limit reached' : 'No more in stock'}
                            </span>
                          )}
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {isCustomer && (
          <aside className="lg:sticky lg:top-10 lg:self-start">
            <h2 className={sectionTitle}>Your cart</h2>
            {cartLines.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">Your cart is empty.</p>
            ) : (
              <>
                <ul className="mt-4 space-y-3 text-sm">
                  {cartLines.map(({ product, quantity, priceCents, lineTotalCents }) => (
                    <li key={product.id} className="flex justify-between gap-3">
                      <div>
                        <p>{product.name}</p>
                        <p className="text-zinc-500">
                          {quantity} × {formatPrice(priceCents)} ·{' '}
                          <button onClick={() => changeCart(product, 0)} className="underline-offset-4 hover:underline">
                            Remove
                          </button>
                        </p>
                      </div>
                      <span className="tabular-nums">{formatPrice(lineTotalCents)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex justify-between border-t border-zinc-200 pt-4 font-medium dark:border-zinc-800">
                  <span>Total</span>
                  <span className="tabular-nums">{formatPrice(cartTotalCents)}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">The price is confirmed when you buy.</p>
                <button onClick={handleBuy} disabled={isBuying} className={`${primaryButton} mt-4 w-full`}>
                  {isBuying ? 'Placing order…' : 'Buy now'}
                </button>
              </>
            )}
            {noticeBox && <div className="mt-4">{noticeBox}</div>}
          </aside>
        )}

        {isCustomer && (
          <section className="lg:col-span-2">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className={sectionTitle}>Order history</h2>
              {orderHistory.length > 0 && (
                <p className="text-sm text-zinc-500">
                  {orderHistory.length} {orderHistory.length === 1 ? 'order' : 'orders'} · {formatPrice(totalSpentCents)} in total
                </p>
              )}
            </div>

            {orderHistory.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">You have not ordered anything yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {orderHistory.map((order) => (
                  <li key={order.id} className="py-4">
                    <div className="flex justify-between gap-4">
                      <p className="font-medium">
                        Order #{order.id} <span className="ml-1 text-sm font-normal text-zinc-500">{formatDateTime(order.createdAt)}</span>
                      </p>
                      <span className="font-medium tabular-nums">{formatPrice(order.totalCents)}</span>
                    </div>
                    <ul className="mt-1 text-sm text-zinc-500">
                      {order.items.map((item) => (
                        <li key={item.productId}>
                          {item.quantity} × {item.productName} at {formatPrice(item.unitPriceCents)}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
