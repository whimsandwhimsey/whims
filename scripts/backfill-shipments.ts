/**
 * Backfills Shipment records for orders that already had courier +
 * trackingNumber set BEFORE the Shipment feature existed — groups them by
 * (customerId, courier, trackingNumber) since the same resi can cover
 * several orders, creates one Shipment per group, and links every order
 * in that group to it.
 *
 * Shipping cost is set to 0 for backfilled shipments — that data was never
 * captured before, so it needs to be filled in manually afterwards from
 * each Shipment's detail page.
 *
 * Dry-run by default — prints what it would create without writing.
 * Pass --commit to actually save. Safe to re-run: only touches orders
 * that still have trackingNumber set but no shipmentId yet.
 */
import { PrismaClient } from '@prisma/client';

const DRY_RUN = !process.argv.includes('--commit');
const prisma = new PrismaClient();

async function main() {
  console.log(DRY_RUN ? '\n=== DRY RUN — no writes will happen ===\n' : '\n=== COMMIT MODE — writing to Neon ===\n');

  const orders = await prisma.order.findMany({
    where: { trackingNumber: { not: null }, shipmentId: null },
    include: { customer: { select: { name: true } } },
  });

  if (orders.length === 0) {
    console.log('Nothing to backfill — every order with a tracking number already has a Shipment.');
    await prisma.$disconnect();
    return;
  }

  type Group = { customerId: string; customerName: string; courier: string; trackingNumber: string; orderIds: string[] };
  const groups = new Map<string, Group>();
  for (const o of orders) {
    const key = `${o.customerId}|${o.courier}|${o.trackingNumber}`;
    const existing = groups.get(key);
    if (existing) existing.orderIds.push(o.id);
    else
      groups.set(key, {
        customerId: o.customerId,
        customerName: o.customer.name,
        courier: o.courier!,
        trackingNumber: o.trackingNumber!,
        orderIds: [o.id],
      });
  }

  console.log(`Found ${orders.length} order(s) to backfill into ${groups.size} shipment(s):\n`);

  let created = 0;
  for (const g of groups.values()) {
    console.log(
      `  ${g.customerName} — ${g.courier} ${g.trackingNumber} — ${g.orderIds.length} order(s) — ongkir Rp0 (isi manual nanti)`
    );
    created++;
    if (!DRY_RUN) {
      const shipment = await prisma.shipment.create({
        data: {
          customerId: g.customerId,
          courier: g.courier as any,
          trackingNumber: g.trackingNumber,
          shippingCost: 0,
          amountPaid: 0,
          outstandingBalance: 0,
          paymentStatus: 'PAID', // Rp0 owed — nothing outstanding until the real cost is entered
        },
      });
      await prisma.order.updateMany({
        where: { id: { in: g.orderIds } },
        data: { shipmentId: shipment.id },
      });
    }
  }

  console.log(`\n${created} shipment(s) ${DRY_RUN ? 'would be' : 'were'} created.`);
  console.log(
    DRY_RUN
      ? '\n(DRY RUN — review this, then re-run with --commit.)\n'
      : '\n(COMMIT — saved to Neon. Go fill in the real ongkir amount on each shipment from /admin/shipments.)\n'
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Backfill failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
