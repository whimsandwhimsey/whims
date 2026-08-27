'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { supplierSchema } from '@/lib/validations';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';
import type { FormState } from '../customers/actions';

function parseSupplierForm(formData: FormData) {
  return supplierSchema.safeParse({
    name: formData.get('name'),
    notes: formData.get('notes') ?? '',
  });
}

export async function createSupplier(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireStaffSession();
  const parsed = parseSupplierForm(formData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.supplier.findUnique({ where: { name: parsed.data.name } });
  if (existing) {
    return { errors: { name: ['Supplier dengan nama ini sudah ada.'] } };
  }

  const supplier = await prisma.supplier.create({
    data: { ...parsed.data, notes: parsed.data.notes || null },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    entityType: 'Supplier',
    entityId: supplier.id,
    summary: `Added supplier "${supplier.name}"`,
  });

  revalidatePath('/admin/suppliers');
  redirect('/admin/suppliers');
}

export async function updateSupplier(
  id: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireStaffSession();
  const parsed = parseSupplierForm(formData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.supplier.findUnique({ where: { name: parsed.data.name } });
  if (existing && existing.id !== id) {
    return { errors: { name: ['Supplier lain sudah pakai nama ini.'] } };
  }

  const before = await prisma.supplier.findUnique({ where: { id } });
  const supplier = await prisma.supplier.update({
    where: { id },
    data: { ...parsed.data, notes: parsed.data.notes || null },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'Supplier',
    entityId: supplier.id,
    summary: `Updated supplier "${supplier.name}"`,
    changes: { before, after: supplier },
  });

  revalidatePath('/admin/suppliers');
  redirect('/admin/suppliers');
}

export async function toggleSupplierActive(id: string, isActive: boolean) {
  const session = await requireStaffSession();
  const supplier = await prisma.supplier.update({ where: { id }, data: { isActive } });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'Supplier',
    entityId: id,
    summary: `${isActive ? 'Reactivated' : 'Archived'} supplier "${supplier.name}"`,
  });

  revalidatePath('/admin/suppliers');
}

export async function deleteSupplier(id: string) {
  const session = await requireStaffSession();

  const inUse = await prisma.purchaseBatch.count({ where: { supplierId: id } });
  if (inUse > 0) {
    throw new Error('Supplier ini masih dipakai di PO batch, arsipkan aja daripada dihapus.');
  }

  const supplier = await prisma.supplier.delete({ where: { id } });

  await writeAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    entityType: 'Supplier',
    entityId: id,
    summary: `Deleted supplier "${supplier.name}"`,
  });

  revalidatePath('/admin/suppliers');
}
