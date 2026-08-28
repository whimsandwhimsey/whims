'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import ExcelJS from 'exceljs';
import { prisma } from '@/lib/prisma';
import { customerSchema } from '@/lib/validations';
import { requireStaffSession } from '@/lib/guards';
import { writeAuditLog } from '@/lib/audit';
import { normalizePhone } from '@/lib/utils';

export type FormState = {
  errors?: Record<string, string[]>;
  message?: string;
} | null;

function parseCustomerForm(formData: FormData) {
  return customerSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    address: formData.get('address') ?? '',
    notes: formData.get('notes') ?? '',
  });
}

export async function createCustomer(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireStaffSession();
  const parsed = parseCustomerForm(formData);

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const phone = normalizePhone(parsed.data.phone);

  const existing = await prisma.customer.findFirst({ where: { phone } });
  if (existing) {
    return { errors: { phone: ['A customer with this phone number already exists.'] } };
  }

  const customer = await prisma.customer.create({
    data: { ...parsed.data, phone },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    entityType: 'Customer',
    entityId: customer.id,
    summary: `Created customer ${customer.name}`,
  });

  revalidatePath('/admin/customers');
  redirect('/admin/customers');
}

export type QuickCreateResult =
  | { success: true; id: string; name: string; phone: string }
  | { success: false; error: string };

/**
 * Creates a customer inline, from the order form — no need to leave the
 * page to add someone who's ordering for the first time. Skips the
 * PENDING/approval step entirely since staff is entering them directly
 * (unlike the customer self-signup flow), so they're immediately usable
 * on an order.
 */
export async function quickCreateCustomer(formData: FormData): Promise<QuickCreateResult> {
  const session = await requireStaffSession();
  const parsed = parseCustomerForm(formData);

  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, error: firstError ?? 'Please check the form for errors.' };
  }

  const phone = normalizePhone(parsed.data.phone);

  const existing = await prisma.customer.findFirst({ where: { phone } });
  if (existing) {
    return { success: false, error: 'A customer with this phone number already exists.' };
  }

  const customer = await prisma.customer.create({
    data: { ...parsed.data, phone, status: 'ACTIVE' },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    entityType: 'Customer',
    entityId: customer.id,
    summary: `Created customer ${customer.name} (quick-add from order form)`,
  });

  revalidatePath('/admin/customers');
  return { success: true, id: customer.id, name: customer.name, phone: customer.phone };
}

export async function updateCustomer(
  id: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireStaffSession();
  const parsed = parseCustomerForm(formData);

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const phone = normalizePhone(parsed.data.phone);

  const existing = await prisma.customer.findFirst({ where: { phone } });
  if (existing && existing.id !== id) {
    return { errors: { phone: ['Another customer already uses this phone number.'] } };
  }

  const before = await prisma.customer.findUnique({ where: { id } });
  const customer = await prisma.customer.update({
    where: { id },
    data: { ...parsed.data, phone },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'Customer',
    entityId: customer.id,
    summary: `Updated customer ${customer.name}`,
    changes: { before, after: customer },
  });

  revalidatePath('/admin/customers');
  redirect('/admin/customers');
}

export async function approveCustomer(id: string) {
  const session = await requireStaffSession();

  const customer = await prisma.customer.update({
    where: { id },
    data: { status: 'ACTIVE' },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'Customer',
    entityId: id,
    summary: `Approved signup request from ${customer.name}`,
  });

  revalidatePath('/admin/customers');
}

export async function rejectCustomer(id: string) {
  const session = await requireStaffSession();

  const customer = await prisma.customer.update({
    where: { id },
    data: { status: 'REJECTED' },
  });

  await writeAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    entityType: 'Customer',
    entityId: id,
    summary: `Rejected signup request from ${customer.name}`,
  });

  revalidatePath('/admin/customers');
}

/**
 * Deletes a customer outright if they have no order/payment history.
 * If they do, "deleting" archives them instead (status: ARCHIVED) — this
 * keeps every order, payment, and deposit transaction intact (financial
 * records should never silently disappear) while removing them from the
 * active customer list. Archived customers can't log in to the portal.
 */
export async function deleteCustomer(id: string) {
  const session = await requireStaffSession();

  const orderCount = await prisma.order.count({ where: { customerId: id } });

  if (orderCount > 0) {
    const customer = await prisma.customer.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    await writeAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'Customer',
      entityId: id,
      summary: `Archived customer ${customer.name} (has order history)`,
    });

    revalidatePath('/admin/customers');
    return;
  }

  const customer = await prisma.customer.delete({ where: { id } });

  await writeAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    entityType: 'Customer',
    entityId: id,
    summary: `Deleted customer ${customer.name}`,
  });

  revalidatePath('/admin/customers');
}

export type ImportResult = {
  created: number;
  skipped: number;
  errors: string[];
};

/**
 * Bulk-imports customers from an uploaded .xlsx file. Expects a header row
 * with columns named (case-insensitively) Name, Phone, Address, Notes —
 * matching the export format from /api/export/customers, so a round trip
 * of export -> edit in Excel -> import just works.
 */
export async function importCustomersFromExcel(formData: FormData): Promise<ImportResult> {
  const session = await requireStaffSession();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return { created: 0, skipped: 0, errors: ['No file was uploaded.'] };
  }

  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { created: 0, skipped: 0, errors: ['The file has no sheets.'] };
  }

  const headerRow = sheet.getRow(1);
  const columnIndex: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const key = String(cell.value ?? '').trim().toLowerCase();
    if (key) columnIndex[key] = colNumber;
  });

  const nameCol = columnIndex['name'];
  const phoneCol = columnIndex['phone'];
  const addressCol = columnIndex['address'];
  const notesCol = columnIndex['notes'];

  if (!nameCol || !phoneCol) {
    return {
      created: 0,
      skipped: 0,
      errors: ['The file must have "Name" and "Phone" column headers in the first row.'],
    };
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const name = String(row.getCell(nameCol).value ?? '').trim();
    const rawPhone = String(row.getCell(phoneCol).value ?? '').trim();
    if (!name && !rawPhone) continue; // skip fully blank rows

    if (!name || !rawPhone) {
      errors.push(`Row ${rowNumber}: missing name or phone, skipped.`);
      skipped++;
      continue;
    }

    const phone = normalizePhone(rawPhone);
    const address = addressCol ? String(row.getCell(addressCol).value ?? '').trim() : '';
    const notes = notesCol ? String(row.getCell(notesCol).value ?? '').trim() : '';

    const existing = await prisma.customer.findFirst({ where: { phone } });
    if (existing) {
      errors.push(`Row ${rowNumber}: ${name} (${phone}) already exists, skipped.`);
      skipped++;
      continue;
    }

    await prisma.customer.create({
      data: { name, phone, address: address || null, notes: notes || null, status: 'ACTIVE' },
    });
    created++;
  }

  await writeAuditLog({
    userId: session.user.id,
    action: 'IMPORT',
    entityType: 'Customer',
    summary: `Imported customers from Excel: ${created} created, ${skipped} skipped`,
  });

  revalidatePath('/admin/customers');
  return { created, skipped, errors };
}
