import { prisma } from '@/lib/prisma';

/**
 * The packing queue: every order with at least one payment recorded, not
 * yet Completed/Cancelled, ordered by the date its first payment came in
 * (first paid, first packed). Used by both /admin/packing (the full list)
 * and the customer portal (to show "you're #X of Y").
 */
export async function getPackingQueue(): Promise<{ orderId: string; firstPaymentDate: Date }[]> {
  const orders = await prisma.order.findMany({
    where: {
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
      payments: { some: {} },
    },
    select: {
      id: true,
      orderDate: true,
      payments: { orderBy: { date: 'asc' }, take: 1, select: { date: true } },
    },
  });

  return orders
    .map((o) => ({ orderId: o.id, firstPaymentDate: o.payments[0]?.date ?? o.orderDate }))
    .sort((a, b) => a.firstPaymentDate.getTime() - b.firstPaymentDate.getTime());
}

export async function getPackingQueuePosition(
  orderId: string
): Promise<{ position: number; total: number } | null> {
  const queue = await getPackingQueue();
  const index = queue.findIndex((q) => q.orderId === orderId);
  if (index === -1) return null;
  return { position: index + 1, total: queue.length };
}
