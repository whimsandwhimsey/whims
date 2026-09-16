/**
 * Two-phase backfill from the legacy Supabase, for orders that were
 * already migrated (ORD-MIG-<legacy id>):
 *
 * PHASE 1 — PO Batch reconstruction: legacy `orders.supplier_name` +
 * `po_month` + `eta` is used to find-or-create a Supplier and a
 * PurchaseBatch, then every matching migrated Order gets its
 * supplierId/poBatchId/poMonth/etaMonth filled in.
 *
 * PHASE 2 — Shipment backfill: legacy `shipments` (grouped by
 * courier+tracking, since one resi can cover several orders) becomes a
 * real Shipment record, linked to every matching migrated Order. Known
 * placeholder/fake tracking values ("123456", "Done") are explicitly
 * excluded — those orders get a note instead of a fabricated Shipment.
 * Shipping cost is set to 0 (never tracked in the legacy system) —
 * fill in the real amount manually afterwards.
 *
 * Dry-run by default. Pass --commit to write. Safe to re-run — always
 * checks for existing Supplier/PurchaseBatch/Shipment before creating.
 */
import { PrismaClient } from '@prisma/client';
import { Client as PgClient } from 'pg';

process.loadEnvFile();

const DRY_RUN = !process.argv.includes('--commit');
const prisma = new PrismaClient();

// Tracking values that are clearly placeholders, not real resi — never
// turned into a Shipment, no matter how many orders share them.
const FAKE_TRACKING_VALUES = new Set(['123456', 'done']);

const COURIER_MAP: Record<string, string> = {
  wahana: 'WAHANA',
  lion: 'LION',
  'lion parcel': 'LION',
  jne: 'JNE',
  jnt: 'JNT',
  'j&t': 'JNT',
  sicepat: 'SICEPAT',
  anteraja: 'ANTERAJA',
  ninja: 'NINJA',
  'ninja xpress': 'NINJA',
  idexpress: 'IDEXPRESS',
  'id express': 'IDEXPRESS',
  ojek: 'OJEK',
  gojek: 'OJEK',
  grab: 'OJEK',
  shopee: 'SHOPEE',
  'shopee express': 'SHOPEE',
};

async function phase1PoBatches(legacy: PgClient) {
  console.log('\n--- PHASE 1: PO Batch reconstruction ---\n');

  const { rows } = await legacy.query(`
    select id, supplier_name, po_month, eta
    from orders
    where supplier_name is not null
  `);

  type Group = { supplierName: string; poMonth: string | null; eta: string | null; legacyIds: string[] };
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const key = `${r.supplier_name}|||${r.po_month}|||${r.eta}`;
    const existing = groups.get(key);
    if (existing) existing.legacyIds.push(r.id);
    else groups.set(key, { supplierName: r.supplier_name, poMonth: r.po_month, eta: r.eta, legacyIds: [r.id] });
  }

  console.log(`Found ${rows.length} order(s) with supplier data, grouping into ${groups.size} PO batch(es).\n`);

  let suppliersCreated = 0;
  let batchesCreated = 0;
  let ordersUpdated = 0;
  let ordersNotFoundInNew = 0;

  for (const g of groups.values()) {
    const isReadyStock = g.supplierName.trim().toLowerCase() === 'ready stock';
    const batchType = isReadyStock ? 'READY_STOCK' : 'PO_REGULAR';

    let supplier = isReadyStock ? null : await prisma.supplier.findFirst({ where: { name: g.supplierName } });
    if (!isReadyStock && !supplier) {
      console.log(`  + supplier "${g.supplierName}" (new)`);
      if (!DRY_RUN) {
        supplier = await prisma.supplier.create({ data: { name: g.supplierName, isActive: true } });
      }
      suppliersCreated++;
    }

    const batchName = isReadyStock ? `Ready Stock — ${g.poMonth ?? '?'}` : `${g.supplierName} — PO ${g.poMonth ?? '?'}`;
    let batch = await prisma.purchaseBatch.findFirst({
      where: { type: batchType, poMonth: g.poMonth, etaMonth: g.eta, supplierId: supplier?.id ?? null },
    });
    if (!batch) {
      console.log(`  + batch "${batchName}" (eta ${g.eta ?? '?'}) — ${g.legacyIds.length} order(s)`);
      if (!DRY_RUN) {
        batch = await prisma.purchaseBatch.create({
          data: {
            name: batchName,
            type: batchType as any,
            poMonth: g.poMonth,
            etaMonth: g.eta,
            supplierId: supplier?.id ?? null,
          },
        });
      }
      batchesCreated++;
    }

    for (const legacyId of g.legacyIds) {
      const orderNumber = `ORD-MIG-${legacyId}`;
      const order = await prisma.order.findUnique({ where: { orderNumber } });
      if (!order) {
        ordersNotFoundInNew++;
        continue;
      }
      if (!DRY_RUN && batch) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            supplierId: supplier?.id ?? null,
            poBatchId: batch.id,
            poMonth: g.poMonth,
            etaMonth: g.eta,
            ...(isReadyStock ? { orderType: 'READY_STOCK' as any } : {}),
          },
        });
      }
      ordersUpdated++;
    }
  }

  console.log(`\n${suppliersCreated} new supplier(s), ${batchesCreated} new batch(es).`);
  console.log(`${ordersUpdated} order(s) ${DRY_RUN ? 'would be' : 'were'} linked to a batch.`);
  if (ordersNotFoundInNew > 0) {
    console.log(`⚠ ${ordersNotFoundInNew} legacy order(s) had no matching ORD-MIG-<id> in the new system.`);
  }
}

