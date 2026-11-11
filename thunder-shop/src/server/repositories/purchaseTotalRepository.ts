import type { Queryable } from '../db/connection';

export const PURCHASE_LIMIT_CONSTRAINT = 'customer_product_totals_limit';

export async function unitsAlreadyBought(db: Queryable, customerId: number, productId: number): Promise<number> {
  const { rows } = await db.query<{ unitsBought: number }>(
    'SELECT units_bought AS "unitsBought" FROM customer_product_totals WHERE user_id = $1 AND product_id = $2',
    [customerId, productId],
  );
  return rows[0]?.unitsBought ?? 0;
}

/** Adds to the customer's running total. The table's CHECK constraint throws if the total would pass the limit. */
export async function addUnitsBought(db: Queryable, customerId: number, productId: number, quantity: number): Promise<void> {
  await db.query(
    `INSERT INTO customer_product_totals (user_id, product_id, units_bought) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id)
     DO UPDATE SET units_bought = customer_product_totals.units_bought + EXCLUDED.units_bought`,
    [customerId, productId, quantity],
  );
}
