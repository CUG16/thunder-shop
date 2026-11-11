import { apiRoute, jsonResponse } from '@/server/http/apiRoute';
import { requireRole } from '@/server/http/session';
import { auditEntryOutput } from '@/server/schemas/product';
import { listAuditLog } from '@/server/services/productService';

export const GET = apiRoute(async (request) => {
  await requireRole(request, 'admin');
  return jsonResponse({ entries: auditEntryOutput.array().parse(await listAuditLog()) });
});
