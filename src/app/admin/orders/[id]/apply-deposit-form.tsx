'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';
import { applyDepositToOrder } from '../../payments/actions';

export function ApplyDepositForm({
  orderId,
  depositBalance,
  outstanding,
}: {
  orderId: string;
  depositBalance: number;
  outstanding: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const maxApplicable = Math.min(depositBalance, outstanding);
  if (maxApplicable <= 0) return null;

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await applyDepositToOrder(orderId, formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="space-y-2 rounded-md border border-brass/40 bg-brass/5 p-4">
      <p className="text-sm">
        Customer has <span className="font-medium">{formatCurrency(depositBalance)}</span> in deposit.
      </p>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="depositAmount">Apply amount</Label>
          <Input
            id="depositAmount"
            name="amount"
            type="number"
            min="0"
            max={maxApplicable}
            step="1"
            defaultValue={maxApplicable}
          />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {isPending ? 'Applying…' : 'Apply to order'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
