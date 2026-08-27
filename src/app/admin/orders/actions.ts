'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { orderSchema, orderStatusValues } from '@/lib/validations';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';
import { generateOrderNumberWithRetry } from '@/lib/order-number';
import { findMergeableOrder, isMergeableOrderType } from '@/lib/order-merge';
import {
  computeOrderTotals,
  computePaymentStatus,
  computeOutstandingBalance,
  computeItemSubtotal,
  toNumber,
} from '@/lib/calculations';
import type { Prisma } from '@prisma/client';

export type SaveOrderInput = {
  id?: string;
  customerId: string;
  orderType: string;
  poMonth?: string;
  etaMonth?: string;
  eventName?: string;
  supplierId?: string | null;
  poBatchId?: string | null;
  orderDate: string;
  expectedArrivalDate?: string;
  actualArrivalDate?: string;
  status: string;
  notes?: string;
  items: {
    bookId?: string | null;
    bookTitle: string;
    isbn?: string | null;
    format?: string | null;
    quantity: number;
    sellingPrice: number;
    cogs: number;
    discount: number;
  }[];
};

export type SaveOrderResult =
  | { success: true; orderId: string; orderNumber: string; merged: boolean }
  | { success: false; error: string };

/**
 * Resolves the Book to link an order item to. If the item already points at
 * a catalog book, use that. Otherwise this is a "custom" item typed
 * directly into the order — try to match it to an existing book (by ISBN
 * first, then exact title), and if nothing matches, create a new catalog
 * entry automatically so it's available to pick from next time.
 */
async function resolveOrCreateBookId(
  tx: Prisma.TransactionClient,
  item: SaveOrderInput['items'][number]
): Promise<string | null> {
  if (item.bookId) return item.bookId;
  if (!item.bookTitle?.trim()) return null;

  if (item.isbn) {
    const byIsbn = await tx.book.findUnique({ where: { isbn: item.isbn } });
    if (byIsbn) return byIsbn.id;
  }

  const byTitle = await tx.book.findFirst({
    where: { title: { equals: item.bookTitle.trim(), mode: 'insensitive' } },
  });
  if (byTitle) return byTitle.id;

  const created = await tx.book.create({
    data: {
      title: item.bookTitle.trim(),
      isbn: item.isbn || null,
      format: (item.format as any) || null,
    },
  });
  return created.id;
}

