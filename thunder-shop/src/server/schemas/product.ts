import { z } from 'zod';
import { MAX_PRICE_CENTS, MAX_STOCK, wholeNumber } from './common';

const priceCents = wholeNumber(0, MAX_PRICE_CENTS);
const stock = wholeNumber(0, MAX_STOCK);

export const createProductInput = z.object({
  name: z.string().trim().min(1).max(120),
  priceCents,
  stock,
});
export type CreateProductInput = z.infer<typeof createProductInput>;

export const changePriceInput = z.object({ priceCents });
export const changeStockInput = z.object({ stock });

export const productOutput = z.object({
  id: z.number(),
  name: z.string(),
  priceCents: z.number(),
  priceVersion: z.number(),
  stock: z.number(),
  updatedAt: z.string(),
});
export type Product = z.infer<typeof productOutput>;

export const auditEntryOutput = z.object({
  id: z.number(),
  happenedAt: z.string(),
  actorUserId: z.number(),
  actorEmail: z.string(),
  action: z.string(),
  productId: z.number(),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  requestId: z.string(),
});
export type AuditEntry = z.infer<typeof auditEntryOutput>;
