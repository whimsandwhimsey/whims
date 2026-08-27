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

export async function deleteInvoice(id: string) {
  const session = await requireStaffSession();
  const invoice = await prisma.invoice.delete({ where: { id } });

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
