'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';
import { generateInvoiceNumber } from '@/lib/invoice-number';

const createInvoiceSchema = z.object({
  orderId: z.string().min(1),
  type: z.enum(['DEPOSIT', 'FINAL_PAYMENT', 'READY_STOCK']),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
});

export type ActionResult =
  | { success: true; invoiceId: string }
  | { success: false; error: string };

export async function createInvoice(input: z.infer<typeof createInvoiceSchema>): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = createInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? 'Please check the form.' };
  }
  const data = parsed.data;

  try {
    const order = await prisma.order.findUnique({ where: { id: data.orderId } });
    if (!order) return { success: false, error: 'Order not found.' };

    const invoiceNumber = await generateInvoiceNumber();

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        orderId: data.orderId,
        type: data.type,
        amount: data.amount,
        amountPaid: 0,
        outstandingBalance: data.amount,
        paymentStatus: 'UNPAID',
        issuedById: session.user.id,
      },
    });

    await writeAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Invoice',
      entityId: invoice.id,
      summary: `Issued ${data.type} invoice ${invoiceNumber} for order ${order.orderNumber}`,
    });

    revalidatePath(`/admin/orders/${data.orderId}`);
    revalidatePath('/admin/invoices');
    return { success: true, invoiceId: invoice.id };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to create invoice.' };
  }
}

const editAmountSchema = z.object({ amount: z.coerce.number().positive('Amount must be greater than zero') });

/**
 * Edits an invoice's face amount — only while it has zero amountPaid.
 * Once any real money (or deposit) has been applied to it, the invoice is
 * a historical record and must stay locked, same principle as the
 * customer-facing document never showing live payment status.
 */
export async function editInvoiceAmount(id: string, formData: FormData): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireStaffSession();
  const parsed = editAmountSchema.safeParse({ amount: formData.get('amount') });
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten().fieldErrors.amount?.[0] ?? 'Invalid amount.' };
  }

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return { success: false, error: 'Invoice not found.' };

  if (Number(invoice.amountPaid.toString()) > 0) {
    return {
      success: false,
      error: 'Invoice ini udah ada pembayaran yang nempel — jumlahnya gak bisa diubah lagi.',
    };
  }

  const oldAmount = invoice.amount.toString();
  await prisma.invoice.update({
    where: { id },
    data: { amount: parsed.data.amount, outstandingBalance: parsed.data.amount },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'Invoice',
    entityId: id,
    summary: `Edited invoice ${invoice.invoiceNumber} amount: ${oldAmount} → ${parsed.data.amount}`,
  });

  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath(`/admin/orders/${invoice.orderId}`);
  return { success: true };
}

export async function deleteInvoice(id: string): Promise<void> {
  const session = await requireStaffSession();

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { payments: true, paymentRequests: true },
  });
  if (!invoice) throw new Error('Invoice not found.');

  if (invoice.payments.length > 0) {
    throw new Error(
      `Invoice ini punya ${invoice.payments.length} payment asli yang nempel — hapus/pindahin payment-nya dulu sebelum invoice ini bisa dihapus.`
    );
  }

  // Any customer self-service payment claims tied to this invoice (pending
  // or rejected — never a confirmed one, since that would've created a
  // real Payment and been caught above) are moot once the invoice itself
  // is gone, so they're cleared automatically rather than silently
  // blocking deletion with an unhelpful foreign-key error.
  if (invoice.paymentRequests.length > 0) {
    await prisma.invoicePaymentRequest.deleteMany({ where: { invoiceId: id } });
  }

  await prisma.invoice.delete({ where: { id } });

  await writeAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    entityType: 'Invoice',
    entityId: id,
    summary: `Deleted invoice ${invoice.invoiceNumber}`,
  });

  revalidatePath(`/admin/orders/${invoice.orderId}`);
  revalidatePath('/admin/invoices');
}

/** Set automatically when "Send via WhatsApp" is used; also toggleable by
 * hand — so it's always obvious which invoices still need to go out. */
export async function markInvoiceSent(id: string, sent: boolean) {
  const session = await requireStaffSession();
  const invoice = await prisma.invoice.update({
    where: { id },
    data: { sentAt: sent ? new Date() : null },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'Invoice',
    entityId: id,
    summary: `Marked invoice ${invoice.invoiceNumber} as ${sent ? 'sent' : 'not sent'}`,
  });

  revalidatePath(`/admin/orders/${invoice.orderId}`);
  revalidatePath('/admin/invoices');
  revalidatePath(`/admin/invoices/${id}`);
}
