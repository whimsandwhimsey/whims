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
 * Saves the courier + tracking number for an order. If the order isn't
 * already Completed or Cancelled, this also bumps its status to Shipped —
 * filling in the resi is, in practice, the moment an order actually ships.
 */
export async function saveShippingInfo(orderId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = shippingSchema.safeParse({
    courier: formData.get('courier'),
    trackingNumber: formData.get('trackingNumber'),
  });
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? 'Please fill in courier and tracking number.' };
  }

  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return { success: false, error: 'Order not found.' };

    const shouldMarkShipped = !['COMPLETED', 'CANCELLED', 'SHIPPED'].includes(order.status);

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        courier: parsed.data.courier,
        trackingNumber: parsed.data.trackingNumber,
        ...(shouldMarkShipped ? { status: 'SHIPPED' } : {}),
      },
    });

    await writeAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'Order',
      entityId: orderId,
      summary: `Set shipping info for ${updated.orderNumber}: ${parsed.data.courier} / ${parsed.data.trackingNumber}`,
    });

    revalidatePath('/admin/packing');
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath(`/portal/orders/${orderId}`);
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to save shipping info.' };
  }
}
