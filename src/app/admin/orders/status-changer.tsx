'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { orderStatusValues } from '@/lib/validations';
import { updateOrderStatus, updateBatchOrdersStatus } from './actions';

const STATUS_LABELS: Record<string, string> = {
  WAITING: 'Open',
  IN_TRANSIT: 'Dalam perjalanan ke Indonesia',
  ARRIVED_COUNTRY: 'Tiba di Indonesia',
  ARRIVED: 'Tiba di gudang',
  SHIPPED: 'Terkirim',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function StatusChanger({ orderId, current }: { orderId: string; current: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    startTransition(async () => {
      const result = await updateOrderStatus(orderId, next);
      if (result?.poBatchId && result.batchSiblingCount > 0) {
        const confirmed = window.confirm(
          `Update status yang sama (${STATUS_LABELS[next] ?? next}) untuk ${result.batchSiblingCount} order lain di PO batch yang sama juga?`
        );
        if (confirmed) {
          await updateBatchOrdersStatus(result.poBatchId, next, orderId);
        }
      }
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
      {orderStatusValues
        .filter((s) => s !== 'COMPLETED' || current === 'COMPLETED')
        .map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
    </Select>
  );
}
