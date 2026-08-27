'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { orderStatusValues } from '@/lib/validations';
import { updateOrderStatus } from './actions';

const STATUS_LABELS: Record<string, string> = {
  WAITING: 'Waiting',
  ARRIVED: 'Arrived',
  READY_TO_SHIP: 'Ready to Ship',
  SHIPPED: 'Shipped',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function StatusChanger({ orderId, current }: { orderId: string; current: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    startTransition(async () => {
      await updateOrderStatus(orderId, next);
      router.refresh();
    });
  }

  return (
    <Select
      value={current}
      disabled={isPending}
      onChange={(e) => handleChange(e.target.value)}
      className="w-48"
    >
      {orderStatusValues.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </Select>
  );
}
