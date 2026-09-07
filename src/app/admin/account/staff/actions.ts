'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdminSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';

export type ActionResult = { success: true } | { success: false; error: string };

const newStaffSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50)
    .regex(/^[a-z0-9._-]+$/i, 'Only letters, numbers, dots, dashes, underscores'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['ADMIN', 'STAFF']),
});

export async function createStaffAccount(formData: FormData): Promise<ActionResult> {
  const session = await requireAdminSession();

  const parsed = newStaffSchema.safeParse({
    name: formData.get('name'),
    username: formData.get('username'),
    password: formData.get('password'),
    role: formData.get('role'),
  });
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? 'Please check the form.' };
  }

  const username = parsed.data.username.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return { success: false, error: 'That username is already taken.' };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const created = await prisma.user.create({
    data: { name: parsed.data.name, username, passwordHash, role: parsed.data.role },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    entityType: 'User',
    entityId: created.id,
    summary: `Created staff account "${created.username}" (${created.role}) for ${created.name}`,
  });

  revalidatePath('/admin/account/staff');
  return { success: true };
}

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function resetStaffPassword(userId: string, formData: FormData): Promise<ActionResult> {
  const session = await requireAdminSession();

  const parsed = resetPasswordSchema.safeParse({ newPassword: formData.get('newPassword') });
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten().fieldErrors.newPassword?.[0] ?? 'Invalid password.' };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { success: false, error: 'Account not found.' };

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'User',
    entityId: userId,
    summary: `Reset password for staff account "${target.username}"`,
  });

  revalidatePath('/admin/account/staff');
  return { success: true };
}

export async function toggleStaffActive(userId: string, isActive: boolean): Promise<ActionResult> {
  const session = await requireAdminSession();

  if (userId === session.user.id && !isActive) {
    return { success: false, error: "You can't deactivate your own account." };
  }

  const target = await prisma.user.update({ where: { id: userId }, data: { isActive } });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'User',
    entityId: userId,
    summary: `${isActive ? 'Reactivated' : 'Deactivated'} staff account "${target.username}"`,
  });

  revalidatePath('/admin/account/staff');
  return { success: true };
}
