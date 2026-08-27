'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New password and confirmation do not match',
    path: ['confirmPassword'],
  });

export type ActionResult = { success: true } | { success: false; error: string };

export async function changeOwnPassword(formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? 'Please check the form.' };
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { success: false, error: 'Account not found.' };

  const currentValid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!currentValid) {
    return { success: false, error: 'Current password is incorrect.' };
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  await writeAuditLog({
    userId: user.id,
    action: 'UPDATE',
    entityType: 'User',
    entityId: user.id,
    summary: `${user.name} changed their own password`,
  });

  return { success: true };
}
