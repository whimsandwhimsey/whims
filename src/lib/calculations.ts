import type { Decimal } from '@prisma/client/runtime/library';

export type OrderItemInput = {
  quantity: number;
  sellingPrice: number;
  cogs: number;
  discount: number;
};

export type OrderTotals = {
  subtotal: number;
  discountTotal: number;
  totalAmount: number;
  totalCogs: number;
  profit: number;
};

/** Per-line subtotal: (price * qty) - discount. Never negative. */
export function computeItemSubtotal(item: OrderItemInput): number {
  const raw = item.sellingPrice * item.quantity - item.discount;
  return Math.max(0, round2(raw));
}

/** Aggregate totals across every line item in an order. */
export function computeOrderTotals(items: OrderItemInput[]): OrderTotals {
  let subtotal = 0;
  let discountTotal = 0;
  let totalCogs = 0;

  for (const item of items) {
    subtotal += item.sellingPrice * item.quantity;
    discountTotal += item.discount;
    totalCogs += item.cogs * item.quantity;
  }

  const totalAmount = Math.max(0, round2(subtotal - discountTotal));
  const profit = round2(totalAmount - totalCogs);

  return {
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal),
    totalAmount,
    totalCogs: round2(totalCogs),
    profit,
  };
}

export type PaymentStatusResult = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID';

/** Derives payment status purely from totals — never stored ad hoc. */
export function computePaymentStatus(totalAmount: number, amountPaid: number): PaymentStatusResult {
  if (amountPaid <= 0) return 'UNPAID';
  if (amountPaid < totalAmount) return 'PARTIAL';
  if (amountPaid === totalAmount) return 'PAID';
  return 'OVERPAID';
}

export function computeOutstandingBalance(totalAmount: number, amountPaid: number): number {
  return round2(Math.max(0, totalAmount - amountPaid));
}

/** Amount that overflows into deposit when a payment exceeds what's owed. */
export function computeOverpayAmount(totalAmount: number, amountPaid: number): number {
  return round2(Math.max(0, amountPaid - totalAmount));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Convert a Prisma Decimal (or already-a-number) to a plain JS number for calculations/UI. */
export function toNumber(value: Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}
