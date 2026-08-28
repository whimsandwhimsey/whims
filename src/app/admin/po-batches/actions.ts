'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';
import { generateInvoiceNumber } from '@/lib/invoice-number';
import { toNumber } from '@/lib/calculations';
import { computeDpAmount } from '@/lib/invoice-calculations';

const batchSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  type: z.enum(['PO_REGULAR', 'PO_REMAINDER', 'READY_STOCK', 'EVENT_JASTIP']),
  batchDate: z.string().min(1),
  expectedArrivalDate: z.string().optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type FormState = { errors?: Record<string, string[]> } | null;

function parseBatchForm(formData: FormData) {
  return batchSchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type'),
    batchDate: formData.get('batchDate'),
    expectedArrivalDate: formData.get('expectedArrivalDate') ?? '',
    notes: formData.get('notes') ?? '',
  });
}

export async function createPoBatch(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireStaffSession();
  const parsed = parseBatchForm(formData);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const batch = await prisma.purchaseBatch.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      batchDate: new Date(parsed.data.batchDate),
      expectedArrivalDate: parsed.data.expectedArrivalDate ? new Date(parsed.data.expectedArrivalDate) : null,
      notes: parsed.data.notes || null,
    },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    entityType: 'PurchaseBatch',
    entityId: batch.id,
    summary: `Created PO batch "${batch.name}"`,
  });

  revalidatePath('/admin/po-batches');
  redirect(`/admin/po-batches/${batch.id}`);
}

export async function updatePoBatch(id: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireStaffSession();
  const parsed = parseBatchForm(formData);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const before = await prisma.purchaseBatch.findUnique({ where: { id } });
  const batch = await prisma.purchaseBatch.update({
    where: { id },
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      batchDate: new Date(parsed.data.batchDate),
      expectedArrivalDate: parsed.data.expectedArrivalDate ? new Date(parsed.data.expectedArrivalDate) : null,
      notes: parsed.data.notes || null,
    },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'PurchaseBatch',
    entityId: id,
    summary: `Updated PO batch "${batch.name}"`,
    changes: { before, after: batch },
  });

  // Every order in this batch shows the batch's arrival estimate — keep
  // them all in sync rather than making staff re-edit each order.
  if (batch.expectedArrivalDate) {
    await prisma.order.updateMany({
      where: { poBatchId: id },
      data: { expectedArrivalDate: batch.expectedArrivalDate },
    });
    revalidatePath('/admin/orders');
  }

  revalidatePath('/admin/po-batches');
  revalidatePath(`/admin/po-batches/${id}`);
  redirect(`/admin/po-batches/${id}`);
}

export async function togglePoBatchOpen(id: string, isOpen: boolean) {
  const session = await requireStaffSession();
  const batch = await prisma.purchaseBatch.update({ where: { id }, data: { isOpen } });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'PurchaseBatch',
    entityId: id,
    summary: `${isOpen ? 'Reopened' : 'Closed'} PO batch "${batch.name}"`,
  });

  revalidatePath('/admin/po-batches');
  revalidatePath(`/admin/po-batches/${id}`);
}

export async function deletePoBatch(id: string) {
  const session = await requireStaffSession();

  const orderCount = await prisma.order.count({ where: { poBatchId: id } });
  if (orderCount > 0) {
    throw new Error('This PO batch has orders linked to it and cannot be deleted.');
  }

  const batch = await prisma.purchaseBatch.delete({ where: { id } });

  await writeAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    entityType: 'PurchaseBatch',
    entityId: id,
    summary: `Deleted PO batch "${batch.name}"`,
  });

  revalidatePath('/admin/po-batches');
}

export type GenerateInvoicesResult = { created: number; skipped: number; errors: string[] };

/**
 * Generates one invoice per order in a PO batch:
 *   - READY_STOCK / EVENT_JASTIP batches: full-amount invoice for each order.
 *   - PO_REGULAR / PO_REMAINDER batches: DEPOSIT invoice per order, amount
 *     computed from that order's own dpType/dpValue rule (set when the
 *     order was created — see order-form.tsx).
 * Orders that already have an invoice of the applicable type are skipped.
 */
export async function generateInvoicesForBatch(batchId: string): Promise<GenerateInvoicesResult> {
  const session = await requireStaffSession();

  const batch = await prisma.purchaseBatch.findUnique({ where: { id: batchId } });
  if (!batch) return { created: 0, skipped: 0, errors: ['Batch not found.'] };

  const orders = await prisma.order.findMany({
    where: { poBatchId: batchId },
    include: { items: true, invoices: true },
  });

  const isPoType = batch.type === 'PO_REGULAR' || batch.type === 'PO_REMAINDER';
  const invoiceType = isPoType ? 'DEPOSIT' : 'READY_STOCK';

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const order of orders) {
    const alreadyHas = order.invoices.some((inv) => inv.type === invoiceType);
    if (alreadyHas) {
      skipped++;
      errors.push(`${order.orderNumber}: already has a ${invoiceType} invoice, skipped.`);
      continue;
    }

    const totalAmount = toNumber(order.totalAmount);
    const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

    const amount = isPoType
      ? computeDpAmount(
          { dpType: order.dpType as any, dpValue: order.dpValue ? toNumber(order.dpValue) : null },
          totalAmount,
          totalQuantity
        )
      : totalAmount;

    if (amount <= 0) {
      skipped++;
      errors.push(`${order.orderNumber}: computed amount is zero, skipped.`);
      continue;
    }

    const invoiceNumber = await generateInvoiceNumber();
    await prisma.invoice.create({
      data: {
        invoiceNumber,
        orderId: order.id,
        type: invoiceType,
        amount,
        amountPaid: 0,
        outstandingBalance: amount,
        paymentStatus: 'UNPAID',
        issuedById: session.user.id,
      },
    });
    created++;
  }

  await writeAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    entityType: 'Invoice',
    summary: `Bulk-generated invoices for PO batch "${batch.name}": ${created} created, ${skipped} skipped`,
  });

  revalidatePath(`/admin/po-batches/${batchId}`);
  revalidatePath('/admin/invoices');
  return { created, skipped, errors };
}
