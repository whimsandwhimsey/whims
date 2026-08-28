/**
 * Migrates data from the OLD Supabase database into the NEW Neon database.
 *
 * SAFETY:
 *  - Only ever READS from Supabase (SUPABASE_DATABASE_URL). Never writes,
 *    never deletes, never touches it in any way.
 *  - Defaults to DRY RUN: computes and prints everything it *would* do,
 *    writes nothing. Run `npm run migrate:legacy:dry-run` first, always.
 *  - Only writes to Neon when run with `--commit`
 *    (`npm run migrate:legacy:commit`), and only after you've reviewed the
 *    dry-run report.
 *  - Idempotent: every migrated row is tagged with its legacy id in
 *    `notes` (e.g. "Migrated from ORD-2026-1098"). Re-running --commit
 *    skips anything already migrated instead of duplicating it — safe to
 *    stop and resume.
 *  - Order totals, invoice/order payment status, and outstanding balances
 *    are always RECOMPUTED from the migrated items/payments — never
 *    copied from the legacy database's own (buggy) calculated fields.
 *
 * See /mnt/user-data/outputs/migration-mapping-plan.md for the full
 * field-by-field mapping this script implements — read that first.
 */

import { Client as PgClient } from 'pg';
import { PrismaClient } from '@prisma/client';

const DRY_RUN = !process.argv.includes('--commit');
const LEGACY_TAG_PREFIX = 'Migrated from';

const prisma = new PrismaClient();
const legacy = new PgClient({ connectionString: process.env.SUPABASE_DATABASE_URL });

// ── small helpers, self-contained (no path-aliased imports — this script
// runs standalone via tsx, outside the Next app) ──

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function computeItemSubtotal(item: { sellingPrice: number; quantity: number; discount: number }): number {
  return round2(item.sellingPrice * item.quantity - item.discount);
}

function computeOrderTotals(
  items: { sellingPrice: number; quantity: number; discount: number; cogs: number }[]
) {
  let subtotal = 0;
  let discountTotal = 0;
  let totalCogs = 0;
  for (const it of items) {
    subtotal += it.sellingPrice * it.quantity;
    discountTotal += it.discount;
    totalCogs += it.cogs * it.quantity;
  }
  const totalAmount = round2(subtotal - discountTotal);
  return {
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal),
    totalAmount,
    totalCogs: round2(totalCogs),
    profit: round2(totalAmount - totalCogs),
  };
}

function computePaymentStatus(total: number, paid: number): 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID' {
  if (paid <= 0) return 'UNPAID';
  if (paid < total) return 'PARTIAL';
  if (paid > total) return 'OVERPAID';
  return 'PAID';
}

function computeOutstanding(total: number, paid: number): number {
  return Math.max(0, round2(total - paid));
}

/** Same fuzzy-match logic as the ISBN-lookup form — strips common
 * publisher suffixes so "Usborne" matches "Usborne Publishing Ltd". */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\b(publishing|publishers?|books?|press|group|ltd|inc|co|corp|corporation|company|llc)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapBookFormat(legacyFormat: string | null): string | null {
  if (!legacyFormat) return null;
  const map: Record<string, string> = {
    Hardcover: 'HARDCOVER',
    Paperback: 'PAPERBACK',
    'Board Book': 'BOARD_BOOK',
    'Sound Book': 'SOUND_BOOK',
    Boxset: 'BOXSET',
  };
  return map[legacyFormat] ?? null; // "Other" and anything unrecognized → null, flagged in report
}

function mapOrderType(legacyType: string, eventName: string | null): string {
  if (eventName && eventName.trim()) return 'EVENT_JASTIP';
  if (legacyType === 'PO') return 'PO_REGULAR';
  if (legacyType === 'ReadyStock') return 'READY_STOCK';
  return 'READY_STOCK'; // shouldn't happen — 'Stock' rows are filtered out before this is called
}

function mapOrderStatus(legacyStatus: string): string {
  const map: Record<string, string> = {
    'On Process': 'WAITING',
    Arrived: 'ARRIVED',
    'Ready to Ship': 'ARRIVED',
    Shipped: 'SHIPPED',
    Delivered: 'COMPLETED',
  };
  return map[legacyStatus] ?? 'WAITING';
}

