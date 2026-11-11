import type { Queryable } from '../db/connection';
import type { Order } from '../schemas/order';

export const IDEMPOTENCY_KEY_CONSTRAINT = 'orders_one_per_idempotency_key';

type OrderItemRow = {
  orderId: number;
  createdAt: string;
  totalCents: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPriceCents: number;
};

// Every read includes "orders.user_id = $1" so an order can only ever be loaded by its owner (rule 2).
const selectOrderItems = `
  SELECT orders.id AS "orderId", orders.created_at AS "createdAt", orders.total_cents AS "totalCents",
         order_items.product_id AS "productId", products.name AS "productName",
         order_items.quantity, order_items.unit_price_cents AS "unitPriceCents"
    FROM orders
    JOIN order_items ON order_items.order_id = orders.id
    JOIN products ON products.id = order_items.product_id
   WHERE orders.user_id = $1`;

function groupIntoOrders(rows: OrderItemRow[]): Order[] {
  const ordersById = new Map<number, Order>();
  for (const row of rows) {
    let order = ordersById.get(row.orderId);
    if (!order) {
      order = { id: row.orderId, createdAt: row.createdAt, totalCents: row.totalCents, items: [] };
      ordersById.set(row.orderId, order);
    }
    order.items.push({
      productId: row.productId,
      productName: row.productName,
      quantity: row.quantity,
      unitPriceCents: row.unitPriceCents,
    });
  }
  return [...ordersById.values()];
}

export async function listOrdersOfCustomer(db: Queryable, customerId: number): Promise<Order[]> {
  const { rows } = await db.query<OrderItemRow>(`${selectOrderItems} ORDER BY orders.id DESC, order_items.product_id`, [
    customerId,
  ]);
  return groupIntoOrders(rows);
}

export async function findOrderOfCustomer(db: Queryable, orderId: number, customerId: number): Promise<Order | undefined> {
  const { rows } = await db.query<OrderItemRow>(`${selectOrderItems} AND orders.id = $2 ORDER BY order_items.product_id`, [
    customerId,
    orderId,
  ]);
  return groupIntoOrders(rows)[0];
}

export async function findOrderIdByIdempotencyKey(
  db: Queryable,
  customerId: number,
  idempotencyKey: string,
): Promise<number | undefined> {
  const { rows } = await db.query<{ id: number }>('SELECT id FROM orders WHERE user_id = $1 AND idempotency_key = $2', [
    customerId,
    idempotencyKey,
  ]);
  return rows[0]?.id;
}

export async function insertOrder(db: Queryable, customerId: number, idempotencyKey: string, totalCents: number): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    'INSERT INTO orders (user_id, idempotency_key, total_cents) VALUES ($1, $2, $3) RETURNING id',
    [customerId, idempotencyKey, totalCents],
  );
  return rows[0].id;
}

export async function insertOrderItem(
  db: Queryable,
  orderId: number,
  productId: number,
  quantity: number,
  unitPriceCents: number,
): Promise<void> {
  await db.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES ($1, $2, $3, $4)', [
    orderId,
    productId,
    quantity,
    unitPriceCents,
  ]);
}
