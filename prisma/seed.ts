import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ── Staff / Admin accounts ──
  const adminPasswordHash = await bcrypt.hash('Admin123!', 10);
  const staffPasswordHash = await bcrypt.hash('Staff123!', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminPasswordHash,
      name: 'Store Owner',
      role: 'ADMIN',
    },
  });

  await prisma.user.upsert({
    where: { username: 'staff1' },
    update: {},
    create: {
      username: 'staff1',
      passwordHash: staffPasswordHash,
      name: 'Warehouse Staff',
      role: 'STAFF',
    },
  });

  // ── Sample books ──
  const book1 = await prisma.book.upsert({
    where: { isbn: '9780143127550' },
    update: {},
    create: {
      title: 'Sapiens: A Brief History of Humankind',
      author: 'Yuval Noah Harari',
      isbn: '9780143127550',
      format: 'PAPERBACK',
    },
  });

  const book2 = await prisma.book.upsert({
    where: { isbn: '9780062316097' },
    update: {},
    create: {
      title: 'Homo Deus',
      author: 'Yuval Noah Harari',
      isbn: '9780062316097',
      format: 'PAPERBACK',
    },
  });

  // ── Sample customer ──
  const existingCustomer = await prisma.customer.findFirst({ where: { phone: '6281234567890' } });
  const customer = existingCustomer ?? await prisma.customer.create({
    data: {
      name: 'Siti Rahayu',
      phone: '6281234567890',
      address: 'Jl. Kenanga No. 12, Jakarta Selatan',
      notes: 'Prefers WhatsApp updates.',
      status: 'ACTIVE',
    },
  });

  // ── Sample pending signup (so the admin approval banner has something to show) ──
  const existingPending = await prisma.customer.findFirst({ where: { phone: '6281298765432' } });
  if (!existingPending) {
    await prisma.customer.create({
      data: {
        name: 'Budi Santoso',
        phone: '6281298765432',
        address: 'Jl. Melati No. 5, Bandung',
        status: 'PENDING',
      },
    });
  }

  // ── Sample order with items ──
  const existingOrder = await prisma.order.findUnique({ where: { orderNumber: 'ORD-2026-000001' } });
  if (!existingOrder) {
    const item1Subtotal = 250000 * 2 - 10000;
    const item2Subtotal = 270000 * 1;

    const order = await prisma.order.create({
      data: {
        orderNumber: 'ORD-2026-000001',
        customerId: customer.id,
        expectedArrivalDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        status: 'WAITING',
        notes: 'Pre-order, pays in two installments.',
        createdById: admin.id,
        subtotal: item1Subtotal + item2Subtotal,
        totalAmount: item1Subtotal + item2Subtotal,
        totalCogs: 150000 * 2 + 160000 * 1,
        profit: item1Subtotal + item2Subtotal - (150000 * 2 + 160000 * 1),
        discountTotal: 10000,
        amountPaid: 0,
        outstandingBalance: item1Subtotal + item2Subtotal,
        paymentStatus: 'UNPAID',
        items: {
          create: [
            {
              bookId: book1.id,
              bookTitle: book1.title,
              quantity: 2,
              sellingPrice: 250000,
              cogs: 150000,
              discount: 10000,
              subtotal: item1Subtotal,
            },
            {
              bookId: book2.id,
              bookTitle: book2.title,
              quantity: 1,
              sellingPrice: 270000,
              cogs: 160000,
              discount: 0,
              subtotal: item2Subtotal,
            },
          ],
        },
      },
    });
    console.log('Created sample order:', order.orderNumber);
  }

  console.log('Seed complete.');
  console.log('  Admin login   -> username: admin    password: Admin123!');
  console.log('  Staff login   -> username: staff1   password: Staff123!');
  console.log('  Customer login-> phone:    081234567890 (or 6281234567890)');
  console.log('  Pending signup -> Budi Santoso (081298765432) — try approving it in /admin/customers');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
