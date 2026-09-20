import { prisma } from '@/lib/prisma';
import { toNumber, computeOutstandingBalance, computePaymentStatus, round2 } from '@/lib/calculations';
import type { Prisma } from '@prisma/client';

type DbClient = typeof prisma | Prisma.TransactionClient;

/** Recomputes a shipment's amountPaid/outstandingBalance/paymentStatus from
 * its actual Payments — same "replay, don't patch" principle as invoices,
 * just without the overpay-to-deposit auto-conversion (shipping fees are
 * small enough that a manual correction is simpler than automating it).
 *
 * Pass the `tx` from an enclosing `prisma.$transaction(...)` that also
 * creates the Payment this call is reacting to — otherwise a failure here
 * could leave a Payment on record that the shipment's own balance never
 * reflects. */
export async function recalculateShipmentFinancials(shipmentId: string, client: DbClient = prisma): Promise<void> {
  const shipment = await client.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return;

  const [payments, depositUsed] = await Promise.all([
    client.payment.findMany({ where: { shipmentId } }),
    client.depositTransaction.findMany({ where: { shipmentId, type: 'USED' } }),
  ]);
  const amountPaid = round2(
    payments.reduce((sum, p) => sum + toNumber(p.amount), 0) +
      depositUsed.reduce((sum, d) => sum + toNumber(d.amount), 0)
  );
  const cost = toNumber(shipment.shippingCost);

  await client.shipment.update({
    where: { id: shipmentId },
    data: {
      amountPaid,
      outstandingBalance: computeOutstandingBalance(cost, amountPaid),
      paymentStatus: computePaymentStatus(cost, amountPaid),
    },
  });
}
