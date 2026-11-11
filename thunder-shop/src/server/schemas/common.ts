import { z } from 'zod';

/** A whole number within a range. Rejects decimals, strings and anything too large to be exact. */
export const wholeNumber = (minimum: number, maximum: number) => z.number().int().min(minimum).max(maximum);

export const recordId = wholeNumber(1, Number.MAX_SAFE_INTEGER);

/** Ids arrive in the URL as text, so only plain digits are accepted before converting. */
export const recordIdFromUrl = z
  .string()
  .regex(/^[1-9]\d{0,14}$/, 'Must be a positive whole number.')
  .transform(Number);

export const MAX_PRICE_CENTS = 10_000_000; // $100,000.00. Keeps any order total well inside a 32-bit integer column.
export const MAX_STOCK = 1_000_000;
