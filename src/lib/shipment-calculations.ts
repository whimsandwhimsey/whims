import { prisma } from '@/lib/prisma';
import { toNumber, computeOutstandingBalance, computePaymentStatus, round2 } from '@/lib/calculations';

/** Recomputes a shipment's amountPaid/outstandingBalance/paymentStatus from
 * its actual Payments — same "replay, don't patch" principle as invoices,
 * just without the overpay-to-deposit auto-conversion (shipping fees are
 * small enough that a manual correction is simpler than automating it). */
export async function recalculateShipmentFinancials(shipmentId: string): Promise<void> {
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return;

  const payments = await prisma.payment.findMany({ where: { shipmentId } });
  const amountPaid = round2(payments.reduce((sum, p) => sum + toNumber(p.amount), 0));
  const cost = toNumber(shipment.shippingCost);

  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      amountPaid,
      outstandingBalance: computeOutstandingBalance(cost, amountPaid),
      paymentStatus: computePaymentStatus(cost, amountPaid),
    },
  });
}
