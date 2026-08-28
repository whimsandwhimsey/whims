'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { bookSchema } from '@/lib/validations';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';
import type { FormState } from '../customers/actions';

function parseBookForm(formData: FormData) {
  return bookSchema.safeParse({
    title: formData.get('title'),
    author: formData.get('author') ?? '',
    isbn: formData.get('isbn') ?? '',
    format: formData.get('format') || undefined,
    weightGrams: formData.get('weightGrams') || '',
    imageUrl: formData.get('imageUrl') ?? '',
    publisherId: formData.get('publisherId') ?? '',
    notes: formData.get('notes') ?? '',
  });
}

export async function createBook(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireStaffSession();
  const parsed = parseBookForm(formData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  if (parsed.data.isbn) {
    const existing = await prisma.book.findUnique({ where: { isbn: parsed.data.isbn } });
    if (existing) {
      return { errors: { isbn: ['A book with this ISBN already exists.'] } };
    }
  }

  const book = await prisma.book.create({
    data: {
      ...parsed.data,
      isbn: parsed.data.isbn || null,
      author: parsed.data.author || null,
      format: parsed.data.format || null,
      weightGrams: parsed.data.weightGrams === '' || parsed.data.weightGrams === undefined ? null : parsed.data.weightGrams,
      imageUrl: parsed.data.imageUrl || null,
      publisherId: parsed.data.publisherId || null,
    },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    entityType: 'Book',
    entityId: book.id,
    summary: `Added book "${book.title}"`,
  });

  revalidatePath('/admin/books');
  redirect('/admin/books');
}

export async function updateBook(
  id: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireStaffSession();
  const parsed = parseBookForm(formData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  if (parsed.data.isbn) {
    const existing = await prisma.book.findUnique({ where: { isbn: parsed.data.isbn } });
    if (existing && existing.id !== id) {
      return { errors: { isbn: ['Another book already uses this ISBN.'] } };
    }
  }

  const before = await prisma.book.findUnique({ where: { id } });
  const book = await prisma.book.update({
    where: { id },
    data: {
      ...parsed.data,
      isbn: parsed.data.isbn || null,
      author: parsed.data.author || null,
      format: parsed.data.format || null,
      weightGrams: parsed.data.weightGrams === '' || parsed.data.weightGrams === undefined ? null : parsed.data.weightGrams,
      imageUrl: parsed.data.imageUrl || null,
      publisherId: parsed.data.publisherId || null,
    },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'Book',
    entityId: book.id,
    summary: `Updated book "${book.title}"`,
    changes: { before, after: book },
  });

  revalidatePath('/admin/books');
  redirect('/admin/books');
}

export async function toggleBookActive(id: string, isActive: boolean) {
  const session = await requireStaffSession();
  const book = await prisma.book.update({ where: { id }, data: { isActive } });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'Book',
    entityId: id,
    summary: `${isActive ? 'Reactivated' : 'Archived'} book "${book.title}"`,
  });

  revalidatePath('/admin/books');
}

export async function deleteBook(id: string) {
  const session = await requireStaffSession();

  // Order items keep their own snapshot (title/price/cogs), so deleting a
  // catalog Book never loses order history — the DB relation is
  // onDelete: SetNull, so existing order items just lose the catalog link.
  const book = await prisma.book.delete({ where: { id } });

  await writeAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    entityType: 'Book',
    entityId: id,
    summary: `Deleted book "${book.title}"`,
  });

  revalidatePath('/admin/books');
}
