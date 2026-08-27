'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { publisherSchema } from '@/lib/validations';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';
import type { FormState } from '../customers/actions';

function parsePublisherForm(formData: FormData) {
  return publisherSchema.safeParse({
    name: formData.get('name'),
    notes: formData.get('notes') ?? '',
  });
}

export async function createPublisher(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireStaffSession();
  const parsed = parsePublisherForm(formData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.publisher.findUnique({ where: { name: parsed.data.name } });
  if (existing) {
    return { errors: { name: ['Publisher dengan nama ini sudah ada.'] } };
  }

  const publisher = await prisma.publisher.create({
    data: { ...parsed.data, notes: parsed.data.notes || null },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    entityType: 'Publisher',
    entityId: publisher.id,
    summary: `Added publisher "${publisher.name}"`,
  });

  revalidatePath('/admin/publishers');
  redirect('/admin/publishers');
}

export async function updatePublisher(
  id: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireStaffSession();
  const parsed = parsePublisherForm(formData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.publisher.findUnique({ where: { name: parsed.data.name } });
  if (existing && existing.id !== id) {
    return { errors: { name: ['Publisher lain sudah pakai nama ini.'] } };
  }

  const before = await prisma.publisher.findUnique({ where: { id } });
  const publisher = await prisma.publisher.update({
    where: { id },
    data: { ...parsed.data, notes: parsed.data.notes || null },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'Publisher',
    entityId: publisher.id,
    summary: `Updated publisher "${publisher.name}"`,
    changes: { before, after: publisher },
  });

  revalidatePath('/admin/publishers');
  redirect('/admin/publishers');
}

export async function togglePublisherActive(id: string, isActive: boolean) {
  const session = await requireStaffSession();
  const publisher = await prisma.publisher.update({ where: { id }, data: { isActive } });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'Publisher',
    entityId: id,
    summary: `${isActive ? 'Reactivated' : 'Archived'} publisher "${publisher.name}"`,
  });

  revalidatePath('/admin/publishers');
}

export async function deletePublisher(id: string) {
  const session = await requireStaffSession();

  const inUse = await prisma.book.count({ where: { publisherId: id } });
  if (inUse > 0) {
    throw new Error('Publisher ini masih dipakai di database buku, arsipkan aja daripada dihapus.');
  }

  const publisher = await prisma.publisher.delete({ where: { id } });

  await writeAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    entityType: 'Publisher',
    entityId: id,
    summary: `Deleted publisher "${publisher.name}"`,
  });

  revalidatePath('/admin/publishers');
}
