import { getPool } from '../db/connection';
import { listRecentAuditEntries } from '../repositories/auditLogRepository';
import type { AuditEntry } from '../schemas/product';

export function listAuditLog(): Promise<AuditEntry[]> {
  return listRecentAuditEntries(getPool(), 200);
}
