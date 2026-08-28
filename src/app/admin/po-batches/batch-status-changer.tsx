'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { orderStatusValues } from '@/lib/validations';
import { updateBatchOrdersStatus } from '../orders/actions';

const STATUS_LABELS: Record<string, string> = {
  WAITING: 'Open',
  IN_TRANSIT: 'Dalam perjalanan ke Indonesia',
  ARRIVED_COUNTRY: 'Tiba di Indonesia',
  ARRIVED: 'Tiba di gudang',
  SHIPPED: 'Terkirim',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function BatchStatusChanger({ poBatchId, orderCount }: { poBatchId: string; orderCount: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    const confirmed = window.confirm(
      `Update status ke "${STATUS_LABELS[next] ?? next}" untuk semua ${orderCount} order di batch ini?`
    );
    if (!confirmed) return;
    startTransition(async () => {
      await updateBatchOrdersStatus(poBatchId, next, '');
      router.refresh();
    });
  }

  return (
    <Select disabled={isPending || orderCount === 0} onChange={(e) => handleChange(e.target.value)} defaultValue="">
      <option value="" disabled>
        Update status semua order…
      </option>
      {orderStatusValues.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </Select>
  );
}
