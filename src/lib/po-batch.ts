import type { Prisma } from '@prisma/client';

export type BatchKey = {
  orderType: string;
  poMonth: string | null;
  etaMonth: string | null;
  supplierId: string | null;
};

/**
 * Finds the PurchaseBatch matching this order type + PO month + supplier
 * (etaMonth isn't part of the match key — it can be refined later without
 * splitting into a new batch), creating one automatically if this is the
 * first order for that combination. `newBatchName`, if given, is used for
 * a freshly-created batch; otherwise a sensible default name is generated.
 *
 * Only called for PO_REGULAR / PO_REMAINDER orders — ready stock and jastip
 * orders never have a batch (see isMergeableOrderType in order-merge.ts).
 */
export async function findOrCreatePurchaseBatch(
  tx: Prisma.TransactionClient,
  key: BatchKey,
  newBatchName?: string
): Promise<string | null> {
  if (!key.poMonth) return null;

  const existing = await tx.purchaseBatch.findFirst({
    where: {
      type: key.orderType as any,
      poMonth: key.poMonth,
      supplierId: key.supplierId,
    },
  });
  if (existing) {
    // Keep etaMonth fresh if it was left unset or has since been refined.
    if (key.etaMonth && key.etaMonth !== existing.etaMonth) {
      await tx.purchaseBatch.update({ where: { id: existing.id }, data: { etaMonth: key.etaMonth } });
    }
    return existing.id;
  }

  const supplier = key.supplierId ? await tx.supplier.findUnique({ where: { id: key.supplierId } }) : null;
  const fallbackName = [supplier?.name, key.poMonth].filter(Boolean).join(' — ') || `PO ${key.poMonth}`;

  const created = await tx.purchaseBatch.create({
    data: {
      name: newBatchName?.trim() || fallbackName,
      type: key.orderType as any,
      poMonth: key.poMonth,
      etaMonth: key.etaMonth,
      supplierId: key.supplierId,
    },
  });
  return created.id;
}
