/** An error the API is happy to show to the caller. Anything else becomes a plain 500. */
export class AppError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const validationFailed = (details: unknown, message = 'Some of the input is not valid.') =>
  new AppError(400, 'VALIDATION_FAILED', message, details);

export const notLoggedIn = () => new AppError(401, 'NOT_LOGGED_IN', 'Please log in first.');

export const notAllowed = (message = 'Your account is not allowed to do this.') =>
  new AppError(403, 'NOT_ALLOWED', message);

export const notFound = (thing: string) => new AppError(404, 'NOT_FOUND', `${thing} was not found.`);

export const purchaseLimitExceeded = (details: {
  productId: number;
  limitPerCustomer: number;
  alreadyBought: number;
  requested: number;
}) =>
  new AppError(
    409,
    'PURCHASE_LIMIT_EXCEEDED',
    `You can buy at most ${details.limitPerCustomer} units of this product in total. ` +
      `You already have ${details.alreadyBought}.`,
    details,
  );

export const outOfStock = (details: { productId: number; requested: number }) =>
  new AppError(409, 'OUT_OF_STOCK', 'There is not enough stock left for this order.', details);

export type PriceChange = { productId: number; productName: string; newPriceCents: number; newPriceVersion: number };

export const priceChanged = (changes: PriceChange[]) =>
  new AppError(409, 'PRICE_CHANGED', 'A price changed while you were shopping. Nothing was bought. Check the new price and try again.', {
    changes,
  });

export const crossSiteRequest = () =>
  new AppError(403, 'CROSS_SITE_REQUEST', 'This request came from another website and was refused.');

export const tooManyLoginAttempts = () =>
  new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many failed logins. Please wait a few minutes and try again.');
