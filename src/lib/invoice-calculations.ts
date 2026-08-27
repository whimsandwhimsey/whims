import { prisma } from '@/lib/prisma';
import { toNumber, computeOutstandingBalance, computePaymentStatus, round2 } from '@/lib/calculations';
import { recalculateDepositLedger } from '@/lib/deposit';

/**
 * Recomputes ONE invoice's amountPaid / outstandingBalance / paymentStatus
 * by replaying its Payments (chronological) and deposit-USED transactions
 * against it from scratch — the same "replay history, don't patch
 * incrementally" pattern the deposit ledger already uses. Any payment that
 * overflows past what this invoice still owes automatically becomes (or
 * updates) a customer deposit TOP_UP, exactly like the old order-level
 * logic did — just scoped to the invoice instead of the whole order.
 *
 * Call this after creating, editing, or deleting any Payment tied to an
 * invoice, or after applying/removing deposit against an invoice. It also
 * calls recalcOrderFromInvoices internally, so the order-level rollup
 * always stays in sync — invoices are the source of truth, order totals
 * are just a sum of them.
 */
export async function recalculateInvoiceFinancials(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return;

  const order = await prisma.order.findUnique({ where: { id: invoice.orderId } });
  if (!order) return;

  const invoiceAmount = toNumber(invoice.amount);

  const [payments, depositUsed] = await Promise.all([
    prisma.payment.findMany({ where: { invoiceId }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
    prisma.depositTransaction.findMany({
      where: { invoiceId, type: 'USED' },
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
    const outstandingBefore = Math.max(0, invoiceAmount - runningPaid);

    if (event.kind === 'depositUsed') {
      // Already capped/valid at creation time — just apply it.
      runningPaid += event.amount;
      continue;
    }

    // Payment event: figure out how much applies to this invoice vs. overflows to deposit.
    const appliedToInvoice = Math.min(event.amount, outstandingBefore);
    const overpay = round2(event.amount - appliedToInvoice);
    runningPaid += appliedToInvoice;

    // Each payment gets at most one linked overpay TOP_UP transaction,
    // identified by a marker in its notes (there's no dedicated FK for
    // "which payment generated this top-up" since a top-up can also come
    // from a standalone deposit payment with no invoice at all).
    const marker = `payment:${event.paymentId}`;
    const existingTopUp = await prisma.depositTransaction.findFirst({
      where: { type: 'TOP_UP', invoiceId: invoice.id, notes: { contains: marker } },
    });

    if (overpay > 0) {
      touchedDepositCustomer = true;
      if (existingTopUp) {
        if (toNumber(existingTopUp.amount) !== overpay) {
          await prisma.depositTransaction.update({ where: { id: existingTopUp.id }, data: { amount: overpay } });
        }
      } else {
        await prisma.depositTransaction.create({
          data: {
            customerId: order.customerId,
            type: 'TOP_UP',
            amount: overpay,
            balanceAfter: 0, // fixed up by recalculateDepositLedger below
            orderId: invoice.orderId,
            invoiceId: invoice.id,
            notes: `Overpayment on invoice ${invoice.invoiceNumber} (${marker})`,
          },
        });
      }
    } else if (existingTopUp) {
      touchedDepositCustomer = true;
      await prisma.depositTransaction.delete({ where: { id: existingTopUp.id } });
    }
  }

  runningPaid = round2(runningPaid);
  const outstandingBalance = computeOutstandingBalance(invoiceAmount, runningPaid);
  const paymentStatus = computePaymentStatus(invoiceAmount, runningPaid);

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      amountPaid: runningPaid,
      outstandingBalance,
      paymentStatus,
      paidAt: paymentStatus === 'PAID' || paymentStatus === 'OVERPAID' ? new Date() : null,
    },
  });

  await recalcOrderFromInvoices(invoice.orderId);

  if (touchedDepositCustomer) {
    await recalculateDepositLedger(order.customerId);
  }
}

/** Rolls up every invoice under an order into the order's own totals. */
export async function recalcOrderFromInvoices(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  const invoices = await prisma.invoice.findMany({ where: { orderId } });
  const amountPaid = round2(invoices.reduce((sum, inv) => sum + toNumber(inv.amountPaid), 0));
  const totalAmount = toNumber(order.totalAmount);

  await prisma.order.update({
    where: { id: orderId },
    data: {
      amountPaid,
      outstandingBalance: computeOutstandingBalance(totalAmount, amountPaid),
      paymentStatus: computePaymentStatus(totalAmount, amountPaid),
    },
  });
}

export type DpRule = { dpType: 'PERCENTAGE' | 'FIXED_PER_BOOK' | 'FIXED_TOTAL' | null; dpValue: number | null };

/**
 * Computes the DP (deposit) amount for a PO_REGULAR / PO_REMAINDER order
 * from its dpType/dpValue rule. Ready stock and jastip orders are always
 * invoiced in full instead — they never call this.
 */
export function computeDpAmount(rule: DpRule, totalAmount: number, totalQuantity: number): number {
  if (!rule.dpType || rule.dpValue === null || rule.dpValue === undefined) {
    return round2(totalAmount * 0.25); // sensible fallback if no rule was set
  }
  switch (rule.dpType) {
    case 'PERCENTAGE':
      return round2(totalAmount * (rule.dpValue / 100));
    case 'FIXED_PER_BOOK':
      return round2(rule.dpValue * totalQuantity);
    case 'FIXED_TOTAL':
      return round2(Math.min(rule.dpValue, totalAmount));
    default:
      return round2(totalAmount * 0.25);
  }
}
