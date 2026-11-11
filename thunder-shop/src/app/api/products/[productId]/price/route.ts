import { apiRoute, jsonResponse, parseOrReject, readJsonBody } from '@/server/http/apiRoute';
import { requireRole } from '@/server/http/session';
import { recordIdFromUrl } from '@/server/schemas/common';
import { changePriceInput, productOutput } from '@/server/schemas/product';
import { changeProductPrice } from '@/server/services/productService';

export const PATCH = apiRoute<{ productId: string }>(async (request, { params, requestId }) => {
  const admin = await requireRole(request, 'admin');
  const productId = parseOrReject(recordIdFromUrl, params.productId, 'productId');
  const { priceCents } = await readJsonBody(request, changePriceInput);
  const product = await changeProductPrice(productId, priceCents, { admin, requestId });
  return jsonResponse({ product: productOutput.parse(product) });
});
