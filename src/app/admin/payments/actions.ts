'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';
import { getCustomerDepositBalance, recalculateDepositLedger } from '@/lib/deposit';
import { computePaymentStatus, computeOutstandingBalance, toNumber } from '@/lib/calculations';
import { recalculateOrderFinancials } from '@/lib/order-recalc';

export type ActionResult = { success: true } | { success: false; error: string };

const paymentFormSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  method: z.enum(['QRIS', 'BANK_TRANSFER']),
  date: z.string().min(1),
  notes: z.string().optional(),
});

/**
 * Records a payment against a specific order. Only the amount needed to
 * cover the order's outstanding balance is applied to the order — any
 * excess automatically becomes a customer deposit (TOP_UP transaction).
 * The actual math is delegated to recalculateOrderFinancials so creating,
 * editing, and deleting a payment all go through the exact same logic.
 */
export async function recordPayment(orderId: string, formData: FormData): Promise<ActionResult> {
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
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return { success: false, error: 'Order not found.' };

    const payment = await prisma.payment.create({
      data: {
        customerId: order.customerId,
        orderId,
        date: new Date(data.date),
        amount: data.amount,
        method: data.method,
        notes: data.notes || null,
        recordedById: session.user.id,
      },
    });

    await recalculateOrderFinancials(orderId);

    await writeAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Payment',
      entityId: payment.id,
      summary: `Recorded ${data.method} payment of ${data.amount} for order ${order.orderNumber}`,
    });

    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath('/admin/orders');
    revalidatePath('/admin/payments');
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to record payment.' };
  }
}

/** Records a payment that isn't tied to any order — the whole amount becomes a deposit. */
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
        paymentId: payment.id,
        notes: data.notes || 'Deposit top-up',
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
 * Edits a previously recorded payment. Works for both order-linked payments
 * and standalone deposit top-ups — in both cases the linked deposit
 * transaction (if any) and all downstream balances are recalculated from
 * scratch afterwards, so the edit is always reflected correctly no matter
 * how much history has happened since.
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

    if (before.orderId) {
      await recalculateOrderFinancials(before.orderId);
    } else {
      // Standalone deposit top-up: update its own TOP_UP transaction directly.
      const topUp = await prisma.depositTransaction.findFirst({
        where: { paymentId: before.id, type: 'TOP_UP' },
      });
      if (topUp) {
        await prisma.depositTransaction.update({
          where: { id: topUp.id },
          data: { amount: data.amount, notes: data.notes || topUp.notes },
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

    // Detach (rather than cascade-delete) any deposit transaction this
    // payment generated, so the deposit ledger history stays intact — the
    // recalculation below will then correct or remove it as appropriate.
    const linkedTopUp = await prisma.depositTransaction.findFirst({
      where: { paymentId, type: 'TOP_UP' },
    });

    await prisma.payment.delete({ where: { id: paymentId } });

    if (payment.orderId) {
      await recalculateOrderFinancials(payment.orderId);
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
    if (payment.orderId) revalidatePath(`/admin/orders/${payment.orderId}`);
    revalidatePath(`/admin/customers/${payment.customerId}`);
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to delete payment.' };
  }
}

const applyDepositSchema = z.object({ amount: z.coerce.number().positive('Amount must be greater than zero') });

export async function applyDepositToOrder(orderId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = applyDepositSchema.safeParse({ amount: formData.get('amount') });
  if (!parsed.success) return { success: false, error: 'Invalid amount.' };
  const { amount } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new Error('Order not found.');

      const depositBalance = await getCustomerDepositBalance(order.customerId);
      const outstanding = toNumber(order.outstandingBalance);

      if (amount > depositBalance) throw new Error("Amount exceeds the customer's deposit balance.");
      if (amount > outstanding) throw new Error("Amount exceeds this order's outstanding balance.");

      const newAmountPaid = toNumber(order.amountPaid) + amount;
      const totalAmount = toNumber(order.totalAmount);
      const newOutstanding = computeOutstandingBalance(totalAmount, newAmountPaid);
      const newStatus = computePaymentStatus(totalAmount, newAmountPaid);

      await tx.order.update({
        where: { id: orderId },
        data: { amountPaid: newAmountPaid, outstandingBalance: newOutstanding, paymentStatus: newStatus },
      });

      const newBalance = depositBalance - amount;
      await tx.depositTransaction.create({
        data: {
          customerId: order.customerId,
          type: 'USED',
          amount,
          balanceAfter: newBalance,
          orderId,
          notes: `Applied to order ${order.orderNumber}`,
          createdById: session.user.id,
        },
      });

      await writeAuditLog({
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Order',
        entityId: orderId,
        summary: `Applied ${amount} deposit to order ${order.orderNumber}`,
      });
    });

    revalidatePath(`/admin/orders/${orderId}`);
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
