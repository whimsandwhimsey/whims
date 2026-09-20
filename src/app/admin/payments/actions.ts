'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';
import { getCustomerDepositBalance, recalculateDepositLedger } from '@/lib/deposit';
import { toNumber, round2 } from '@/lib/calculations';
import { recalculateInvoiceFinancials } from '@/lib/invoice-calculations';
import { recalculateShipmentFinancials } from '@/lib/shipment-calculations';

export type ActionResult = { success: true } | { success: false; error: string };

const paymentFormSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  method: z.enum(['QRIS', 'BANK_TRANSFER']),
  date: z.string().min(1),
  notes: z.string().optional(),
});

/**
 * Records a payment against a specific invoice — never directly against an
 * order, since an order can have several invoices (DP, final payment, plus
 * any invoice for items merged in later) and money needs to go to the right
 * one. Only the amount needed to cover that invoice's outstanding balance
 * is applied to it; any excess automatically becomes a customer deposit.
 * The actual math is delegated to recalculateInvoiceFinancials so creating,
 * editing, and deleting a payment all go through the exact same logic.
 */
const combinedPaymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  method: z.enum(['QRIS', 'BANK_TRANSFER']),
  date: z.string().min(1),
  notes: z.string().max(500).optional().or(z.literal('')),
});

/**
 * Records ONE payment against a combined bill (invoice + its linked
 * shipment ongkir) — the customer sees and pays one number, but under the
 * hood this splits into up to two Payment records so book and ongkir
 * accounting stay separate: book's own outstanding is paid down first,
 * anything left over after that goes to ongkir. Any amount beyond BOTH
 * outstandings flows back through the invoice's own Payment (its existing
 * overflow-to-deposit logic picks it up from there) rather than teaching
 * the shipment side a second copy of that behavior.
 */
export async function recordCombinedPayment(invoiceId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = combinedPaymentSchema.safeParse({
    amount: formData.get('amount'),
    method: formData.get('method'),
    date: formData.get('date'),
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? 'Please check the form.' };
  }
  const data = parsed.data;

  try {
    const { invoice } = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { order: true, linkedShipment: true },
      });
      if (!invoice) throw new Error('Invoice not found.');
      if (!invoice.linkedShipment) throw new Error('This invoice has no ongkir bundled with it.');

      const outstandingInvoice = toNumber(invoice.outstandingBalance);
      const outstandingShipment = toNumber(invoice.linkedShipment.outstandingBalance);

      // Book first, then ongkir, then whatever's left overflows through
      // the invoice payment (which already knows how to turn excess into
      // deposit) — see the function doc above.
      const appliedToShipment = Math.min(Math.max(0, data.amount - outstandingInvoice), outstandingShipment);
      const invoicePaymentAmount = round2(data.amount - appliedToShipment);

      await tx.payment.create({
        data: {
          customerId: invoice.order.customerId,
          orderId: invoice.orderId,
          invoiceId,
          date: new Date(data.date),
          amount: invoicePaymentAmount,
          method: data.method,
          notes: data.notes || null,
          recordedById: session.user.id,
        },
      });
      await recalculateInvoiceFinancials(invoiceId, tx);

      if (appliedToShipment > 0) {
        await tx.payment.create({
          data: {
            customerId: invoice.order.customerId,
            shipmentId: invoice.linkedShipment.id,
            date: new Date(data.date),
            amount: appliedToShipment,
            method: data.method,
            notes: `Ongkir portion of combined payment on invoice ${invoice.invoiceNumber}`,
            recordedById: session.user.id,
          },
        });
        await recalculateShipmentFinancials(invoice.linkedShipment.id, tx);
      }

      return { invoice };
    });

    await writeAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Payment',
      entityId: invoiceId,
      summary: `Recorded combined payment of ${data.amount} for invoice ${invoice.invoiceNumber} (book + ongkir)`,
    });

    revalidatePath(`/admin/orders/${invoice.orderId}`);
    revalidatePath(`/admin/invoices/${invoiceId}`);
    revalidatePath('/admin/orders');
    revalidatePath('/admin/invoices');
    revalidatePath('/admin/payments');
    revalidatePath('/admin/shipments');
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to record payment.' };
  }
}

