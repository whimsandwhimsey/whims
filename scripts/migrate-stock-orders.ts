import { PrismaClient } from '@prisma/client';
import { Client as PgClient } from 'pg';

process.loadEnvFile();

const DRY_RUN = !process.argv.includes('--commit');
const prisma = new PrismaClient();

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

async function main() {
  console.log(DRY_RUN ? '\n=== DRY RUN — no writes will happen ===\n' : '\n=== COMMIT MODE — writing to Neon ===\n');

  const legacy = new PgClient({ connectionString: process.env.SUPABASE_DATABASE_URL });
  await legacy.connect();

  const { rows: orders } = await legacy.query(`
    select
      o.id as order_id,
      o.customer_id,
      c.name as customer_name,
      c.phone as customer_phone,
      o.created_at,
      (
        select coalesce(sum(p.amount), 0)
        from payments p
        join invoices i on i.id = p.invoice_id
        where i.order_id = o.id
      ) as paid_so_far
    from orders o
    left join customers c on c.id = o.customer_id
    where o.order_type = 'Stock'
    order by o.created_at asc, o.id asc
  `);

  const { rows: items } = await legacy.query(`
    select o.id as order_id, oi.title, oi.isbn, oi.qty, oi.price
    from orders o
    join order_items oi on oi.order_id = o.id
    where o.order_type = 'Stock'
  `);
  await legacy.end();

  const itemsByOrder = new Map<string, typeof items>();
  for (const it of items) {
    const list = itemsByOrder.get(it.order_id) ?? [];
    list.push(it);
    itemsByOrder.set(it.order_id, list);
  }

  const groups = new Map<string, {
    customerName: string;
    customerPhone: string;
    legacyOrderIds: string[];
    items: typeof items;
    totalPaid: number;
    earliestDate: Date;
  }>();

  for (const o of orders) {
    if (!o.customer_phone) continue;
    const key = normalizePhone(o.customer_phone);
    const orderItems = itemsByOrder.get(o.order_id) ?? [];
    const existing = groups.get(key);
    if (existing) {
      existing.legacyOrderIds.push(o.order_id);
      existing.items.push(...orderItems);
      existing.totalPaid += Number(o.paid_so_far ?? 0);
      if (new Date(o.created_at) < existing.earliestDate) existing.earliestDate = new Date(o.created_at);
    } else {
      groups.set(key, {
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        legacyOrderIds: [o.order_id],
        items: [...orderItems],
        totalPaid: Number(o.paid_so_far ?? 0),
        earliestDate: new Date(o.created_at),
      });
    }
  }

  let created = 0;
  let skippedExisting = 0;
  let skippedNoCustomer = 0;
  let skippedNoItems = 0;

  for (const [phoneKey, g] of groups) {
    const orderNumber = `ORD-MIG-STOCK-${phoneKey.slice(-6)}`;

    const alreadyExists = await prisma.order.findUnique({ where: { orderNumber } });
    if (alreadyExists) {
      skippedExisting++;
      continue;
    }

    const customer = await prisma.customer.findFirst({ where: { phone: { contains: phoneKey.slice(-9) } } });
    if (!customer) {
      console.log(`⚠ SKIP ${orderNumber} — no matching customer found for phone ${g.customerPhone} (${g.customerName}).`);
      skippedNoCustomer++;
      continue;
    }

    if (g.items.length === 0) {
      console.log(`⚠ SKIP ${orderNumber} — no book items found.`);
      skippedNoItems++;
      continue;
    }

    const totalAmount = g.items.reduce((sum, it) => sum + Number(it.qty) * Number(it.price), 0);

    console.log(
      `✓ ${orderNumber} — ${customer.name} — merged from ${g.legacyOrderIds.length} legacy order(s) (${g.legacyOrderIds.join(', ')}) — ${g.items.length} item(s) — total Rp${totalAmount.toLocaleString('id-ID')}` +
        (g.totalPaid > 0 ? ` — legacy shows Rp${g.totalPaid.toLocaleString('id-ID')} already paid (note only, not auto-invoiced)` : '')
    );

    if (!DRY_RUN) {
      await prisma.order.create({
        data: {
          orderNumber,
          customerId: customer.id,
          orderDate: g.earliestDate,
          orderType: 'PO_REMAINDER',
          status: 'ARRIVED',
          paymentStatus: 'UNPAID',
          totalAmount,
          amountPaid: 0,
          outstandingBalance: totalAmount,
          notes:
            `Migrated & merged from legacy Stock orders: ${g.legacyOrderIds.join(', ')}.` +
            (g.totalPaid > 0
              ? ` Legacy system shows Rp${g.totalPaid.toLocaleString('id-ID')} already paid across those orders — VERIFY MANUALLY before invoicing, no invoice/payment was auto-created.`
              : ' Legacy system shows nothing paid yet.'),
          items: {
            create: g.items.map((it) => ({
              bookTitle: it.title,
              isbn: it.isbn || null,
              quantity: Number(it.qty),
              sellingPrice: Number(it.price),
              discount: 0,
              subtotal: Number(it.qty) * Number(it.price),
            })),
          },
        },
      });
    }
    created++;
  }

  console.log(`\n${created} order(s) ${DRY_RUN ? 'would be' : 'were'} created (${groups.size} unique customer(s) found).`);
  console.log(`${skippedExisting} already existed (skipped).`);
  console.log(`${skippedNoCustomer} skipped — no matching customer.`);
  console.log(`${skippedNoItems} skipped — no book items.`);
  console.log(
    DRY_RUN
      ? '\n(DRY RUN — review this list carefully, then re-run with --commit.)\n'
      : '\n(COMMIT — saved to Neon. Every order needs manual review before invoicing — check the note on each one.)\n'
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
