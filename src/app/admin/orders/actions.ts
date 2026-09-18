'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { orderSchema, orderStatusValues } from '@/lib/validations';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';
import { generateOrderNumberWithRetry } from '@/lib/order-number';
import { findMergeableOrder, isMergeableOrderType } from '@/lib/order-merge';
import { findOrCreatePurchaseBatch } from '@/lib/po-batch';
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
  dpType?: string;
  dpValue?: number;
  newBatchName?: string;
  existingBatchId?: string;
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
  | { success: false; error: string; fieldErrors?: Record<string, string> };

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

/**
 * Resolves the PurchaseBatch for a PO reguler/remainder order and returns
 * the DP terms to actually save — always the BATCH's own dpType/dpValue,
 * never whatever the order form submitted. This is what makes DP rule
 * "locked at the batch": the first order into a batch sets it (via
 * findOrCreatePurchaseBatch), and every order after that — whether it's
 * joining an existing batch picked from the dropdown or auto-merging via
 * findMergeableOrder — inherits the same terms whether the person touched
 * the DP fields or not.
 */
async function resolveBatchAndDp(
  tx: Prisma.TransactionClient,
  data: {
    orderType: string;
    poMonth: string | null | undefined;
    etaMonth: string | null | undefined;
    supplierId: string | null | undefined;
    existingBatchId?: string;
    dpType?: string;
    dpValue?: number;
  },
  newBatchName?: string
): Promise<{ batchId: string | null; dpType: string | null; dpValue: number | null }> {
  if (!isMergeableOrderType(data.orderType)) {
    return { batchId: null, dpType: null, dpValue: null };
  }

  const batch = data.existingBatchId
    ? await tx.purchaseBatch.findUnique({ where: { id: data.existingBatchId } })
    : await findOrCreatePurchaseBatch(
        tx,
        {
          orderType: data.orderType,
          poMonth: data.poMonth || null,
          etaMonth: data.etaMonth || null,
          supplierId: data.supplierId || null,
          dpType: data.dpType || null,
          dpValue: data.dpValue ?? null,
        },
        newBatchName
      );

  if (!batch) return { batchId: null, dpType: null, dpValue: null };

  return {
    batchId: batch.id,
    dpType: batch.dpType ?? null,
    dpValue: batch.dpValue !== null && batch.dpValue !== undefined ? Number(batch.dpValue.toString()) : null,
  };
}

