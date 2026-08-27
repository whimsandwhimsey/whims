'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireCustomerSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';

export type ActionResult = { success: true } | { success: false; error: string };

const topUpSchema = z.object({ amount: z.coerce.number().positive('Amount must be greater than zero') });

/**
 * Records the customer's own claim that they've transferred a top-up.
 * This never touches the deposit ledger directly — it just creates a
 * PENDING request that staff review and confirm (or reject) from
 * /admin/requests, matching the WhatsApp-confirmation handshake.
 */
export async function requestTopUp(formData: FormData): Promise<ActionResult> {
  const session = await requireCustomerSession();
  const parsed = topUpSchema.safeParse({ amount: formData.get('amount') });
  if (!parsed.success) {
    return { success: false, error: 'Please enter a valid amount.' };
  }

  try {
    await prisma.topUpRequest.create({
      data: {
        customerId: session.user.id,
        amount: parsed.data.amount,
      },
    });

    await writeAuditLog({
      action: 'CREATE',
      entityType: 'TopUpRequest',
      summary: `Customer requested a top-up of ${parsed.data.amount}`,
    });

    revalidatePath('/portal/topup');
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to submit your request. Please try again.' };
  }
}

const addressSchema = z.object({ newAddress: z.string().min(1, 'Please enter an address') });

/**
 * Requests an address change. Doesn't touch Customer.address until staff
 * confirms it from /admin/requests.
 */
export async function requestAddressChange(formData: FormData): Promise<ActionResult> {
  const session = await requireCustomerSession();
  const parsed = addressSchema.safeParse({ newAddress: formData.get('newAddress') });
  if (!parsed.success) {
    return { success: false, error: 'Please enter an address.' };
  }

  try {
    // Only one pending request at a time — replace it rather than piling up.
    const existingPending = await prisma.addressChangeRequest.findFirst({
      where: { customerId: session.user.id, status: 'PENDING' },
    });
    if (existingPending) {
      await prisma.addressChangeRequest.update({
        where: { id: existingPending.id },
        data: { newAddress: parsed.data.newAddress },
      });
    } else {
      await prisma.addressChangeRequest.create({
        data: { customerId: session.user.id, newAddress: parsed.data.newAddress },
      });
    }

    await writeAuditLog({
      action: 'CREATE',
      entityType: 'AddressChangeRequest',
      summary: 'Customer requested an address change',
    });

    revalidatePath('/portal/profile/edit-address');
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to submit your request. Please try again.' };
  }
}