export async function saveOrder(input: SaveOrderInput): Promise<SaveOrderResult> {
  const session = await requireStaffSession();

  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? 'Please check the form for errors.' };
  }
  const data = parsed.data;

  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
  if (!customer) return { success: false, error: 'Selected customer does not exist.' };

  // If a PO batch is selected, its expected arrival date is the source of
  // truth for every order in it — override whatever the form submitted.
  let expectedArrivalDate = data.expectedArrivalDate ? new Date(data.expectedArrivalDate) : null;
  if (data.poBatchId) {
    const batch = await prisma.purchaseBatch.findUnique({ where: { id: data.poBatchId } });
    if (batch?.expectedArrivalDate) expectedArrivalDate = batch.expectedArrivalDate;
  }

  const totals = computeOrderTotals(data.items);

  try {
    if (input.id) {
      // ── Update existing order ──
      const before = await prisma.order.findUnique({ where: { id: input.id } });
      if (!before) return { success: false, error: 'Order not found.' };

      // amountPaid is a running total maintained incrementally by payment and
      // deposit actions (see payments/actions.ts) — editing line items must
      // never re-derive it from raw payment sums, since that would ignore
      // deposit-funded portions and double-count overpay-to-deposit
      // conversions. Only the totals that depend on items change here.
      const amountPaid = toNumber(before.amountPaid);
      const paymentStatus = computePaymentStatus(totals.totalAmount, amountPaid);
      const outstandingBalance = computeOutstandingBalance(totals.totalAmount, amountPaid);

      const order = await prisma.$transaction(async (tx) => {
        await tx.orderItem.deleteMany({ where: { orderId: input.id } });

        const itemsWithBookIds = await Promise.all(
          data.items.map(async (item) => ({
            ...item,
            resolvedBookId: await resolveOrCreateBookId(tx, item),
          }))
        );

        return tx.order.update({
          where: { id: input.id },
          data: {
            customerId: data.customerId,
            orderType: data.orderType as any,
            poMonth: isMergeableOrderType(data.orderType) ? data.poMonth || null : null,
            etaMonth: data.etaMonth || null,
            eventName: data.orderType === 'EVENT_JASTIP' ? data.eventName || null : null,
            supplierId: data.supplierId || null,
            poBatchId: data.poBatchId || null,
            orderDate: new Date(data.orderDate),
            expectedArrivalDate,
            actualArrivalDate: data.actualArrivalDate ? new Date(data.actualArrivalDate) : null,
            status: data.status,
            notes: data.notes || null,
            subtotal: totals.subtotal,
            discountTotal: totals.discountTotal,
            totalAmount: totals.totalAmount,
            totalCogs: totals.totalCogs,
            profit: totals.profit,
            amountPaid,
            outstandingBalance,
            paymentStatus,
            items: {
              create: itemsWithBookIds.map((item) => ({
                bookId: item.resolvedBookId,
                bookTitle: item.bookTitle,
                isbn: item.isbn || null,
                format: (item.format as any) || null,
                quantity: item.quantity,
                sellingPrice: item.sellingPrice,
                cogs: item.cogs,
                discount: item.discount,
                subtotal: computeItemSubtotal(item),
              })),
            },
          },
        });
      });

      await writeAuditLog({
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Order',
        entityId: order.id,
        summary: `Updated order ${order.orderNumber}`,
        changes: { before, after: order },
      });

      revalidatePath('/admin/orders');
      revalidatePath(`/admin/orders/${order.id}`);
      revalidatePath('/admin/books');
      return { success: true, orderId: order.id, orderNumber: order.orderNumber, merged: false };
    }

    // ── Create new order (or merge into an existing open one) ──
    const mergeTarget = await prisma.$transaction((tx) =>
      findMergeableOrder(tx, {
        customerId: data.customerId,
        orderType: data.orderType,
        poMonth: data.poMonth || null,
        supplierId: data.supplierId || null,
      })
    );

    if (mergeTarget) {
      const order = await prisma.$transaction(async (tx) => {
        const itemsWithBookIds = await Promise.all(
          data.items.map(async (item) => ({
            ...item,
            resolvedBookId: await resolveOrCreateBookId(tx, item),
          }))
        );

        await tx.orderItem.createMany({
          data: itemsWithBookIds.map((item) => ({
            orderId: mergeTarget.id,
            bookId: item.resolvedBookId,
            bookTitle: item.bookTitle,
            isbn: item.isbn || null,
            format: (item.format as any) || null,
            quantity: item.quantity,
            sellingPrice: item.sellingPrice,
            cogs: item.cogs,
            discount: item.discount,
            subtotal: computeItemSubtotal(item),
          })),
        });

        // Recompute totals from the order's FULL item set (existing + just
        // added) — never from just the new items, or the order total would
        // silently drop everything submitted before this merge.
        const allItems = await tx.orderItem.findMany({ where: { orderId: mergeTarget.id } });
        const newTotals = computeOrderTotals(
          allItems.map((it) => ({
            sellingPrice: toNumber(it.sellingPrice),
            quantity: it.quantity,
            discount: toNumber(it.discount),
            cogs: toNumber(it.cogs),
          }))
        );
        const amountPaid = toNumber(mergeTarget.amountPaid);

        return tx.order.update({
          where: { id: mergeTarget.id },
          data: {
            subtotal: newTotals.subtotal,
            discountTotal: newTotals.discountTotal,
            totalAmount: newTotals.totalAmount,
            totalCogs: newTotals.totalCogs,
            profit: newTotals.profit,
            paymentStatus: computePaymentStatus(newTotals.totalAmount, amountPaid),
            outstandingBalance: computeOutstandingBalance(newTotals.totalAmount, amountPaid),
          },
        });
      });

      await writeAuditLog({
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Order',
        entityId: order.id,
        summary: `Merged ${data.items.length} new item(s) into existing order ${order.orderNumber} for ${customer.name} (same customer + PO month + order type + supplier)`,
      });

      revalidatePath('/admin/orders');
      revalidatePath(`/admin/orders/${order.id}`);
      revalidatePath('/admin/books');
      return { success: true, orderId: order.id, orderNumber: order.orderNumber, merged: true };
    }

    const orderNumber = await generateOrderNumberWithRetry();
    const paymentStatus = computePaymentStatus(totals.totalAmount, 0);

    const order = await prisma.$transaction(async (tx) => {
      const itemsWithBookIds = await Promise.all(
        data.items.map(async (item) => ({
          ...item,
          resolvedBookId: await resolveOrCreateBookId(tx, item),
        }))
      );

      return tx.order.create({
        data: {
          orderNumber,
          customerId: data.customerId,
          orderType: data.orderType as any,
          poMonth: isMergeableOrderType(data.orderType) ? data.poMonth || null : null,
          etaMonth: data.etaMonth || null,
          eventName: data.orderType === 'EVENT_JASTIP' ? data.eventName || null : null,
          supplierId: data.supplierId || null,
          poBatchId: data.poBatchId || null,
          orderDate: new Date(data.orderDate),
          expectedArrivalDate,
          actualArrivalDate: data.actualArrivalDate ? new Date(data.actualArrivalDate) : null,
          status: data.status,
          notes: data.notes || null,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          totalAmount: totals.totalAmount,
          totalCogs: totals.totalCogs,
          profit: totals.profit,
          amountPaid: 0,
          outstandingBalance: totals.totalAmount,
          paymentStatus,
          createdById: session.user.id,
          items: {
            create: itemsWithBookIds.map((item) => ({
              bookId: item.resolvedBookId,
              bookTitle: item.bookTitle,
              isbn: item.isbn || null,
              format: (item.format as any) || null,
              quantity: item.quantity,
              sellingPrice: item.sellingPrice,
              cogs: item.cogs,
              discount: item.discount,
              subtotal: computeItemSubtotal(item),
            })),
          },
        },
      });
    });

    await writeAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Order',
      entityId: order.id,
      summary: `Created order ${order.orderNumber} for ${customer.name}`,
    });

    revalidatePath('/admin/orders');
    revalidatePath('/admin/books');
    return { success: true, orderId: order.id, orderNumber: order.orderNumber, merged: false };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Something went wrong while saving the order.' };
  }
}

