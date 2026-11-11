import { apiRoute, jsonResponse, parseOrReject, readJsonBody } from '@/server/http/apiRoute';
import { requireRole } from '@/server/http/session';
import { recordIdFromUrl } from '@/server/schemas/common';
import { changeStockInput, productOutput } from '@/server/schemas/product';
import { changeProductStock } from '@/server/services/productService';

export const PATCH = apiRoute<{ productId: string }>(async (request, { params, requestId }) => {
  const admin = await requireRole(request, 'admin');
  const productId = parseOrReject(recordIdFromUrl, params.productId, 'productId');
  const { stock } = await readJsonBody(request, changeStockInput);
  const product = await changeProductStock(productId, stock, { admin, requestId });
  return jsonResponse({ product: productOutput.parse(product) });
});
