import { getPool, isPostgresError, postgresErrorCode, withTransaction } from '../db/connection';
import { notFound, outOfStock, priceChanged, purchaseLimitExceeded, type PriceChange } from '../errors';
import {
  findOrderIdByIdempotencyKey,
  findOrderOfCustomer,
  IDEMPOTENCY_KEY_CONSTRAINT,
  insertOrder,
  insertOrderItem,
  listOrdersOfCustomer,
} from '../repositories/orderRepository';
import { lockProductsForUpdate, takeUnitsFromStock } from '../repositories/productRepository';
import { addUnitsBought, PURCHASE_LIMIT_CONSTRAINT, unitsAlreadyBought } from '../repositories/purchaseTotalRepository';
import type { Order, PlaceOrderInput } from '../schemas/order';

/** Rule 4. The same number is in the CHECK constraint on customer_product_totals. */
export const MAX_UNITS_PER_CUSTOMER_PER_PRODUCT = 2;

type PlacedOrder = { order: Order; wasAlreadyPlaced: boolean };

/**
 * Places an order. Everything happens in one database transaction:
 *
 *   1. Lock the product rows (SELECT ... FOR UPDATE). Other orders for the same products wait here.
 *   2. If the customer was shown an older price, stop and tell them the new one.
 *   3. Check the customer's running total against the limit (rule 4).
 *   4. Take the units out of stock, only if enough are left.
 *   5. Save the order with the price read in step 1 (rule 3).
 *
 * If any step fails, the transaction is rolled back and nothing is left behind (rule 5).
 *
 * `wasAlreadyPlaced` is true when the same idempotency key was used before: the first order is
 * returned and nothing new is bought.
 */
export async function placeOrder(request: {
  customerId: number;
  items: PlaceOrderInput['items'];
  idempotencyKey: string;
}): Promise<PlacedOrder> {
  const { customerId, items, idempotencyKey } = request;

  const findEarlierOrder = async (): Promise<PlacedOrder | undefined> => {
    const earlierOrderId = await findOrderIdByIdempotencyKey(getPool(), customerId, idempotencyKey);
    if (!earlierOrderId) return undefined;
    return { order: (await findOrderOfCustomer(getPool(), earlierOrderId, customerId))!, wasAlreadyPlaced: true };
  };

  const earlierOrder = await findEarlierOrder();
  if (earlierOrder) return earlierOrder;

  try {
    return await withTransaction(async (transaction) => {
      const lockedProducts = await lockProductsForUpdate(
        transaction,
        items.map((item) => item.productId),
      );
      const productsById = new Map(lockedProducts.map((product) => [product.id, product]));

      // Never charge a price the customer has not seen. If any product's price moved since the cart
      // was filled, refuse the whole order and report every changed price in one go.
      const priceChanges: PriceChange[] = [];
      for (const { productId, priceVersion } of items) {
        const product = productsById.get(productId);
        if (product && priceVersion !== undefined && priceVersion !== product.priceVersion) {
          priceChanges.push({
            productId,
            productName: product.name,
            newPriceCents: product.priceCents,
            newPriceVersion: product.priceVersion,
          });
        }
      }
      if (priceChanges.length > 0) throw priceChanged(priceChanges);

      const pricedItems: { productId: number; quantity: number; unitPriceCents: number }[] = [];
      for (const { productId, quantity } of items) {
        const product = productsById.get(productId);
        if (!product) throw notFound('Product');

        // Rule 4: count what this customer bought before, across all of their orders.
        const alreadyBought = await unitsAlreadyBought(transaction, customerId, productId);
        const limitDetails = {
          productId,
          limitPerCustomer: MAX_UNITS_PER_CUSTOMER_PER_PRODUCT,
          alreadyBought,
          requested: quantity,
        };
        if (alreadyBought + quantity > MAX_UNITS_PER_CUSTOMER_PER_PRODUCT) throw purchaseLimitExceeded(limitDetails);

        if (!(await takeUnitsFromStock(transaction, productId, quantity))) {
          throw outOfStock({ productId, requested: quantity });
        }

        try {
          await addUnitsBought(transaction, customerId, productId, quantity);
        } catch (error) {
          // The database constraint is the second line of defence for rule 4.
          if (isPostgresError(error, postgresErrorCode.checkViolation, PURCHASE_LIMIT_CONSTRAINT)) {
            throw purchaseLimitExceeded(limitDetails);
          }
          throw error;
        }

        // Rule 3: the price comes from the product row locked in this transaction.
        pricedItems.push({ productId, quantity, unitPriceCents: product.priceCents });
      }

      const totalCents = pricedItems.reduce((total, item) => total + item.unitPriceCents * item.quantity, 0);
      const orderId = await insertOrder(transaction, customerId, idempotencyKey, totalCents);
      for (const item of pricedItems) {
        await insertOrderItem(transaction, orderId, item.productId, item.quantity, item.unitPriceCents);
      }

      return { order: (await findOrderOfCustomer(transaction, orderId, customerId))!, wasAlreadyPlaced: false };
    });
  } catch (error) {
    // Two requests with the same idempotency key arrived together. The unique constraint let one through
    // and rolled this one back, so answer with the order that won.
    if (isPostgresError(error, postgresErrorCode.uniqueViolation, IDEMPOTENCY_KEY_CONSTRAINT)) {
      const winningOrder = await findEarlierOrder();
      if (winningOrder) return winningOrder;
    }
    throw error;
  }
}

export function listOrderHistory(customerId: number): Promise<Order[]> {
  return listOrdersOfCustomer(getPool(), customerId);
}

/** Someone else's order looks exactly like an order that does not exist (rule 2). */
export async function getOrder(orderId: number, customerId: number): Promise<Order> {
  const order = await findOrderOfCustomer(getPool(), orderId, customerId);
  if (!order) throw notFound('Order');
  return order;
}
