import { randomUUID } from 'node:crypto';
import { apiRoute, jsonResponse, parseOrReject, readJsonBody } from '@/server/http/apiRoute';
import { requireRole } from '@/server/http/session';
import { idempotencyKeyHeader, orderOutput, placeOrderInput } from '@/server/schemas/order';
import { listOrderHistory, placeOrder } from '@/server/services/orderService';

export const GET = apiRoute(async (request) => {
  const customer = await requireRole(request, 'customer');
  const orders = await listOrderHistory(customer.id);
  return jsonResponse({ orders: orderOutput.array().parse(orders) });
});

export const POST = apiRoute(async (request) => {
  // The customer is whoever the session says. A user id in the body would be ignored.
  const customer = await requireRole(request, 'customer');
  const { items } = await readJsonBody(request, placeOrderInput);

  // Clients that might retry (double click, flaky network) send an Idempotency-Key so the retry is not a second order.
  const sentKey = request.headers.get('idempotency-key');
  const idempotencyKey = sentKey ? parseOrReject(idempotencyKeyHeader, sentKey, 'Idempotency-Key') : randomUUID();

  const { order, wasAlreadyPlaced } = await placeOrder({ customerId: customer.id, items, idempotencyKey });
  return jsonResponse({ order: orderOutput.parse(order) }, wasAlreadyPlaced ? 200 : 201);
});