export async function saveOrder(input: SaveOrderInput): Promise<SaveOrderResult> {
  const session = await requireStaffSession();

  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    // Keyed by path so the client can flag the exact field — e.g.
    // "poMonth" or "items.0.bookTitle" — instead of showing one generic
    // line the person has to hunt for.
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    const firstError = Object.values(fieldErrors)[0];
    return {
      success: false,
      error: firstError ?? 'Ada bagian yang belum valid — lihat tanda merah di form.',
      fieldErrors,
    };
  }
  const data = parsed.data;

  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
  if (!customer) return { success: false, error: 'Selected customer does not exist.' };

  const expectedArrivalDate = data.expectedArrivalDate ? new Date(data.expectedArrivalDate) : null;

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

        const { batchId: resolvedPoBatchId, dpType: lockedDpType, dpValue: lockedDpValue } =
          await resolveBatchAndDp(
            tx,
            {
              orderType: data.orderType,
              poMonth: data.poMonth,
              etaMonth: data.etaMonth,
              supplierId: data.supplierId,
              existingBatchId: data.existingBatchId,
              dpType: data.dpType,
              dpValue: data.dpValue,
            },
            data.newBatchName
          );

        return tx.order.update({
          where: { id: input.id },
          data: {
            customerId: data.customerId,
            orderType: data.orderType as any,
            poMonth: isMergeableOrderType(data.orderType) ? data.poMonth || null : null,
            etaMonth: data.etaMonth || null,
            eventName: data.orderType === 'EVENT_JASTIP' ? data.eventName || null : null,
            dpType: lockedDpType as any,
            dpValue: lockedDpValue,
            supplierId: data.supplierId || null,
            poBatchId: resolvedPoBatchId,
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

      const { batchId: resolvedPoBatchId, dpType: lockedDpType, dpValue: lockedDpValue } =
        await resolveBatchAndDp(
          tx,
          {
            orderType: data.orderType,
            poMonth: data.poMonth,
            etaMonth: data.etaMonth,
            supplierId: data.supplierId,
            existingBatchId: data.existingBatchId,
            dpType: data.dpType,
            dpValue: data.dpValue,
          },
          data.newBatchName
        );

      return tx.order.create({
        data: {
          orderNumber,
          customerId: data.customerId,
          orderType: data.orderType as any,
          poMonth: isMergeableOrderType(data.orderType) ? data.poMonth || null : null,
          etaMonth: data.etaMonth || null,
          eventName: data.orderType === 'EVENT_JASTIP' ? data.eventName || null : null,
          dpType: lockedDpType as any,
          dpValue: lockedDpValue,
          supplierId: data.supplierId || null,
          poBatchId: resolvedPoBatchId,
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

export type BulkAssignResult = { success: true; batchId: string; updated: number } | { success: false; error: string };

/** Assigns a set of orders to an existing PO batch, or creates a new one
 * first if newBatchName is given — used by the "select multiple orders"
 * bulk action on the Data Order page. All selected orders must share the
 * same order type (PO_REGULAR / PO_REMAINDER) as the target batch. */
export async function bulkAssignOrdersToBatch(
  orderIds: string[],
  options: { existingBatchId?: string; newBatchName?: string; orderType?: string }
): Promise<BulkAssignResult> {
  const session = await requireStaffSession();
  if (orderIds.length === 0) return { success: false, error: 'No orders selected.' };

  try {
    let batchId = options.existingBatchId;
    if (!batchId) {
      if (!options.newBatchName?.trim()) return { success: false, error: 'Nama batch baru wajib diisi.' };
      if (!options.orderType) return { success: false, error: 'Order type wajib ada buat bikin batch baru.' };
      const created = await prisma.purchaseBatch.create({
        data: { name: options.newBatchName.trim(), type: options.orderType as any },
      });
      batchId = created.id;
    }

    const result = await prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { poBatchId: batchId },
    });

    const batch = await prisma.purchaseBatch.findUnique({ where: { id: batchId } });
    await writeAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'PurchaseBatch',
      entityId: batchId,
      summary: `Bulk-assigned ${result.count} order(s) to batch "${batch?.name ?? batchId}"`,
    });

    revalidatePath('/admin/orders');
    revalidatePath(`/admin/po-batches/${batchId}`);
    return { success: true, batchId, updated: result.count };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to assign orders to batch.' };
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

  // Let the UI offer to propagate this status to the rest of the batch —
  // count only orders that don't already share this status.
  let batchSiblingCount = 0;
  if (order.poBatchId) {
    batchSiblingCount = await prisma.order.count({
      where: { poBatchId: order.poBatchId, id: { not: id }, status: { not: status as any } },
    });
  }
  return { poBatchId: order.poBatchId, batchSiblingCount };
}

/**
 * Applies the same shipping status to every other order in a PO batch —
 * called only after the admin explicitly confirms via the prompt shown
 * when updateOrderStatus finds sibling orders in a different status.
 */
export async function updateBatchOrdersStatus(poBatchId: string, status: string, excludeOrderId: string) {
  const session = await requireStaffSession();

  if (!orderStatusValues.includes(status as (typeof orderStatusValues)[number])) {
    throw new Error('Invalid status.');
  }

  const orders = await prisma.order.findMany({
    where: { poBatchId, id: { not: excludeOrderId } },
  });

  const shouldStampArrival = status === 'ARRIVED';

  for (const o of orders) {
    await prisma.order.update({
      where: { id: o.id },
      data: {
        status: status as (typeof orderStatusValues)[number],
        ...(shouldStampArrival && !o.actualArrivalDate ? { actualArrivalDate: new Date() } : {}),
      },
    });
  }

  const batch = await prisma.purchaseBatch.findUnique({ where: { id: poBatchId } });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'PurchaseBatch',
    entityId: poBatchId,
    summary: `Bulk-updated ${orders.length} order(s) in batch "${batch?.name ?? poBatchId}" to status ${status}`,
  });

  revalidatePath('/admin/orders');
  for (const o of orders) revalidatePath(`/admin/orders/${o.id}`);
  return { updated: orders.length };
}

/**
 * Deletes an order outright if nothing financial is tied to it yet. If it
 * already has payments, invoices, deposit-usage, or expenses recorded
 * against it, hard-deleting would either orphan those records or destroy
 * real financial history — so instead this cancels the order (status:
 * CANCELLED), which removes it from every active view (dashboard, packing
 * list, pre-orders) while keeping the full trail intact.
 */
export type DuplicateOrderResult =
  | { success: true; createdCount: number; orderIds: string[] }
  | { success: false; error: string };

/**
 * Duplicates an order's items and settings (order type, PO batch, DP rule,
 * dates, notes) for one or more OTHER customers — built for "30 people
 * pre-ordered the same book" so the details only get typed once. Each
 * target customer gets their own brand-new order; nothing is merged into
 * an existing order even if one would otherwise match, since the whole
 * point here is deliberately creating distinct new orders.
 */
export async function duplicateOrder(sourceOrderId: string, customerIds: string[]): Promise<DuplicateOrderResult> {
  const session = await requireStaffSession();

  if (customerIds.length === 0) return { success: false, error: 'Pilih minimal 1 customer.' };

  const source = await prisma.order.findUnique({
    where: { id: sourceOrderId },
    include: { items: true },
  });
  if (!source) return { success: false, error: 'Order asal tidak ditemukan.' };

  const totalAmount = source.items.reduce((sum, it) => sum + toNumber(it.subtotal), 0);
  const paymentStatus = computePaymentStatus(totalAmount, 0);

  try {
    const orderIds: string[] = [];

    for (const customerId of customerIds) {
      const orderNumber = await generateOrderNumberWithRetry();
      const created = await prisma.order.create({
        data: {
          orderNumber,
          customerId,
          orderType: source.orderType,
          poMonth: source.poMonth,
          etaMonth: source.etaMonth,
          eventName: source.eventName,
          dpType: source.dpType,
          dpValue: source.dpValue,
          supplierId: source.supplierId,
          poBatchId: source.poBatchId,
          orderDate: new Date(),
          expectedArrivalDate: source.expectedArrivalDate,
          status: source.status,
          paymentStatus,
          totalAmount,
          amountPaid: 0,
          outstandingBalance: totalAmount,
          notes: source.notes,
          items: {
            create: source.items.map((it) => ({
              bookId: it.bookId,
              bookTitle: it.bookTitle,
              isbn: it.isbn,
              format: it.format,
              quantity: it.quantity,
              sellingPrice: it.sellingPrice,
              discount: it.discount,
              subtotal: it.subtotal,
            })),
          },
        },
      });
      orderIds.push(created.id);
    }

    await writeAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Order',
      summary: `Duplicated order ${source.orderNumber} into ${orderIds.length} new order(s)`,
    });

    revalidatePath('/admin/orders');
    if (source.poBatchId) revalidatePath(`/admin/po-batches/${source.poBatchId}`);

    return { success: true, createdCount: orderIds.length, orderIds };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Gagal duplicate order. Coba lagi.' };
  }
}

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
