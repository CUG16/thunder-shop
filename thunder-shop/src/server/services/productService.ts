import { getPool, withTransaction } from '../db/connection';
import { notFound } from '../errors';
import { insertAuditEntry, listRecentAuditEntries } from '../repositories/auditLogRepository';
import {
  findProductById,
  insertProduct,
  listAllProducts,
  listProductsInStock,
  lockProductsForUpdate,
  updateProductPrice,
  updateProductStock,
} from '../repositories/productRepository';
import type { PublicUser } from '../schemas/auth';
import type { AuditEntry, CreateProductInput, Product } from '../schemas/product';

/** Who made the change and which request it came in on. Always taken from the session, never from the request body. */
export type AdminAction = { admin: PublicUser; requestId: string };

/** Customers see what they can buy right now. Admins see everything, including sold-out products. */
export function listProductsVisibleTo(user: PublicUser): Promise<Product[]> {
  return user.role === 'admin' ? listAllProducts(getPool()) : listProductsInStock(getPool());
}

// Each change and its audit entry are saved in one transaction: either both exist or neither does.

export function createProduct(newProduct: CreateProductInput, { admin, requestId }: AdminAction): Promise<Product> {
  return withTransaction(async (transaction) => {
    const product = await insertProduct(transaction, newProduct);
    await insertAuditEntry(transaction, {
      actorUserId: admin.id,
      actorEmail: admin.email,
      action: 'product.created',
      productId: product.id,
      oldValue: null,
      newValue: newProduct,
      requestId,
    });
    return product;
  });
}

export function changeProductPrice(productId: number, newPriceCents: number, { admin, requestId }: AdminAction): Promise<Product> {
  return withTransaction(async (transaction) => {
    // Lock the product so an order in progress finishes at the old price before the new one applies.
    const [product] = await lockProductsForUpdate(transaction, [productId]);
    if (!product) throw notFound('Product');

    await updateProductPrice(transaction, productId, newPriceCents);
    await insertAuditEntry(transaction, {
      actorUserId: admin.id,
      actorEmail: admin.email,
      action: 'product.price_changed',
      productId,
      oldValue: { priceCents: product.priceCents },
      newValue: { priceCents: newPriceCents },
      requestId,
    });
    return (await findProductById(transaction, productId))!;
  });
}

export function changeProductStock(productId: number, newStock: number, { admin, requestId }: AdminAction): Promise<Product> {
  return withTransaction(async (transaction) => {
    const [product] = await lockProductsForUpdate(transaction, [productId]);
    if (!product) throw notFound('Product');

    await updateProductStock(transaction, productId, newStock);
    await insertAuditEntry(transaction, {
      actorUserId: admin.id,
      actorEmail: admin.email,
      action: 'product.stock_changed',
      productId,
      oldValue: { stock: product.stock },
      newValue: { stock: newStock },
      requestId,
    });
    return (await findProductById(transaction, productId))!;
  });
}

export function listAuditLog(): Promise<AuditEntry[]> {
  return listRecentAuditEntries(getPool(), 200);
}
