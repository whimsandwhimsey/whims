import { cn } from '@/lib/utils';

const ORDER_STATUS_STYLES: Record<string, string> = {
  WAITING: 'bg-muted text-muted-foreground',
  IN_TRANSIT: 'bg-accent text-accent-foreground',
  ARRIVED_COUNTRY: 'bg-accent text-accent-foreground',
  ARRIVED: 'bg-blue-100 text-blue-800',
  SHIPPED: 'bg-indigo-100 text-indigo-800',
  COMPLETED: 'bg-success/15 text-success',
  CANCELLED: 'bg-destructive/10 text-destructive',
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  WAITING: 'Open',
  IN_TRANSIT: 'Dalam perjalanan',
  ARRIVED_COUNTRY: 'Tiba di Indonesia',
  ARRIVED: 'Tiba di gudang',
  SHIPPED: 'Terkirim',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        ORDER_STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground'
      )}
    >
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  );
}

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  UNPAID: 'bg-destructive/10 text-destructive',
  PARTIAL: 'bg-amber-100 text-amber-800',
  PAID: 'bg-success/15 text-success',
  OVERPAID: 'bg-brass/20 text-brass',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: 'Unpaid',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  OVERPAID: 'Overpaid',
};

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        PAYMENT_STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground'
      )}
    >
      {PAYMENT_STATUS_LABELS[status] ?? status}
    </span>
  );
}
