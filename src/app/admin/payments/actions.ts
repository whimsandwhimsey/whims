'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';
import { getCustomerDepositBalance, recalculateDepositLedger } from '@/lib/deposit';
import { toNumber } from '@/lib/calculations';
import { recalculateInvoiceFinancials } from '@/lib/invoice-calculations';

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
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { order: true } });
    if (!invoice) return { success: false, error: 'Invoice not found.' };

    const payment = await prisma.payment.create({
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

    await recalculateInvoiceFinancials(invoiceId);

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

    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        amount: data.amount,
        method: data.method,
        date: new Date(data.date),
        notes: data.notes || null,
      },
    });

    if (before.invoiceId) {
      await recalculateInvoiceFinancials(before.invoiceId);
    } else {
      const topUp = await prisma.depositTransaction.findFirst({
        where: { customerId: before.customerId, type: 'TOP_UP', notes: { contains: `payment:${before.id}` } },
      });
      if (topUp) {
        await prisma.depositTransaction.update({
          where: { id: topUp.id },
          data: { amount: data.amount },
        });
        await recalculateDepositLedger(before.customerId);
      }
    }

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

    const linkedTopUp = await prisma.depositTransaction.findFirst({
      where: { customerId: payment.customerId, type: 'TOP_UP', notes: { contains: `payment:${payment.id}` } },
    });

    await prisma.payment.delete({ where: { id: paymentId } });

    if (payment.invoiceId) {
      await recalculateInvoiceFinancials(payment.invoiceId);
    } else if (linkedTopUp) {
      await prisma.depositTransaction.delete({ where: { id: linkedTopUp.id } });
      await recalculateDepositLedger(payment.customerId);
    }

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
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { order: true } });
      if (!invoice) throw new Error('Invoice not found.');

      const depositBalance = await getCustomerDepositBalance(invoice.order.customerId);
      const outstanding = toNumber(invoice.outstandingBalance);

      if (amount > depositBalance) throw new Error("Amount exceeds the customer's deposit balance.");
      if (amount > outstanding) throw new Error("Amount exceeds this invoice's outstanding balance.");

      const newBalance = depositBalance - amount;
      await tx.depositTransaction.create({
        data: {
          customerId: invoice.order.customerId,
          type: 'USED',
          amount,
          balanceAfter: newBalance,
          orderId: invoice.orderId,
          invoiceId,
          notes: `Applied to invoice ${invoice.invoiceNumber}`,
          createdById: session.user.id,
        },
      });

      await writeAuditLog({
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Invoice',
        entityId: invoiceId,
        summary: `Applied ${amount} deposit to invoice ${invoice.invoiceNumber}`,
      });
    });

    await recalculateInvoiceFinancials(invoiceId);

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    revalidatePath(`/admin/invoices/${invoiceId}`);
    if (invoice) revalidatePath(`/admin/orders/${invoice.orderId}`);
    revalidatePath('/admin/orders');
    revalidatePath('/admin/payments');
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
