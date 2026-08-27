import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as Indonesian Rupiah currency. Adjust locale/currency as needed. */
export function formatCurrency(amount: number | string): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/** Normalizes a phone number for consistent lookups (strips spaces/dashes, leading 0 -> 62). */
export function normalizePhone(raw: string): string {
  let phone = raw.replace(/[^\d+]/g, '');
  if (phone.startsWith('0')) phone = '62' + phone.slice(1);
  if (phone.startsWith('+')) phone = phone.slice(1);
  return phone;
}
