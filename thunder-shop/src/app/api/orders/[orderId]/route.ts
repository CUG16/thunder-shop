import { apiRoute, jsonResponse, parseOrReject } from '@/server/http/apiRoute';
import { requireRole } from '@/server/http/session';
import { recordIdFromUrl } from '@/server/schemas/common';
import { orderOutput } from '@/server/schemas/order';
import { getOrder } from '@/server/services/orderService';

export const GET = apiRoute<{ orderId: string }>(async (request, { params }) => {
  const customer = await requireRole(request, 'customer');
  const orderId = parseOrReject(recordIdFromUrl, params.orderId, 'orderId');
  const order = await getOrder(orderId, customer.id);
  return jsonResponse({ order: orderOutput.parse(order) });
});