async function phase2Shipments(legacy: PgClient) {
  console.log('\n--- PHASE 2: Shipment backfill ---\n');

  const { rows } = await legacy.query(`
    select order_id, customer_id, courier, tracking, packed_at, shipped_at, delivered_at
    from shipments
    where tracking is not null
  `);

  type Group = { courier: string; tracking: string; legacyOrderIds: string[] };
  const groups = new Map<string, Group>();
  let fakeSkipped = 0;

  for (const r of rows) {
    if (FAKE_TRACKING_VALUES.has(String(r.tracking).trim().toLowerCase())) {
      fakeSkipped++;
      const orderNumber = `ORD-MIG-${r.order_id}`;
      if (!DRY_RUN) {
        const order = await prisma.order.findUnique({ where: { orderNumber } });
        if (order) {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              notes: `${order.notes ?? ''}\nLegacy shipment courier: ${r.courier ?? 'unknown'} — real tracking number was never recorded, needs manual entry.`.trim(),
            },
          });
        }
      }
      continue;
    }
    const key = `${r.courier}|||${r.tracking}`;
    const existing = groups.get(key);
    if (existing) existing.legacyOrderIds.push(r.order_id);
    else groups.set(key, { courier: r.courier, tracking: r.tracking, legacyOrderIds: [r.order_id] });
  }

  console.log(`Found ${rows.length} legacy shipment row(s), ${fakeSkipped} using placeholder tracking (skipped).`);
  console.log(`${groups.size} real shipment(s) to backfill.\n`);

  let created = 0;
  let unmappedCourier = 0;
  let ordersNotFoundInNew = 0;
  let alreadyLinked = 0;

  for (const g of groups.values()) {
    const courierEnum = COURIER_MAP[g.courier?.trim().toLowerCase() ?? ''];
    if (!courierEnum) {
      console.log(`  ⚠ Unmapped courier "${g.courier}" for tracking ${g.tracking} — skipped, needs manual entry.`);
      unmappedCourier++;
      continue;
    }

    const matchedOrders: { id: string; customerId: string }[] = [];
    for (const legacyId of g.legacyOrderIds) {
      const order = await prisma.order.findUnique({
        where: { orderNumber: `ORD-MIG-${legacyId}` },
        select: { id: true, customerId: true, shipmentId: true },
      });
      if (!order) {
        ordersNotFoundInNew++;
        continue;
      }
      if (order.shipmentId) {
        alreadyLinked++;
        continue;
      }
      matchedOrders.push(order);
    }
    if (matchedOrders.length === 0) continue;

    console.log(`  + ${courierEnum} ${g.tracking} — ${matchedOrders.length} order(s)`);

    if (!DRY_RUN) {
      const shipment = await prisma.shipment.create({
        data: {
          customerId: matchedOrders[0].customerId,
          courier: courierEnum as any,
          trackingNumber: g.tracking,
          shippingCost: 0,
          amountPaid: 0,
          outstandingBalance: 0,
          paymentStatus: 'PAID',
        },
      });
      for (const o of matchedOrders) {
        await prisma.order.update({
          where: { id: o.id },
          data: { shipmentId: shipment.id, courier: courierEnum as any, trackingNumber: g.tracking },
        });
      }
    }
    created++;
  }

  console.log(`\n${created} shipment(s) ${DRY_RUN ? 'would be' : 'were'} created.`);
  if (unmappedCourier > 0) console.log(`⚠ ${unmappedCourier} shipment(s) skipped — unmapped courier name.`);
  if (alreadyLinked > 0) console.log(`${alreadyLinked} order(s) already had a shipment (skipped).`);
  if (ordersNotFoundInNew > 0) console.log(`⚠ ${ordersNotFoundInNew} legacy order(s) had no matching ORD-MIG-<id>.`);
}

async function main() {
  console.log(DRY_RUN ? '\n=== DRY RUN — no writes will happen ===' : '\n=== COMMIT MODE — writing to Neon ===');

  const legacy = new PgClient({ connectionString: process.env.SUPABASE_DATABASE_URL });
  await legacy.connect();

  await phase1PoBatches(legacy);
  await phase2Shipments(legacy);

  await legacy.end();
  await prisma.$disconnect();

  console.log(DRY_RUN ? '\n(DRY RUN — review everything above, then re-run with --commit.)\n' : '\n(COMMIT — saved to Neon.)\n');
}

main().catch(async (err) => {
  console.error('Backfill failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
