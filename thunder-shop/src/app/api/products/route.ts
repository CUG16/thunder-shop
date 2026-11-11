import { apiRoute, jsonResponse, readJsonBody } from '@/server/http/apiRoute';
import { requireLoggedInUser, requireRole } from '@/server/http/session';
import { createProductInput, productOutput } from '@/server/schemas/product';
import { createProduct, listProductsVisibleTo } from '@/server/services/productService';

export const GET = apiRoute(async (request) => {
  const user = await requireLoggedInUser(request);
  const products = await listProductsVisibleTo(user);
  return jsonResponse({ products: productOutput.array().parse(products) });
});

export const POST = apiRoute(async (request, { requestId }) => {
  const admin = await requireRole(request, 'admin');
  const newProduct = await readJsonBody(request, createProductInput);
  const product = await createProduct(newProduct, { admin, requestId });
  return jsonResponse({ product: productOutput.parse(product) }, 201);
});
