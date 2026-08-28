'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';
import { computeOrderTotals, computePaymentStatus, computeOutstandingBalance, toNumber } from '@/lib/calculations';
import { getCustomerDepositBalance, recalculateDepositLedger } from '@/lib/deposit';

export type ActionResult = { success: true } | { success: false; error: string };

/** Flags an item as out-of-stock — doesn't touch money yet, just marks it
 * pending resolution so it shows up clearly on the order and in the bulk
 * OOS list. */
export async function markItemOos(orderItemId: string): Promise<ActionResult> {
  const session = await requireStaffSession();
  try {
    const item = await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { isOos: true, oosMarkedAt: new Date() },
      include: { order: true },
    });

    await writeAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'OrderItem',
      entityId: orderItemId,
      summary: `Marked "${item.bookTitle}" OOS on order ${item.order.orderNumber}`,
    });

    revalidatePath(`/admin/orders/${item.orderId}`);
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to mark item as OOS.' };
  }
}

export async function unmarkItemOos(orderItemId: string): Promise<ActionResult> {
  const session = await requireStaffSession();
  try {
    const item = await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { isOos: false, oosMarkedAt: null, oosResolution: null, oosResolvedAt: null, oosNotes: null },
      include: { order: true },
    });

    await writeAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'OrderItem',
      entityId: orderItemId,
      summary: `Un-marked OOS on "${item.bookTitle}" (order ${item.order.orderNumber})`,
    });

    await recalcOrderExcludingOos(item.orderId);
    revalidatePath(`/admin/orders/${item.orderId}`);
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to undo OOS mark.' };
  }
}

/**
 * Resolves an OOS item: REFUND just logs that money was physically handed
 * back (never touches the deposit ledger); DEPOSIT adds the item's amount
 * to the customer's deposit balance. Either way, the order's totals are
 * recalculated to exclude this item going forward — but no already-issued
 * invoice's face amount is ever edited, since those are historical bills.
 */
export async function resolveItemOos(
  orderItemId: string,
  resolution: 'REFUND' | 'DEPOSIT',
  notes?: string
): Promise<ActionResult> {
  const session = await requireStaffSession();
  try {
    const item = await prisma.orderItem.findUnique({ where: { id: orderItemId }, include: { order: true } });
    if (!item) return { success: false, error: 'Item not found.' };
    if (!item.isOos) return { success: false, error: 'Item is not marked OOS.' };

    await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { oosResolution: resolution, oosResolvedAt: new Date(), oosNotes: notes || null },
    });

    if (resolution === 'DEPOSIT') {
      const balance = await getCustomerDepositBalance(item.order.customerId);
      const amount = toNumber(item.subtotal);
      await prisma.depositTransaction.create({
        data: {
          customerId: item.order.customerId,
          type: 'TOP_UP',
          amount,
          balanceAfter: balance + amount,
          orderId: item.orderId,
          notes: `OOS "${item.bookTitle}" on order ${item.order.orderNumber} — converted to deposit`,
          createdById: session.user.id,
        },
      });
      await recalculateDepositLedger(item.order.customerId);
    }

    await writeAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'OrderItem',
      entityId: orderItemId,
      summary: `Resolved OOS "${item.bookTitle}" (order ${item.order.orderNumber}) as ${resolution}${notes ? ` — ${notes}` : ''}`,
    });

    await recalcOrderExcludingOos(item.orderId);

    revalidatePath(`/admin/orders/${item.orderId}`);
    revalidatePath(`/admin/customers/${item.order.customerId}`);
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to resolve OOS item.' };
  }
}

/** Recomputes an order's subtotal/total/etc from only its non-resolved-OOS
 * items — a resolved OOS item no longer counts toward what's owed. */
async function recalcOrderExcludingOos(orderId: string) {
  const [order, items] = await Promise.all([
    prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
    prisma.orderItem.findMany({ where: { orderId } }),
  ]);

  const countedItems = items.filter((it) => !(it.isOos && it.oosResolution));
  const totals = computeOrderTotals(
    countedItems.map((it) => ({
      sellingPrice: toNumber(it.sellingPrice),
      quantity: it.quantity,
      discount: toNumber(it.discount),
      cogs: toNumber(it.cogs),
    }))
  );

  const amountPaid = toNumber(order.amountPaid);

  await prisma.order.update({
    where: { id: orderId },
    data: {
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      totalAmount: totals.totalAmount,
      totalCogs: totals.totalCogs,
      profit: totals.profit,
      outstandingBalance: computeOutstandingBalance(totals.totalAmount, amountPaid),
      paymentStatus: computePaymentStatus(totals.totalAmount, amountPaid),
    },
  });
}
