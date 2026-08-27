import { prisma } from '@/lib/prisma';
import { toNumber, computeOutstandingBalance, computePaymentStatus } from '@/lib/calculations';
import { recalculateDepositLedger } from '@/lib/deposit';

/**
 * Recomputes an order's amountPaid / outstandingBalance / paymentStatus, and
 * fixes up any deposit TOP_UP transactions that individual payments on this
 * order generated — by replaying every payment (and every deposit-USED
 * transaction) against the order in chronological order.
 *
 * This is what lets payments be edited or deleted after the fact: rather
 * than trying to patch running totals incrementally (fragile once a payment
 * in the middle of the history changes), we just replay history from
 * scratch and let this function be the single source of truth. Call it
 * after creating, editing, or deleting any Payment tied to an order.
 */
export async function recalculateOrderFinancials(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  const totalAmount = toNumber(order.totalAmount);

  const [payments, depositUsed] = await Promise.all([
    prisma.payment.findMany({ where: { orderId }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
    prisma.depositTransaction.findMany({
      where: { orderId, type: 'USED' },
      orderBy: [{ createdAt: 'asc' }],
    }),
  ]);

  type Event = { at: number; kind: 'payment' | 'depositUsed'; paymentId?: string; amount: number };
  const events: Event[] = [
    ...payments.map((p) => ({
      at: p.date.getTime(),
      kind: 'payment' as const,
      paymentId: p.id,
      amount: toNumber(p.amount),
    })),
    ...depositUsed.map((d) => ({
      at: d.createdAt.getTime(),
      kind: 'depositUsed' as const,
      amount: toNumber(d.amount),
    })),
  ].sort((a, b) => a.at - b.at);

  let runningPaid = 0;
  let touchedDepositCustomer = false;

  for (const event of events) {
    const outstandingBefore = Math.max(0, totalAmount - runningPaid);

    if (event.kind === 'depositUsed') {
      // Already capped/valid at creation time — just apply it.
      runningPaid += event.amount;
      continue;
    }

    // Payment event: figure out how much applies to the order vs. overflows to deposit.
    const appliedToOrder = Math.min(event.amount, outstandingBefore);
    const overpay = Math.round((event.amount - appliedToOrder) * 100) / 100;
    runningPaid += appliedToOrder;

    const existingTopUp = await prisma.depositTransaction.findFirst({
      where: { paymentId: event.paymentId, type: 'TOP_UP' },
    });

    if (overpay > 0) {
      touchedDepositCustomer = true;
      if (existingTopUp) {
        if (toNumber(existingTopUp.amount) !== overpay) {
          await prisma.depositTransaction.update({
            where: { id: existingTopUp.id },
            data: { amount: overpay },
          });
        }
      } else {
        await prisma.depositTransaction.create({
          data: {
            customerId: order.customerId,
            type: 'TOP_UP',
            amount: overpay,
            balanceAfter: 0, // fixed up by recalculateDepositLedger below
            orderId,
            paymentId: event.paymentId,
            notes: `Overpayment on order ${order.orderNumber}`,
          },
        });
      }
    } else if (existingTopUp) {
      // No longer an overpay (e.g. amount was edited down) — remove the stale credit.
      touchedDepositCustomer = true;
      await prisma.depositTransaction.delete({ where: { id: existingTopUp.id } });
    }
  }

  runningPaid = Math.round(runningPaid * 100) / 100;
  const outstandingBalance = computeOutstandingBalance(totalAmount, runningPaid);
  const paymentStatus = computePaymentStatus(totalAmount, runningPaid);

  await prisma.order.update({
    where: { id: orderId },
    data: { amountPaid: runningPaid, outstandingBalance, paymentStatus },
  });

  if (touchedDepositCustomer) {
    await recalculateDepositLedger(order.customerId);
  }
}
