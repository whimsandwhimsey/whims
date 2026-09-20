import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/calculations';
import type { Prisma } from '@prisma/client';

type DbClient = typeof prisma | Prisma.TransactionClient;

/**
 * A customer's current deposit balance is always the `balanceAfter` of their
 * most recent DepositTransaction — never a separately-maintained field. This
 * keeps the ledger (not a cached number) as the single source of truth,
 * which is what makes the full history in the customer portal trustworthy.
 */
export async function getCustomerDepositBalance(customerId: string): Promise<number> {
  const latest = await prisma.depositTransaction.findFirst({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
  });
  return latest ? toNumber(latest.balanceAfter) : 0;
}

/**
 * Recomputes `balanceAfter` for every deposit transaction of a customer, in
 * chronological order. Call this any time a transaction in the middle of
 * the history is edited, added, or removed (e.g. after editing a payment
 * that had generated a TOP_UP) — simplest way to guarantee the whole
 * ledger stays internally consistent rather than patching balances
 * incrementally.
 *
 * Pass the `tx` from an enclosing `prisma.$transaction(...)` when this is
 * part of a larger atomic operation (e.g. applying deposit to an invoice) —
 * otherwise the ledger update and the invoice/payment update it belongs
 * with could commit separately, leaving one applied and the other not if
 * something fails in between.
 */
export async function recalculateDepositLedger(customerId: string, client: DbClient = prisma): Promise<void> {
  const transactions = await client.depositTransaction.findMany({
    where: { customerId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  let running = 0;
  for (const txn of transactions) {
    const amount = toNumber(txn.amount);
    running += txn.type === 'USED' || txn.type === 'REFUND' ? -amount : amount;
    running = Math.round(running * 100) / 100;
    if (toNumber(txn.balanceAfter) !== running) {
      await client.depositTransaction.update({
        where: { id: txn.id },
        data: { balanceAfter: running },
      });
    }
  }
}
