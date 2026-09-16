/**
 * Cross-checks EVERY order in the old Supabase against the new system —
 * flags anything that isn't accounted for, whether migrated normally or
 * merged in via the Stock-order migration. Read-only on both sides.
 */
import { PrismaClient } from '@prisma/client';
import { Client as PgClient } from 'pg';

process.loadEnvFile();

const prisma = new PrismaClient();

async function main() {
  const legacy = new PgClient({ connectionString: process.env.SUPABASE_DATABASE_URL });
  await legacy.connect();

  const { rows: legacyOrders } = await legacy.query(`
    select id, order_type, created_at from orders order by created_at asc
  `);
  await legacy.end();

  console.log(`\nFound ${legacyOrders.length} order(s) in the OLD system.\n`);

  const allNewOrders = await prisma.order.findMany({
    select: { orderNumber: true, notes: true },
  });
  const newOrderNumbers = new Set(allNewOrders.map((o) => o.orderNumber));
  const notesBlob = allNewOrders.map((o) => o.notes ?? '').join('\n---\n');

  const missing: { id: string; type: string }[] = [];
  let migratedNormal = 0;
  let migratedAsStock = 0;

  for (const o of legacyOrders) {
    if (o.order_type === 'Stock') {
      if (notesBlob.includes(o.id)) {
        migratedAsStock++;
      } else {
        missing.push({ id: o.id, type: o.order_type });
      }
    } else {
      const expectedOrderNumber = `ORD-MIG-${o.id}`;
      if (newOrderNumbers.has(expectedOrderNumber)) {
        migratedNormal++;
      } else {
        missing.push({ id: o.id, type: o.order_type });
      }
    }
  }

  console.log(`✓ ${migratedNormal} order(s) found via normal migration (ORD-MIG-<id>).`);
  console.log(`✓ ${migratedAsStock} Stock order(s) found merged into a new order's notes.`);
  console.log(`\n${missing.length} order(s) NOT found anywhere in the new system:\n`);

  for (const m of missing) {
    console.log(`  ✗ ${m.id}  (order_type: ${m.type})`);
  }

  if (missing.length === 0) {
    console.log('\n🎉 Every order from the old system is accounted for in the new system.\n');
  } else {
    console.log('\n⚠ Review the list above — these need manual investigation.\n');
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Audit failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});

