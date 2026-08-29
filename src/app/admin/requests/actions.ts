'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';
import { getCustomerDepositBalance } from '@/lib/deposit';
import { recalculateInvoiceFinancials } from '@/lib/invoice-calculations';

export async function confirmTopUpRequest(id: string) {
  const session = await requireStaffSession();

  const request = await prisma.topUpRequest.findUnique({ where: { id }, include: { customer: true } });
  if (!request) throw new Error('Request not found.');
  if (request.status !== 'PENDING') throw new Error('This request has already been handled.');

  const amount = Number(request.amount.toString());

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        customerId: request.customerId,
        orderId: null,
        date: new Date(),
        amount,
        method: 'QRIS',
        notes: 'Customer self-service top-up (confirmed via WhatsApp)',
        recordedById: session.user.id,
      },
    });

    const currentBalance = await getCustomerDepositBalance(request.customerId);
    const newBalance = currentBalance + amount;
    await tx.depositTransaction.create({
      data: {
        customerId: request.customerId,
        type: 'TOP_UP',
        amount,
        balanceAfter: newBalance,
        notes: `Confirmed self-service top-up request (payment:${payment.id})`,
        createdById: session.user.id,
      },
    });

    await tx.topUpRequest.update({
      where: { id },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedById: session.user.id },
    });
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'TopUpRequest',
    entityId: id,
    summary: `Confirmed top-up request of ${amount} from ${request.customer.name}`,
  });

  revalidatePath('/admin/requests');
  revalidatePath(`/admin/customers/${request.customerId}`);
  revalidatePath('/admin/payments');
}

export async function rejectTopUpRequest(id: string) {
  const session = await requireStaffSession();
  const request = await prisma.topUpRequest.update({
    where: { id },
    data: { status: 'REJECTED', confirmedAt: new Date(), confirmedById: session.user.id },
    include: { customer: true },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'TopUpRequest',
    entityId: id,
    summary: `Rejected top-up request from ${request.customer.name}`,
  });

  revalidatePath('/admin/requests');
}

export async function confirmAddressChange(id: string) {
  const session = await requireStaffSession();

  const request = await prisma.addressChangeRequest.findUnique({ where: { id }, include: { customer: true } });
  if (!request) throw new Error('Request not found.');
  if (request.status !== 'PENDING') throw new Error('This request has already been handled.');

  await prisma.$transaction([
    prisma.customer.update({ where: { id: request.customerId }, data: { address: request.newAddress } }),
    prisma.addressChangeRequest.update({
      where: { id },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedById: session.user.id },
    }),
  ]);

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'AddressChangeRequest',
    entityId: id,
    summary: `Confirmed address change for ${request.customer.name}`,
  });

  revalidatePath('/admin/requests');
  revalidatePath(`/admin/customers/${request.customerId}`);
}

export async function rejectAddressChange(id: string) {
  const session = await requireStaffSession();
  const request = await prisma.addressChangeRequest.update({
    where: { id },
    data: { status: 'REJECTED', confirmedAt: new Date(), confirmedById: session.user.id },
    include: { customer: true },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'AddressChangeRequest',
    entityId: id,
    summary: `Rejected address change request from ${request.customer.name}`,
  });

  revalidatePath('/admin/requests');
}

/**
 * Confirms a customer's "I paid this invoice" claim — creates the real
 * Payment against that invoice (same as the admin manually recording a
 * payment would), then recalculates the invoice/order's paid/outstanding
 * from scratch. Any amount beyond what the invoice still owes automatically
 * becomes deposit, exactly like a manually-recorded payment.
 */
export async function confirmInvoicePaymentRequest(id: string) {
  const session = await requireStaffSession();

  const request = await prisma.invoicePaymentRequest.findUnique({
    where: { id },
    include: { customer: true, invoice: { include: { order: true } } },
  });
  if (!request) throw new Error('Request not found.');
  if (request.status !== 'PENDING') throw new Error('This request has already been handled.');

  const amount = Number(request.amount.toString());

  await prisma.payment.create({
    data: {
      customerId: request.customerId,
      orderId: request.invoice.orderId,
      invoiceId: request.invoiceId,
      date: new Date(),
      amount,
      method: 'QRIS',
      notes: `Customer self-service invoice payment (confirmed via WhatsApp) — invoice ${request.invoice.invoiceNumber}`,
      recordedById: session.user.id,
    },
  });

  await recalculateInvoiceFinancials(request.invoiceId);

  await prisma.invoicePaymentRequest.update({
    where: { id },
    data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedById: session.user.id },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'InvoicePaymentRequest',
    entityId: id,
    summary: `Confirmed payment of ${amount} for invoice ${request.invoice.invoiceNumber} from ${request.customer.name}`,
  });

  revalidatePath('/admin/requests');
  revalidatePath(`/admin/orders/${request.invoice.orderId}`);
  revalidatePath(`/admin/invoices/${request.invoiceId}`);
  revalidatePath(`/admin/customers/${request.customerId}`);
  revalidatePath('/admin/payments');
}

export async function rejectInvoicePaymentRequest(id: string) {
  const session = await requireStaffSession();
  const request = await prisma.invoicePaymentRequest.update({
    where: { id },
    data: { status: 'REJECTED', confirmedAt: new Date(), confirmedById: session.user.id },
    include: { customer: true, invoice: true },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'InvoicePaymentRequest',
    entityId: id,
    summary: `Rejected payment claim for invoice ${request.invoice.invoiceNumber} from ${request.customer.name}`,
  });

  revalidatePath('/admin/requests');
}
