import type { Prisma } from '@prisma/client';

/**
 * Order statuses that are still "open" for merging more items in. Once an
 * order has shipped or is cancelled, a new submission with the same
 * customer/PO month/order type/supplier starts a fresh order instead of
 * reopening a closed one.
 */
const MERGEABLE_STATUSES = ['WAITING', 'ARRIVED', 'READY_TO_SHIP'] as const;

export type MergeKey = {
  customerId: string;
  orderType: string;
  poMonth: string | null;
  supplierId: string | null;
};

/**
 * Ready stock and jastip orders are always immediate, one-off transactions
 * — they never auto-merge, even if the same customer buys twice in one day.
 * Only PO reguler / PO remainder orders (which have a poMonth) look for an
 * existing open order to fold new items into.
 */
export function isMergeableOrderType(orderType: string): boolean {
  return orderType === 'PO_REGULAR' || orderType === 'PO_REMAINDER';
}

/**
 * Finds an existing open order matching the merge key (same customer,
 * order type, PO month, and supplier). Returns null if none found, or if
 * the order type isn't mergeable in the first place.
 */
export async function findMergeableOrder(tx: Prisma.TransactionClient, key: MergeKey) {
  if (!isMergeableOrderType(key.orderType)) return null;
  if (!key.poMonth) return null;

  return tx.order.findFirst({
    where: {
      customerId: key.customerId,
      orderType: key.orderType as any,
      poMonth: key.poMonth,
      supplierId: key.supplierId,
      status: { in: MERGEABLE_STATUSES as unknown any[] },
    },
    orderBy: { createdAt: 'desc' },
  });
}
