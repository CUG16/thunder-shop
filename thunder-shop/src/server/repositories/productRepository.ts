import type { Queryable } from '../db/connection';
import type { Product } from '../schemas/product';

const productColumns = `id, name, price_cents AS "priceCents", price_version AS "priceVersion", stock, updated_at AS "updatedAt"`;
const selectProduct = `SELECT ${productColumns} FROM products`;

export async function listAllProducts(db: Queryable): Promise<Product[]> {
  return (await db.query<Product>(`${selectProduct} ORDER BY id`)).rows;
}

export async function listProductsInStock(db: Queryable): Promise<Product[]> {
  return (await db.query<Product>(`${selectProduct} WHERE stock > 0 ORDER BY id`)).rows;
}

export async function findProductById(db: Queryable, productId: number): Promise<Product | undefined> {
  return (await db.query<Product>(`${selectProduct} WHERE id = $1`, [productId])).rows[0];
}

/**
 * Reads products and locks their rows until the transaction ends (SELECT ... FOR UPDATE).
 * Any other order or admin change for the same product waits its turn.
 * Rows are locked in id order so two orders with the same products can never deadlock each other.
 */
export async function lockProductsForUpdate(transaction: Queryable, productIds: number[]): Promise<Product[]> {
  const { rows } = await transaction.query<Product>(`${selectProduct} WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [
    productIds,
  ]);
  return rows;
}

export async function insertProduct(
  db: Queryable,
  newProduct: { name: string; priceCents: number; stock: number },
): Promise<Product> {
  const { rows } = await db.query<Product>(
    `INSERT INTO products (name, price_cents, stock) VALUES ($1, $2, $3) RETURNING ${productColumns}`,
    [newProduct.name, newProduct.priceCents, newProduct.stock],
  );
  return rows[0];
}

/** Sets the price. The price version goes up only when the price really changes. */
export async function updateProductPrice(db: Queryable, productId: number, priceCents: number): Promise<void> {
  await db.query(
    `UPDATE products
        SET price_version = price_version + CASE WHEN price_cents = $1 THEN 0 ELSE 1 END,
            price_cents = $1,
            updated_at = now()
      WHERE id = $2`,
    [priceCents, productId],
  );
}

export async function updateProductStock(db: Queryable, productId: number, stock: number): Promise<void> {
  await db.query('UPDATE products SET stock = $1, updated_at = now() WHERE id = $2', [stock, productId]);
}

/**
 * Takes units out of stock only if enough are left. The check and the change are one statement,
 * so two orders can never both take the last unit. Returns false when there was not enough stock.
 */
export async function takeUnitsFromStock(db: Queryable, productId: number, quantity: number): Promise<boolean> {
  const result = await db.query(
    'UPDATE products SET stock = stock - $1, updated_at = now() WHERE id = $2 AND stock >= $1',
    [quantity, productId],
  );
  return result.rowCount === 1;
}
