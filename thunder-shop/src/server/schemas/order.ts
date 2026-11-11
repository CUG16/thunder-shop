import { z } from 'zod';
import { recordId } from './common';

const quantityProblem = 'Quantity must be a whole number of 1 or more.';

const orderItemInput = z.object({
  productId: recordId,
  // Rule 6: a whole number, 1 or more. "2" (text), 1.5, 0 and -1 are all rejected.
  quantity: z
    .number(quantityProblem)
    .int(quantityProblem)
    .min(1, quantityProblem),
  // Optional: the price version the customer was looking at. This is not a price and is never used to
  // work out the charge. It only lets the server refuse the order if the price changed in the meantime.
  priceVersion: recordId.optional(),
});

// Unknown keys are dropped, not trusted. If the browser sends "price" or "total", it never reaches the service (rule 3).
export const placeOrderInput = z.object({
  items: z
    .array(orderItemInput)
    .min(1)
    .max(20)
    .refine((items) => new Set(items.map((item) => item.productId)).size === items.length, {
      message: 'Each product can appear only once in an order.',
    }),
});
export type PlaceOrderInput = z.infer<typeof placeOrderInput>;

export const idempotencyKeyHeader = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,100}$/, 'Idempotency-Key must be 8 to 100 letters, digits, dashes or underscores.');

export const orderOutput = z.object({
  id: z.number(),
  createdAt: z.string(),
  totalCents: z.number(),
  items: z.array(
    z.object({
      productId: z.number(),
      productName: z.string(),
      quantity: z.number(),
      unitPriceCents: z.number(),
    }),
  ),
});
export type Order = z.infer<typeof orderOutput>;
