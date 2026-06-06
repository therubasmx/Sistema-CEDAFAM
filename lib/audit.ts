import { type Prisma, AuditAction } from "@prisma/client";
import { db } from "@/lib/db";

interface AuditInput {
  userId: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  changedFields?: Prisma.InputJsonValue;
}

/**
 * Writes an audit entry. Accepts an optional transaction client so it can run
 * inside the same transaction as the change it records.
 */
export async function recordAudit(
  input: AuditInput,
  client: Prisma.TransactionClient | typeof db = db,
) {
  await client.auditLog.create({
    data: {
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      changedFields: input.changedFields,
    },
  });
}

export { AuditAction };
