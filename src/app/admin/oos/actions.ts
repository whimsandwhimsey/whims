'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';

const OPEN_STATUSES = ['WAITING', 'IN_TRANSIT', 'ARRIVED_COUNTRY', 'ARRIVED'];

/** Finds every not-yet-fulfilled, not-yet-OOS order item for a book. */
export async function findOosCandidates(bookId: string) {
  const items = await prisma.orderItem.findMany({
    where: {
      bookId,
      isOos: false,
      order: { status: { in: OPEN_STATUSES } },
    },
    include: {
      order: { include: { customer: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return items;
}

/** Marks every given order item OOS in one pass — resolution still happens
 * per-customer afterwards, since refund vs. deposit is a per-person choice. */
export async function bulkMarkOos(orderItemIds: string[], bookTitle: string): Promise<{ marked: number }> {
  const session = await requireStaffSession();

  await prisma.orderItem.updateMany({
    where: { id: { in: orderItemIds } },
    data: { isOos: true, oosMarkedAt: new Date() },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'OrderItem',
    entityId: orderItemIds.join(','),
    summary: `Bulk-marked "${bookTitle}" OOS across ${orderItemIds.length} order(s)`,
  });

  revalidatePath('/admin/oos');
  return { marked: orderItemIds.length };
}
