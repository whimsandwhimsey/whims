import { prisma } from '@/lib/prisma';
import { toNumber, computeOutstandingBalance, computePaymentStatus, round2 } from '@/lib/calculations';
import { recalculateDepositLedger } from '@/lib/deposit';
import type { Prisma } from '@prisma/client';

type DbClient = typeof prisma | Prisma.TransactionClient;

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
 *
 * IMPORTANT: pass the `tx` from an enclosing `prisma.$transaction(...)`
 * that also creates/edits the Payment or DepositTransaction this call is
 * reacting to. Running the ledger-mutating write and this recalculation as
 * two separate top-level calls risks the first committing and the second
 * failing — leaving a customer's deposit debited with the invoice never
 * reflecting it (or vice versa). Always one atomic unit.
 */
export async function recalculateInvoiceFinancials(invoiceId: string, client: DbClient = prisma): Promise<void> {
  const invoice = await client.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return;

  const order = await client.order.findUnique({ where: { id: invoice.orderId } });
  if (!order) return;

  const invoiceAmount = toNumber(invoice.amount);

  const [payments, depositUsed] = await Promise.all([
    client.payment.findMany({ where: { invoiceId }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
    client.depositTransaction.findMany({
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
    const existingTopUp = await client.depositTransaction.findFirst({
      where: { type: 'TOP_UP', invoiceId: invoice.id, notes: { contains: marker } },
    });

    if (overpay > 0) {
      touchedDepositCustomer = true;
      if (existingTopUp) {
        if (toNumber(existingTopUp.amount) !== overpay) {
          await client.depositTransaction.update({ where: { id: existingTopUp.id }, data: { amount: overpay } });
        }
      } else {
        await client.depositTransaction.create({
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
      await client.depositTransaction.delete({ where: { id: existingTopUp.id } });
    }
  }

  runningPaid = round2(runningPaid);
  const outstandingBalance = computeOutstandingBalance(invoiceAmount, runningPaid);
  const paymentStatus = computePaymentStatus(invoiceAmount, runningPaid);

  await client.invoice.update({
    where: { id: invoiceId },
    data: {
      amountPaid: runningPaid,
      outstandingBalance,
      paymentStatus,
      paidAt: paymentStatus === 'PAID' || paymentStatus === 'OVERPAID' ? new Date() : null,
    },
  });

  await recalcOrderFromInvoices(invoice.orderId, client);

  if (touchedDepositCustomer) {
    await recalculateDepositLedger(order.customerId, client);
  }
}

/** Rolls up every invoice under an order into the order's own totals. Same
 * atomicity note as recalculateInvoiceFinancials applies — pass `tx` when
 * this follows a write in the same operation. */
export async function recalcOrderFromInvoices(orderId: string, client: DbClient = prisma): Promise<void> {
  const order = await client.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  const invoices = await client.invoice.findMany({ where: { orderId } });
  const amountPaid = round2(invoices.reduce((sum, inv) => sum + toNumber(inv.amountPaid), 0));
  const totalAmount = toNumber(order.totalAmount);

  await client.order.update({
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
