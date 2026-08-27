'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { saveShippingInfo } from './actions';

const COURIER_LABELS: Record<string, string> = {
  LION: 'Lion Parcel',
  OJEK: 'Ojek (Gojek/Grab)',
  SHOPEE: 'Shopee Express',
};

export function ShippingForm({
  orderId,
  initialCourier,
  initialTracking,
}: {
  orderId: string;
  initialCourier: string | null;
  initialTracking: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveShippingInfo(orderId, formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select name="courier" defaultValue={initialCourier ?? ''} className="sm:w-40" required>
        <option value="" disabled>
          Courier…
        </option>
        {Object.entries(COURIER_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Input
        name="trackingNumber"
        placeholder="Tracking / resi number"
        defaultValue={initialTracking ?? ''}
        className="sm:w-48"
        required
      />
      <Button type="submit" size="sm" disabled={isPending} className="shrink-0">
        {isPending ? 'Saving…' : 'Save'}
      </Button>
      {saved && !error && <span className="text-xs text-success">Saved ✓</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </form>
  );
}