export async function recordPayment(invoiceId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = paymentFormSchema.safeParse({
    amount: formData.get('amount'),
    method: formData.get('method'),
    date: formData.get('date'),
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? 'Please check the form.' };
  }
  const data = parsed.data;

  try {
    const { payment, invoice } = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { order: true } });
      if (!invoice) throw new Error('Invoice not found.');

      const payment = await tx.payment.create({
        data: {
          customerId: invoice.order.customerId,
          orderId: invoice.orderId,
          invoiceId,
          date: new Date(data.date),
          amount: data.amount,
          method: data.method,
          notes: data.notes || null,
          recordedById: session.user.id,
        },
      });

      // Same transaction as the Payment above — if this fails, the payment
      // itself rolls back too, instead of a payment existing that the
      // invoice's own paid/outstanding never picked up.
      await recalculateInvoiceFinancials(invoiceId, tx);

      return { payment, invoice };
    });

    await writeAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Payment',
      entityId: payment.id,
      summary: `Recorded ${data.method} payment of ${data.amount} for invoice ${invoice.invoiceNumber}`,
    });

    revalidatePath(`/admin/orders/${invoice.orderId}`);
    revalidatePath(`/admin/invoices/${invoiceId}`);
    revalidatePath('/admin/orders');
    revalidatePath('/admin/invoices');
    revalidatePath('/admin/payments');
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to record payment.' };
  }
}

/** Records a payment that isn't tied to any invoice — the whole amount becomes a deposit. */
export async function recordDepositTopUp(customerId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = paymentFormSchema.safeParse({
    amount: formData.get('amount'),
    method: formData.get('method'),
    date: formData.get('date'),
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? 'Please check the form.' };
  }
  const data = parsed.data;

  try {
    const payment = await prisma.payment.create({
      data: {
        customerId,
        orderId: null,
        invoiceId: null,
        date: new Date(data.date),
        amount: data.amount,
        method: data.method,
        notes: data.notes || null,
        recordedById: session.user.id,
      },
    });

    const currentBalance = await getCustomerDepositBalance(customerId);
    const newBalance = currentBalance + data.amount;
    await prisma.depositTransaction.create({
      data: {
        customerId,
        type: 'TOP_UP',
        amount: data.amount,
        balanceAfter: newBalance,
        notes: `Deposit top-up (payment:${payment.id})`,
        createdById: session.user.id,
      },
    });

    await writeAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Payment',
      entityId: payment.id,
      summary: `Recorded deposit top-up of ${data.amount}`,
    });

    revalidatePath(`/admin/customers/${customerId}`);
    revalidatePath('/admin/payments');
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to record deposit top-up.' };
  }
}

const editPaymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  method: z.enum(['QRIS', 'BANK_TRANSFER']),
  date: z.string().min(1),
  notes: z.string().optional(),
});

/**
 * Edits a previously recorded payment. Works for both invoice-linked
 * payments and standalone deposit top-ups — in both cases the linked
 * deposit transaction (if any) and all downstream balances are
 * recalculated from scratch afterwards.
 */
export async function editPayment(paymentId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = editPaymentSchema.safeParse({
    amount: formData.get('amount'),
    method: formData.get('method'),
    date: formData.get('date'),
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? 'Please check the form.' };
  }
  const data = parsed.data;

  try {
    const before = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!before) return { success: false, error: 'Payment not found.' };

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          amount: data.amount,
          method: data.method,
          date: new Date(data.date),
          notes: data.notes || null,
        },
      });

      if (before.invoiceId) {
        await recalculateInvoiceFinancials(before.invoiceId, tx);
      } else {
        const topUp = await tx.depositTransaction.findFirst({
          where: { customerId: before.customerId, type: 'TOP_UP', notes: { contains: `payment:${before.id}` } },
        });
        if (topUp) {
          await tx.depositTransaction.update({
            where: { id: topUp.id },
            data: { amount: data.amount },
          });
          await recalculateDepositLedger(before.customerId, tx);
        }
      }
    });

    await writeAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'Payment',
      entityId: paymentId,
      summary: `Edited payment ${paymentId}`,
      changes: { before, after: data },
    });

    revalidatePath('/admin/payments');
    if (before.invoiceId) revalidatePath(`/admin/invoices/${before.invoiceId}`);
    if (before.orderId) revalidatePath(`/admin/orders/${before.orderId}`);
    revalidatePath(`/admin/customers/${before.customerId}`);
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to update payment.' };
  }
}

export async function deletePayment(paymentId: string): Promise<ActionResult> {
  const session = await requireStaffSession();

  try {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return { success: false, error: 'Payment not found.' };

    await prisma.$transaction(async (tx) => {
      const linkedTopUp = await tx.depositTransaction.findFirst({
        where: { customerId: payment.customerId, type: 'TOP_UP', notes: { contains: `payment:${payment.id}` } },
      });

      await tx.payment.delete({ where: { id: paymentId } });

      if (payment.invoiceId) {
        await recalculateInvoiceFinancials(payment.invoiceId, tx);
      } else if (linkedTopUp) {
        await tx.depositTransaction.delete({ where: { id: linkedTopUp.id } });
        await recalculateDepositLedger(payment.customerId, tx);
      }
    });

    await writeAuditLog({
      userId: session.user.id,
      action: 'DELETE',
      entityType: 'Payment',
      entityId: paymentId,
      summary: `Deleted payment of ${payment.amount}`,
    });

    revalidatePath('/admin/payments');
    if (payment.invoiceId) revalidatePath(`/admin/invoices/${payment.invoiceId}`);
    if (payment.orderId) revalidatePath(`/admin/orders/${payment.orderId}`);
    revalidatePath(`/admin/customers/${payment.customerId}`);
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to delete payment.' };
  }
}

