'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { recordDepositTopUp } from '../payments/actions';

export function DepositTopUpForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await recordDepositTopUp(customerId, formData);
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
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Add deposit top-up
      </Button>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-3 rounded-md border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="topupAmount">Amount</Label>
          <Input id="topupAmount" name="amount" type="number" min="0" step="1" required autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="topupMethod">Method</Label>
          <Select id="topupMethod" name="method" required defaultValue="QRIS">
            <option value="QRIS">QRIS</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="topupDate">Date</Label>
          <Input
            id="topupDate"
            name="date"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="topupNotes">Notes</Label>
        <Textarea id="topupNotes" name="notes" rows={2} placeholder="e.g. Pre-paid deposit for future orders" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save top-up'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
