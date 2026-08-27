import { prisma } from '@/lib/prisma';

/** Generates the next invoice number for the current year, e.g. INV-2026-000042. */
export async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const count = await prisma.invoice.count({
    where: { invoiceNumber: { startsWith: prefix } },
  });

  const candidate = `${prefix}${String(count + 1).padStart(6, '0')}`;
  const existing = await prisma.invoice.findUnique({ where: { invoiceNumber: candidate } });
  if (existing) {
    // Rare race — fall back to a short random suffix rather than looping forever.
    return `${candidate}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return candidate;
}
