import { prisma } from '@/lib/prisma';

/**
 * Generates the next order number for the current year, e.g. ORD-2026-000042.
 * Uses a count-based approach with a unique-constraint retry loop rather than
 * a DB sequence, since order volume for a single bookstore is low enough that
 * the rare collision-and-retry is simpler to reason about than managing a
 * separate sequence per year.
 */
export async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;

  const count = await prisma.order.count({
    where: { orderNumber: { startsWith: prefix } },
  });

  return `${prefix}${String(count + 1).padStart(6, '0')}`;
}

/** Call inside the same transaction as order creation; retries once on collision. */
export async function generateOrderNumberWithRetry(
  attempt = 0
): Promise<string> {
  const candidate = await generateOrderNumber();
  if (attempt > 3) {
    // Extremely unlikely fallback: append a short random suffix.
    return `${candidate}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const existing = await prisma.order.findUnique({ where: { orderNumber: candidate } });
  if (existing) {
    return generateOrderNumberWithRetry(attempt + 1);
  }
  return candidate;
}
