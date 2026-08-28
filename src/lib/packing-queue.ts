import { prisma } from '@/lib/prisma';

/**
 * Statuses that count as "arrived at our warehouse or further along" —
 * the minimum shipping stage for an order to be pack-able at all.
 */
const ARRIVED_OR_LATER = ['ARRIVED'] as const;

/**
 * The packing queue: every order that's fully paid (all its invoices
 * settled) AND has arrived at the warehouse, not yet shipped/cancelled —
 * ordered by whichever order got fully paid first (using its most recent
 * payment date as a proxy for "when it tipped over to fully paid").
 * Used by both /admin/packing (the full list) and the customer portal
 * (to show "you're #X of Y").
 */
export async function getPackingQueue(): Promise<{ orderId: string; paidDate: Date }[]> {
  const orders = await prisma.order.findMany({
    where: {
      status: { in: [...ARRIVED_OR_LATER] },
      paymentStatus: { in: ['PAID', 'OVERPAID'] },
    },
    select: {
      id: true,
      orderDate: true,
      payments: { orderBy: { date: 'desc' }, take: 1, select: { date: true } },
    },
  });

  return orders
    .map((o) => ({ orderId: o.id, paidDate: o.payments[0]?.date ?? o.orderDate }))
    .sort((a, b) => a.paidDate.getTime() - b.paidDate.getTime());
}

export async function getPackingQueuePosition(
  orderId: string
): Promise<{ position: number; total: number } | null> {
  const queue = await getPackingQueue();
  const index = queue.findIndex((q) => q.orderId === orderId);
  if (index === -1) return null;
  return { position: index + 1, total: queue.length };
}
