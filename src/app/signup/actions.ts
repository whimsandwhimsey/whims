'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/utils';
import { writeAuditLog } from '@/lib/audit';

const signupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  phone: z
    .string()
    .min(8, 'Phone number looks too short')
    .max(20)
    .regex(/^[\d+\s-]+$/, 'Only digits, spaces, + and - are allowed'),
  address: z.string().max(500).optional().or(z.literal('')),
});

export type SignupResult =
  | { success: true; status: 'submitted' | 'already-pending' }
  | { success: false; error: string };

/**
 * Public signup — no session required. Creates a Customer row with
 * status PENDING; the customer can't log in until staff approves it
 * from the admin Customers list.
 */
export async function requestCustomerSignup(formData: FormData): Promise<SignupResult> {
  const parsed = signupSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    address: formData.get('address') ?? '',
  });

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? 'Please check the form and try again.' };
  }

  const phone = normalizePhone(parsed.data.phone);

  const existing = await prisma.customer.findFirst({ where: { phone } });
  if (existing) {
    if (existing.status === 'ACTIVE') {
      return {
        success: false,
        error: 'This phone number is already registered. Try signing in instead.',
      };
    }
    if (existing.status === 'PENDING') {
      return { success: true, status: 'already-pending' };
    }
    // REJECTED: allow a fresh request by resetting to PENDING with the new details.
    await prisma.customer.update({
      where: { id: existing.id },
      data: { name: parsed.data.name, address: parsed.data.address || null, status: 'PENDING' },
    });
    await writeAuditLog({
      action: 'UPDATE',
      entityType: 'Customer',
      entityId: existing.id,
      summary: `${parsed.data.name} re-submitted a signup request`,
    });
    return { success: true, status: 'submitted' };
  }

  const customer = await prisma.customer.create({
    data: {
      name: parsed.data.name,
      phone,
      address: parsed.data.address || null,
      status: 'PENDING',
    },
  });

  await writeAuditLog({
    action: 'CREATE',
    entityType: 'Customer',
    entityId: customer.id,
    summary: `New signup request from ${customer.name}`,
  });

  return { success: true, status: 'submitted' };
}