export async function updateOrderStatus(id: string, status: string) {
  const session = await requireStaffSession();

  if (!orderStatusValues.includes(status as (typeof orderStatusValues)[number])) {
    throw new Error('Invalid status.');
  }

  const before = await prisma.order.findUnique({ where: { id } });
  if (!before) throw new Error('Order not found.');

  const shouldStampArrival = status === 'ARRIVED' && !before.actualArrivalDate;

  const order = await prisma.order.update({
    where: { id },
    data: {
      status: status as (typeof orderStatusValues)[number],
      ...(shouldStampArrival ? { actualArrivalDate: new Date() } : {}),
    },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'Order',
    entityId: id,
    summary: `Changed order ${order.orderNumber} status: ${before.status} → ${status}`,
  });

  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${id}`);
}

/**
 * Deletes an order outright if nothing financial is tied to it yet. If it
 * already has payments, invoices, deposit-usage, or expenses recorded
 * against it, hard-deleting would either orphan those records or destroy
 * real financial history — so instead this cancels the order (status:
 * CANCELLED), which removes it from every active view (dashboard, packing
 * list, pre-orders) while keeping the full trail intact.
 */
export async function deleteOrder(id: string) {
  const session = await requireStaffSession();

  const [paymentCount, invoiceCount, depositTxnCount, expenseCount] = await Promise.all([
    prisma.payment.count({ where: { orderId: id } }),
    prisma.invoice.count({ where: { orderId: id } }),
    prisma.depositTransaction.count({ where: { orderId: id } }),
    prisma.expense.count({ where: { orderId: id } }),
  ]);
  const hasFinancialTrail = paymentCount + invoiceCount + depositTxnCount + expenseCount > 0;

  if (hasFinancialTrail) {
    const order = await prisma.order.update({ where: { id }, data: { status: 'CANCELLED' } });

    await writeAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'Order',
      entityId: id,
      summary: `Cancelled order ${order.orderNumber} instead of deleting (has payments/invoices on record)`,
    });

    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${id}`);
    return;
  }

  const order = await prisma.order.delete({ where: { id } });

  await writeAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    entityType: 'Order',
    entityId: id,
    summary: `Deleted order ${order.orderNumber}`,
  });

  revalidatePath('/admin/orders');
}
