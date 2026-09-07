'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';
import { courierValues } from '@/lib/validations';

const shippingSchema = z.object({
  courier: z.enum(courierValues),
  trackingNumber: z.string().min(1, 'Tracking number is required'),
});

export type ActionResult = { success: true } | { success: false; error: string };

/**
 * Saves the courier + tracking number for every order in a packing group
 * (a customer can have several orders from different PO batches packed
 * together into one parcel) — all of them get the same courier/resi, and
 * all move to Shipped together.
 */
export async function saveShippingInfo(orderIds: string[], formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = shippingSchema.safeParse({
    courier: formData.get('courier'),
    trackingNumber: formData.get('trackingNumber'),
  });
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? 'Please fill in courier and tracking number.' };
  }
  if (orderIds.length === 0) return { success: false, error: 'No orders to update.' };

  try {
    const orders = await prisma.order.findMany({ where: { id: { in: orderIds } } });
    if (orders.length === 0) return { success: false, error: 'Orders not found.' };

    for (const order of orders) {
      const shouldMarkShipped = !['COMPLETED', 'CANCELLED', 'SHIPPED'].includes(order.status);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          courier: parsed.data.courier,
          trackingNumber: parsed.data.trackingNumber,
          ...(shouldMarkShipped ? { status: 'SHIPPED' } : {}),
        },
      });
      revalidatePath(`/admin/orders/${order.id}`);
      revalidatePath(`/portal/orders/${order.id}`);
    }

    await writeAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'Order',
      entityId: orderIds.join(','),
      summary: `Set shipping info for ${orders.length} order(s): ${parsed.data.courier} / ${parsed.data.trackingNumber}`,
    });

    revalidatePath('/admin/packing');
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to save shipping info.' };
  }
}

/** Toggles the lightweight "physically packed" checkbox for one book item —
 * doesn't change order status, just tracks progress while working through
 * the list. */
export async function togglePacked(itemId: string, packed: boolean): Promise<void> {
  await requireStaffSession();
  await prisma.orderItem.update({
    where: { id: itemId },
    data: { packedAt: packed ? new Date() : null },
  });
  revalidatePath('/admin/packing');
}

const noteSchema = z.object({ note: z.string().max(500) });

/** Saves (or clears) the freeform packing note for a customer — hold,
 * "kirim setengah dulu", or anything else that doesn't fit a fixed field. */
export async function savePackingNote(customerId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = noteSchema.safeParse({ note: formData.get('note') ?? '' });
  if (!parsed.success) return { success: false, error: 'Note too long.' };

  try {
    const note = parsed.data.note.trim();
    if (!note) {
      await prisma.packingNote.deleteMany({ where: { customerId } });
    } else {
      await prisma.packingNote.upsert({
        where: { customerId },
        update: { note },
        create: { customerId, note },
      });
    }

    await writeAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'PackingNote',
      entityId: customerId,
      summary: note ? `Set packing note for customer: "${note}"` : `Cleared packing note for customer`,
    });

    revalidatePath('/admin/packing');
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to save note.' };
  }
}
