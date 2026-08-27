import { prisma } from '@/lib/prisma';
import type { AuditAction } from '@prisma/client';

type WriteAuditLogInput = {
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  changes?: { before?: unknown; after?: unknown };
};

/** Fire-and-forget audit trail write. Never throws — a failed audit write
 * should never block the actual mutation it's describing. */
export async function writeAuditLog(input: WriteAuditLogInput) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary,
        changes: input.changes ? JSON.parse(JSON.stringify(input.changes)) : undefined,
      },
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