const applyDepositSchema = z.object({ amount: z.coerce.number().positive('Amount must be greater than zero') });

/** Applies part (or all) of a customer's deposit balance to a specific invoice. */
export async function applyDepositToInvoice(invoiceId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = applyDepositSchema.safeParse({ amount: formData.get('amount') });
  if (!parsed.success) return { success: false, error: 'Invalid amount.' };
  const { amount } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { order: true, linkedShipment: true },
      });
      if (!invoice) throw new Error('Invoice not found.');

      const depositBalance = await getCustomerDepositBalance(invoice.order.customerId);
      const outstandingInvoice = toNumber(invoice.outstandingBalance);
      const outstandingShipment = invoice.linkedShipment ? toNumber(invoice.linkedShipment.outstandingBalance) : 0;
      const combinedOutstanding = outstandingInvoice + outstandingShipment;

      if (amount > depositBalance) throw new Error("Amount exceeds the customer's deposit balance.");
      if (amount > combinedOutstanding) throw new Error("Amount exceeds this invoice's outstanding balance.");

      // Book first, then ongkir — same split rule as a combined cash payment.
      const appliedToShipment = invoice.linkedShipment
        ? Math.min(Math.max(0, amount - outstandingInvoice), outstandingShipment)
        : 0;
      const appliedToInvoice = round2(amount - appliedToShipment);

      let newBalance = depositBalance;
      if (appliedToInvoice > 0) {
        newBalance -= appliedToInvoice;
        await tx.depositTransaction.create({
          data: {
            customerId: invoice.order.customerId,
            type: 'USED',
            amount: appliedToInvoice,
            balanceAfter: newBalance,
            orderId: invoice.orderId,
            invoiceId,
            notes: `Applied to invoice ${invoice.invoiceNumber}`,
            createdById: session.user.id,
          },
        });
      }
      // Same transaction as the deposit debit(s) above — if this fails,
      // they roll back too, instead of leaving the customer's deposit
      // reduced while the invoice still shows the old, un-applied balance.
      await recalculateInvoiceFinancials(invoiceId, tx);

      if (appliedToShipment > 0 && invoice.linkedShipment) {
        newBalance -= appliedToShipment;
        await tx.depositTransaction.create({
          data: {
            customerId: invoice.order.customerId,
            type: 'USED',
            amount: appliedToShipment,
            balanceAfter: newBalance,
            orderId: invoice.orderId,
            shipmentId: invoice.linkedShipment.id,
            notes: `Applied to ongkir on invoice ${invoice.invoiceNumber} (resi ${invoice.linkedShipment.trackingNumber ?? 'belum ada'})`,
            createdById: session.user.id,
          },
        });
        await recalculateShipmentFinancials(invoice.linkedShipment.id, tx);
      }

      await writeAuditLog({
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Invoice',
        entityId: invoiceId,
        summary: `Applied ${amount} deposit to invoice ${invoice.invoiceNumber}${appliedToShipment > 0 ? ' (incl. ongkir)' : ''}`,
      });
    });

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    revalidatePath(`/admin/invoices/${invoiceId}`);
    if (invoice) revalidatePath(`/admin/orders/${invoice.orderId}`);
    revalidatePath('/admin/orders');
    revalidatePath('/admin/payments');
    revalidatePath('/admin/shipments');
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to apply deposit.' };
  }
}

const refundSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  notes: z.string().optional(),
});

export async function refundDeposit(customerId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = refundSchema.safeParse({
    amount: formData.get('amount'),
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return { success: false, error: 'Invalid amount.' };
  const { amount, notes } = parsed.data;

  try {
    const currentBalance = await getCustomerDepositBalance(customerId);
    if (amount > currentBalance) {
      return { success: false, error: 'Amount exceeds the current deposit balance.' };
    }

    const newBalance = currentBalance - amount;
    await prisma.depositTransaction.create({
      data: {
        customerId,
        type: 'REFUND',
        amount,
        balanceAfter: newBalance,
        notes: notes || 'Deposit refunded to customer',
        createdById: session.user.id,
      },
    });

    await writeAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'Customer',
      entityId: customerId,
      summary: `Refunded ${amount} deposit`,
    });

    revalidatePath(`/admin/customers/${customerId}`);
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to record refund.' };
  }
}
