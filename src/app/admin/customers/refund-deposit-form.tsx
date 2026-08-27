'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { refundDeposit } from '../payments/actions';

export function RefundDepositForm({ customerId, depositBalance }: { customerId: string; depositBalance: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (depositBalance <= 0) return null;

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await refundDeposit(customerId, formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Refund deposit
      </Button>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-3 rounded-md border border-border p-4">
      <div className="space-y-1.5">
        <Label htmlFor="refundAmount">Amount</Label>
        <Input
          id="refundAmount"
          name="amount"
          type="number"
          min="1"
          max={depositBalance}
          step="1"
          defaultValue={depositBalance}
          required
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Available: {depositBalance.toLocaleString()}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="refundNotes">Notes</Label>
        <Textarea id="refundNotes" name="notes" rows={2} placeholder="e.g. Refunded via bank transfer" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {isPending ? 'Saving…' : 'Confirm refund'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
