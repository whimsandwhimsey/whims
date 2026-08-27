'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { editPayment } from '../../actions';

export function EditPaymentForm({
  paymentId,
  initial,
  returnTo,
}: {
  paymentId: string;
  initial: { date: string; amount: string; method: string; notes: string };
  returnTo: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await editPayment(paymentId, formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(returnTo);
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Input id="date" name="date" type="date" defaultValue={initial.date} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="method">Method</Label>
          <Select id="method" name="method" defaultValue={initial.method} required>
            <option value="QRIS">QRIS</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="amount">Amount</Label>
          <Input id="amount" name="amount" type="number" min="1" step="1" defaultValue={initial.amount} required />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" defaultValue={initial.notes} rows={2} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full sm:w-auto" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
