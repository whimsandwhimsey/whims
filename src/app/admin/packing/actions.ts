'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';
import { courierValues } from '@/lib/validations';
import { recalculateShipmentFinancials } from '@/lib/shipment-calculations';

export type ActionResult = { success: true } | { success: false; error: string };

const shipmentSchema = z.object({
  courier: z.enum(courierValues),
  trackingNumber: z.string().min(1, 'Tracking number is required'),
  shippingCost: z.coerce.number().min(0, 'Shipping cost must be zero or more'),
});

/**
 * Creates a Shipment (one resi) covering every order in a packing group —
 * a customer can have several orders from different PO batches packed
 * together into one parcel. Sets courier/tracking/shipmentId on all of
 * them and moves them to Shipped together. The shipping fee becomes its
 * own billable amount, tracked the same paid/outstanding way as an
 * invoice, since it's a separate charge from the books themselves.
 */
export async function createShipment(orderIds: string[], formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = shipmentSchema.safeParse({
    courier: formData.get('courier'),
    trackingNumber: formData.get('trackingNumber'),
    shippingCost: formData.get('shippingCost'),
  });
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? 'Please fill in courier, tracking number, and shipping cost.' };
  }
  if (orderIds.length === 0) return { success: false, error: 'No orders to ship.' };

  try {
    const orders = await prisma.order.findMany({ where: { id: { in: orderIds } } });
    if (orders.length === 0) return { success: false, error: 'Orders not found.' };
    const customerId = orders[0].customerId;

    const shipment = await prisma.shipment.create({
      data: {
        customerId,
        courier: parsed.data.courier,
        trackingNumber: parsed.data.trackingNumber,
        shippingCost: parsed.data.shippingCost,
        amountPaid: 0,
        outstandingBalance: parsed.data.shippingCost,
        paymentStatus: 'UNPAID',
        createdById: session.user.id,
      },
    });

    for (const order of orders) {
      const shouldMarkShipped = !['COMPLETED', 'CANCELLED', 'SHIPPED'].includes(order.status);
      await prisma.order.update({
        where: { id: order.id },
        data: {
          courier: parsed.data.courier,
          trackingNumber: parsed.data.trackingNumber,
          shipmentId: shipment.id,
          ...(shouldMarkShipped ? { status: 'SHIPPED' } : {}),
        },
      });
      revalidatePath(`/admin/orders/${order.id}`);
      revalidatePath(`/portal/orders/${order.id}`);
    }

    await writeAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Shipment',
      entityId: shipment.id,
      summary: `Created shipment ${parsed.data.trackingNumber} (${parsed.data.courier}) for ${orders.length} order(s), ongkir ${parsed.data.shippingCost}`,
    });

    revalidatePath('/admin/packing');
    revalidatePath('/admin/shipments');
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to create shipment.' };
  }
}

/** Records a payment against a shipment's shipping fee — same pattern as
 * recording a payment against an invoice. */
export async function recordShipmentPayment(shipmentId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();
  const amount = Number(formData.get('amount'));
  const methodRaw = String(formData.get('method') ?? '');
  if (!amount || amount <= 0) return { success: false, error: 'Amount must be greater than zero.' };
  if (methodRaw !== 'QRIS' && methodRaw !== 'BANK_TRANSFER') {
    return { success: false, error: 'Invalid payment method.' };
  }
  const method: 'QRIS' | 'BANK_TRANSFER' = methodRaw;

  try {
    const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) return { success: false, error: 'Shipment not found.' };

    await prisma.payment.create({
      data: {
        customerId: shipment.customerId,
        shipmentId,
        date: new Date(),
        amount,
        method,
        notes: `Ongkir untuk resi ${shipment.trackingNumber}`,
        recordedById: session.user.id,
      },
    });

    await recalculateShipmentFinancials(shipmentId);

    await writeAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Payment',
      entityId: shipmentId,
      summary: `Recorded ongkir payment of ${amount} for shipment ${shipment.trackingNumber}`,
    });

    revalidatePath(`/admin/shipments/${shipmentId}`);
    revalidatePath('/admin/shipments');
    revalidatePath('/admin/payments');
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to record payment.' };
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