function mapInvoiceType(legacyType: string): string {
  const map: Record<string, string> = { DP: 'DEPOSIT', Final: 'FINAL_PAYMENT', 'Ready Stock': 'READY_STOCK' };
  return map[legacyType] ?? 'READY_STOCK';
}

function mapPaymentMethod(legacyMethod: string): string {
  return legacyMethod === 'QRIS' ? 'QRIS' : 'BANK_TRANSFER'; // Seabank/Cash/Customer Credit → Bank Transfer
}

function toMonthString(d: Date | string | null): string | null {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// ── report accumulator ──
const report = {
  suppliers: { seen: 0, created: 0, skipped: 0 },
  publishers: { seen: 0, created: 0, skipped: 0 },
  books: { seen: 0, created: 0, skipped: 0, noIsbn: 0, unmappedFormats: new Set<string>() },
  customers: { seen: 0, created: 0, skipped: 0 },
  orders: { seen: 0, migrated: 0, skipped: 0, archivedStock: 0, unmappedStatuses: new Set<string>() },
  invoices: { seen: 0, created: 0, skipped: 0, unmappedTypes: new Set<string>() },
  payments: { seen: 0, created: 0, skipped: 0, unmappedMethods: new Set<string>() },
  expenses: { seen: 0, created: 0, skipped: 0 },
  totals: { legacyOrderAmountSum: 0, migratedOrderAmountSum: 0, legacyPaymentSum: 0, migratedPaymentSum: 0 },
};

async function alreadyMigrated(model: any, legacyId: string): Promise<{ id: string } | null> {
  return model.findFirst({ where: { notes: { contains: `${LEGACY_TAG_PREFIX} ${legacyId}` } }, select: { id: true } });
}

async function main() {
  console.log(DRY_RUN ? '\n=== DRY RUN — no writes will happen ===\n' : '\n=== COMMIT MODE — writing to Neon ===\n');

  await legacy.connect();

  // ── 1. Suppliers ──
  const supplierIdMap = new Map<string, string>(); // legacy id -> new Supplier.id
  const legacySuppliers = (await legacy.query('select * from suppliers')).rows;
  for (const s of legacySuppliers) {
    report.suppliers.seen++;
    const existing = await prisma.supplier.findFirst({ where: { name: s.name } });
    if (existing) {
      supplierIdMap.set(String(s.id), existing.id);
      report.suppliers.skipped++;
      continue;
    }
    report.suppliers.created++;
    if (!DRY_RUN) {
      const created = await prisma.supplier.create({
        data: {
          name: s.name,
          notes: [s.contact, s.email].filter(Boolean).join(' · ') || null,
          isActive: s.active ?? true,
        },
      });
      supplierIdMap.set(String(s.id), created.id);
    } else {
      supplierIdMap.set(String(s.id), `DRYRUN:supplier:${s.id}`);
    }
  }

  // ── 2. Publishers ──
  const publisherIdMap = new Map<string, string>();
  const legacyPublishers = (await legacy.query('select * from publishers')).rows;
  for (const p of legacyPublishers) {
    report.publishers.seen++;
    const existing = await prisma.publisher.findFirst({ where: { name: p.name } });
    if (existing) {
      publisherIdMap.set(String(p.id), existing.id);
      report.publishers.skipped++;
      continue;
    }
    report.publishers.created++;
    if (!DRY_RUN) {
      const created = await prisma.publisher.create({
        data: {
          name: p.name,
          notes: [p.contact, p.email].filter(Boolean).join(' · ') || null,
          isActive: p.active ?? true,
        },
      });
      publisherIdMap.set(String(p.id), created.id);
    } else {
      publisherIdMap.set(String(p.id), `DRYRUN:publisher:${p.id}`);
    }
  }
  // Helper: find-or-create publisher by fuzzy name match against what we've loaded so far.
  const allPublisherNames = new Map<string, string>(); // normalized name -> Publisher.id
  {
    const existing = await prisma.publisher.findMany({ select: { id: true, name: true } });
    for (const p of existing) allPublisherNames.set(normalizeName(p.name), p.id);
  }
  async function resolvePublisherId(rawName: string | null): Promise<string | null> {
    if (!rawName || !rawName.trim()) return null;
    const norm = normalizeName(rawName);
    if (allPublisherNames.has(norm)) return allPublisherNames.get(norm)!;
    if (DRY_RUN) return null; // don't fabricate ids in dry run
    const created = await prisma.publisher.create({ data: { name: rawName.trim() } });
    allPublisherNames.set(norm, created.id);
    return created.id;
  }

  // ── 3. Books (derived from order_items — one per unique ISBN) ──
  const legacyItems = (await legacy.query('select * from order_items')).rows;
  const bookIdByIsbn = new Map<string, string>();
  {
    const byIsbn = new Map<string, any[]>();
    for (const it of legacyItems) {
      if (!it.isbn) continue;
      if (!byIsbn.has(it.isbn)) byIsbn.set(it.isbn, []);
      byIsbn.get(it.isbn)!.push(it);
    }
    for (const [isbn, rows] of byIsbn) {
      report.books.seen++;
      const existing = await prisma.book.findUnique({ where: { isbn } });
      if (existing) {
        bookIdByIsbn.set(isbn, existing.id);
        report.books.skipped++;
        continue;
      }
      // Most common title/format/weight/publisher for this ISBN (guards against typos on some rows).
      const titleCounts = new Map<string, number>();
      const formatCounts = new Map<string, number>();
      const publisherCounts = new Map<string, number>();
      let weight: number | null = null;
      for (const r of rows) {
        titleCounts.set(r.title, (titleCounts.get(r.title) ?? 0) + 1);
        if (r.format) formatCounts.set(r.format, (formatCounts.get(r.format) ?? 0) + 1);
        if (r.publisher_name) publisherCounts.set(r.publisher_name, (publisherCounts.get(r.publisher_name) ?? 0) + 1);
        if (weight === null && r.weight_grams) weight = r.weight_grams;
      }
      const mostCommon = (m: Map<string, number>) =>
        [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const title = mostCommon(titleCounts) ?? rows[0].title;
      const legacyFormat = mostCommon(formatCounts);
      const format = mapBookFormat(legacyFormat);
      if (legacyFormat && !format) report.books.unmappedFormats.add(legacyFormat);
      const publisherName = mostCommon(publisherCounts);

      report.books.created++;
      if (!DRY_RUN) {
        const publisherId = await resolvePublisherId(publisherName);
        const created = await prisma.book.create({
          data: { title, isbn, format: format as any, weightGrams: weight, publisherId },
        });
        bookIdByIsbn.set(isbn, created.id);
      } else {
        bookIdByIsbn.set(isbn, `DRYRUN:book:${isbn}`);
      }
    }
    report.books.noIsbn = legacyItems.filter((it) => !it.isbn).length;
  }

  // ── 4. Customers ──
  // The customer portal logs in by phone number, so two customers can't
  // share one phone in the new system — legacy rows with a duplicate phone
  // are merged into a single Customer here (their other name is kept in
  // notes so no information is lost; every legacy id below still maps to
  // the one merged record, so all of their orders/payments land in the
  // right place).
  const customerIdMap = new Map<string, string>();
  const legacyCustomers = (await legacy.query('select * from customers')).rows;

  const byPhone = new Map<string, any[]>();
  for (const c of legacyCustomers) {
    const key = c.phone && c.phone.trim() ? c.phone.trim() : `__no_phone_${c.id}`;
    if (!byPhone.has(key)) byPhone.set(key, []);
    byPhone.get(key)!.push(c);
  }

  for (const [phoneKey, group] of byPhone) {
    report.customers.seen += group.length;
    const primary = group[0];
    const legacyTag = `${LEGACY_TAG_PREFIX} customer ${primary.id}`;
    const existing = await prisma.customer.findFirst({ where: { notes: { contains: legacyTag } } });
    if (existing) {
      for (const c of group) customerIdMap.set(String(c.id), existing.id);
      report.customers.skipped += group.length;
      continue;
    }

    const isMerged = group.length > 1;
    const address = [primary.address, primary.city, primary.postal_code].filter(Boolean).join(', ') || null;
    const allTags = group.map((c) => `${LEGACY_TAG_PREFIX} customer ${c.id}`);
    const mergeNote = isMerged
      ? `Merged from ${group.length} legacy customers sharing phone ${phoneKey}: ${group.map((c) => `"${c.name}"`).join(', ')} — phone must be unique for portal login, so these became one customer.`
      : null;
    const notes = [primary.notes, mergeNote, ...allTags].filter(Boolean).join(' — ');

    report.customers.created += 1; // one new Customer row, regardless of how many legacy rows fed into it
    const phoneValue = phoneKey.startsWith('__no_phone_') ? `NO-PHONE-${primary.id}` : phoneKey;
    if (!DRY_RUN) {
      const created = await prisma.customer.create({
        data: { name: primary.name, phone: phoneValue, address, notes },
      });
      for (const c of group) customerIdMap.set(String(c.id), created.id);
    } else {
      for (const c of group) customerIdMap.set(String(c.id), `DRYRUN:customer:${c.id}`);
    }
  }

  // ── 5. Orders + Order Items (skip order_type = 'Stock') ──
  const orderIdMap = new Map<string, string>();
  const legacyOrders = (await legacy.query('select * from orders')).rows;
  const legacyItemsByOrder = new Map<string, any[]>();
  for (const it of legacyItems) {
    if (!legacyItemsByOrder.has(it.order_id)) legacyItemsByOrder.set(it.order_id, []);
    legacyItemsByOrder.get(it.order_id)!.push(it);
  }

  for (const o of legacyOrders) {
    report.orders.seen++;

    if (o.order_type === 'Stock') {
      report.orders.archivedStock++;
      continue; // handled separately — see archived-stock export, not migrated as an Order
    }

    const legacyTag = `${LEGACY_TAG_PREFIX} ${o.id}`;
    const existing = await prisma.order.findFirst({ where: { notes: { contains: legacyTag } } });
    if (existing) {
      orderIdMap.set(o.id, existing.id);
      report.orders.skipped++;
      continue;
    }

    const items = legacyItemsByOrder.get(o.id) ?? [];
    const mappedItems = items.map((it) => ({
      bookId: it.isbn ? bookIdByIsbn.get(it.isbn) ?? null : null,
      bookTitle: it.title,
      isbn: it.isbn ?? null,
      format: mapBookFormat(it.format),
      quantity: it.qty ?? 1,
      sellingPrice: Number(it.price ?? 0),
      cogs: 0, // legacy schema doesn't track COGS per item
      discount: 0,
    }));
    const totals = computeOrderTotals(mappedItems);
    report.totals.legacyOrderAmountSum += Number(o.amount ?? totals.totalAmount);
    report.totals.migratedOrderAmountSum += totals.totalAmount;

    if (!report.orders.unmappedStatuses.has(o.status) && !['On Process', 'Arrived', 'Ready to Ship', 'Shipped', 'Delivered'].includes(o.status)) {
      report.orders.unmappedStatuses.add(o.status);
    }

    report.orders.migrated++;
    if (!DRY_RUN) {
      const customerId = o.customer_id ? customerIdMap.get(String(o.customer_id)) : null;
      const supplierId = o.supplier_id ? supplierIdMap.get(String(o.supplier_id)) : null;
      const orderType = mapOrderType(o.order_type, o.event_name);
      const poMonth = toMonthString(o.po_month);
      const etaMonth = toMonthString(o.eta);

      const created = await prisma.order.create({
        data: {
          orderNumber: `ORD-MIG-${o.id.replace(/[^0-9A-Za-z-]/g, '')}`,
          customerId: customerId!,
          orderType: orderType as any,
          poMonth: orderType === 'PO_REGULAR' || orderType === 'PO_REMAINDER' ? poMonth : null,
          etaMonth,
          eventName: o.event_name || null,
          supplierId,
          orderDate: o.created_at ? new Date(o.created_at) : new Date(),
          status: mapOrderStatus(o.status) as any,
          notes: [o.notes, legacyTag].filter(Boolean).join(' — '),
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          totalAmount: totals.totalAmount,
          totalCogs: totals.totalCogs,
          profit: totals.profit,
          amountPaid: 0,
          outstandingBalance: totals.totalAmount,
          paymentStatus: 'UNPAID',
          items: {
            create: mappedItems.map((it) => ({
              bookId: it.bookId,
              bookTitle: it.bookTitle,
              isbn: it.isbn,
              format: it.format as any,
              quantity: it.quantity,
              sellingPrice: it.sellingPrice,
              cogs: it.cogs,
              discount: it.discount,
              subtotal: computeItemSubtotal(it),
            })),
          },
        },
      });
      orderIdMap.set(o.id, created.id);
    } else {
      orderIdMap.set(o.id, `DRYRUN:order:${o.id}`);
    }
  }

  // ── 6. Invoices (source of truth = invoices.order_id directly — invoice_orders/
  //      invoice_order_allocations confirmed to be noise from an earlier migration) ──
  const invoiceIdMap = new Map<string, string>();
  const legacyInvoices = (await legacy.query('select * from invoices')).rows;
  for (const inv of legacyInvoices) {
    report.invoices.seen++;
    const newOrderId = orderIdMap.get(inv.order_id);
    if (!newOrderId) {
      report.invoices.skipped++; // order wasn't migrated (e.g. was a 'Stock' order) — invoice has nothing to attach to
      continue;
    }

    const invoiceNumber = `INV-MIG-${inv.id.replace(/[^0-9A-Za-z-]/g, '')}`;
    const existing = await prisma.invoice.findUnique({ where: { invoiceNumber }, select: { id: true } });
    if (existing) {
      invoiceIdMap.set(inv.id, existing.id);
      report.invoices.skipped++;
      continue;
    }

    if (!['DP', 'Final', 'Ready Stock'].includes(inv.type)) report.invoices.unmappedTypes.add(inv.type);

    report.invoices.created++;
    if (!DRY_RUN) {
      const amount = Number(inv.amount ?? 0);
      const created = await prisma.invoice.create({
        data: {
          invoiceNumber,
          orderId: newOrderId,
          type: mapInvoiceType(inv.type) as any,
          amount,
          amountPaid: 0,
          outstandingBalance: amount,
          paymentStatus: 'UNPAID',
          issuedAt: inv.issued_at ? new Date(inv.issued_at) : new Date(),
        },
      });
      invoiceIdMap.set(inv.id, created.id);
    } else {
      invoiceIdMap.set(inv.id, `DRYRUN:invoice:${inv.id}`);
    }
  }

  // ── 7. Payments ──
  const legacyPayments = (await legacy.query('select * from payments')).rows;
  for (const p of legacyPayments) {
    report.payments.seen++;
    report.totals.legacyPaymentSum += Number(p.amount ?? 0);

    const legacyTag = `[${LEGACY_TAG_PREFIX} payment ${p.id}]`;
    const alreadyDone = await prisma.payment.findFirst({ where: { notes: { contains: legacyTag } } });
    if (alreadyDone) {
      report.payments.skipped++;
      continue;
    }

    const newInvoiceId = p.invoice_id ? invoiceIdMap.get(p.invoice_id) : null;
    const newCustomerId = p.customer_id ? customerIdMap.get(String(p.customer_id)) : null;
    if (!newCustomerId) {
      report.payments.skipped++;
      continue;
    }
    if (!['QRIS', 'Seabank Transfer', 'Cash', 'Customer Credit'].includes(p.method)) {
      report.payments.unmappedMethods.add(p.method);
    }

    report.payments.created++;
    report.totals.migratedPaymentSum += Number(p.amount ?? 0);
    if (!DRY_RUN) {
      let orderId: string | null = null;
      if (newInvoiceId) {
        const inv = await prisma.invoice.findUnique({ where: { id: newInvoiceId }, select: { orderId: true } });
        orderId = inv?.orderId ?? null;
      }
      await prisma.payment.create({
        data: {
          customerId: newCustomerId,
          orderId,
          invoiceId: newInvoiceId,
          date: p.payment_date ? new Date(p.payment_date) : p.paid_at ? new Date(p.paid_at) : new Date(),
          amount: Number(p.amount ?? 0),
          method: mapPaymentMethod(p.method) as any,
          notes: `${p.method === 'Customer Credit' ? 'Legacy "Customer Credit" method — recorded as a regular payment. ' : ''}${legacyTag}`,
        },
      });
    }
  }

  // ── 8. Expenses ──
  const legacyExpenses = (await legacy.query('select * from expenses')).rows;
  const expenseCategoryMap: Record<string, string> = {
    Packing: 'PACKING',
    'Shipping to Warehouse': 'SHIPPING_TO_WAREHOUSE',
  };
  for (const e of legacyExpenses) {
    report.expenses.seen++;
    const legacyTag = `[${LEGACY_TAG_PREFIX} expense ${e.id}]`;
    const description = [e.description, e.category ? `(legacy category: ${e.category})` : null, legacyTag]
      .filter(Boolean)
      .join(' ');
    const existing = await prisma.expense.findFirst({ where: { description: { contains: legacyTag } } });
    if (existing) {
      report.expenses.skipped++;
      continue;
    }
    report.expenses.created++;
    if (!DRY_RUN) {
      await prisma.expense.create({
        data: {
          category: (expenseCategoryMap[e.category] ?? 'OTHER') as any,
          description,
          amount: Number(e.amount ?? 0),
          date: e.expense_date ? new Date(e.expense_date) : new Date(),
        },
      });
    }
  }

  // ── 9. Recompute every migrated invoice/order's paid/outstanding from the migrated Payments ──
  if (!DRY_RUN) {
    console.log('\nRecalculating invoice & order payment status from migrated payments...');
    const allNewOrders = await prisma.order.findMany({ where: { notes: { contains: LEGACY_TAG_PREFIX } } });
    for (const order of allNewOrders) {
      const invoices = await prisma.invoice.findMany({ where: { orderId: order.id } });
      let orderPaid = 0;
      for (const inv of invoices) {
        const payments = await prisma.payment.findMany({ where: { invoiceId: inv.id } });
        const paid = round2(payments.reduce((sum, p) => sum + Number(p.amount), 0));
        const invAmount = Number(inv.amount);
        await prisma.invoice.update({
          where: { id: inv.id },
          data: {
            amountPaid: paid,
            outstandingBalance: computeOutstanding(invAmount, paid),
            paymentStatus: computePaymentStatus(invAmount, paid) as any,
          },
        });
        orderPaid += paid;
      }
      const totalAmount = Number(order.totalAmount);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          amountPaid: round2(orderPaid),
          outstandingBalance: computeOutstanding(totalAmount, orderPaid),
          paymentStatus: computePaymentStatus(totalAmount, orderPaid) as any,
        },
      });
    }
  }

  // ── report ──
  console.log('\n========== MIGRATION REPORT ==========\n');
  console.log('Suppliers  :', report.suppliers);
  console.log('Publishers :', report.publishers);
  console.log('Books      :', { ...report.books, unmappedFormats: [...report.books.unmappedFormats] });
  console.log('Customers  :', report.customers);
  console.log('Orders     :', { ...report.orders, unmappedStatuses: [...report.orders.unmappedStatuses] });
  console.log('Invoices   :', { ...report.invoices, unmappedTypes: [...report.invoices.unmappedTypes] });
  console.log('Payments   :', { ...report.payments, unmappedMethods: [...report.payments.unmappedMethods] });
  console.log('Expenses   :', report.expenses);
  console.log('\nTotals check (should be close — small gaps are OK, they come from rows that');
  console.log('were skipped because their order/customer wasn\'t migrated, e.g. archived Stock rows):');
  console.log(`  Legacy order amount sum   : ${report.totals.legacyOrderAmountSum.toLocaleString('id-ID')}`);
  console.log(`  Migrated order amount sum : ${report.totals.migratedOrderAmountSum.toLocaleString('id-ID')}`);
  console.log(`  Legacy payment sum        : ${report.totals.legacyPaymentSum.toLocaleString('id-ID')}`);
  console.log(`  Migrated payment sum      : ${report.totals.migratedPaymentSum.toLocaleString('id-ID')}`);
  console.log(`\nArchived (not migrated) 'Stock' orders: ${report.orders.archivedStock}`);
  console.log(DRY_RUN ? '\n(DRY RUN — nothing was written. Review this, then re-run with --commit.)\n' : '\n(COMMIT — the above was written to Neon.)\n');

  await legacy.end();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Migration script failed:', err);
  await legacy.end().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
