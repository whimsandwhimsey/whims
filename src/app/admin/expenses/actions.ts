'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';

const expenseSchema = z.object({
  date: z.string().min(1),
  category: z.enum(['PACKING', 'SHIPPING_TO_WAREHOUSE', 'OTHER']),
  description: z.string().max(500).optional().or(z.literal('')),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  orderId: z.string().optional().or(z.literal('')),
});

export type ActionResult = { success: true } | { success: false; error: string };

export async function createExpense(formData: FormData): Promise<ActionResult> {
  const session = await requireStaffSession();
  const parsed = expenseSchema.safeParse({
    date: formData.get('date'),
    category: formData.get('category'),
    description: formData.get('description') ?? '',
    amount: formData.get('amount'),
    orderId: formData.get('orderId') ?? '',
  });
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? 'Please check the form.' };
  }
  const data = parsed.data;

  try {
    const expense = await prisma.expense.create({
      data: {
        date: new Date(data.date),
        category: data.category,
        description: data.description || null,
        amount: data.amount,
        orderId: data.orderId || null,
        createdById: session.user.id,
      },
    });

    await writeAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Expense',
      entityId: expense.id,
      summary: `Recorded ${data.category} expense of ${data.amount}`,
    });

    revalidatePath('/admin/expenses');
    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Failed to record expense.' };
  }
}

export async function deleteExpense(id: string) {
  const session = await requireStaffSession();
  const expense = await prisma.expense.delete({ where: { id } });

  await writeAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    entityType: 'Expense',
    entityId: id,
    summary: `Deleted ${expense.category} expense of ${expense.amount}`,
  });

  revalidatePath('/admin/expenses');
  revalidatePath('/admin/dashboard');
}
