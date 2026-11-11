import type { Queryable } from '../db/connection';
import type { AuditEntry } from '../schemas/product';

export type AuditAction = 'product.created' | 'product.price_changed' | 'product.stock_changed';

export async function insertAuditEntry(
  db: Queryable,
  entry: {
    actorUserId: number;
    actorEmail: string;
    action: AuditAction;
    productId: number;
    oldValue: unknown;
    newValue: unknown;
    requestId: string;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (actor_user_id, actor_email, action, product_id, old_value, new_value, request_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
    [
      entry.actorUserId,
      entry.actorEmail,
      entry.action,
      entry.productId,
      entry.oldValue === null ? null : JSON.stringify(entry.oldValue),
      JSON.stringify(entry.newValue),
      entry.requestId,
    ],
  );
}

export async function listRecentAuditEntries(db: Queryable, maximumEntries: number): Promise<AuditEntry[]> {
  const { rows } = await db.query<AuditEntry>(
    `SELECT id, happened_at AS "happenedAt", actor_user_id AS "actorUserId", actor_email AS "actorEmail",
            action, product_id AS "productId", old_value AS "oldValue", new_value AS "newValue",
            request_id AS "requestId"
       FROM audit_log ORDER BY id DESC LIMIT $1`,
    [maximumEntries],
  );
  return rows;
}
