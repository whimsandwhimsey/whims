'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
import { recordPayment, applyDepositToInvoice } from '../../payments/actions';

export function InvoicePaymentActions({
  invoiceId,
  outstanding,
  depositBalance,
}: {
  invoiceId: string;
  outstanding: number;
  depositBalance: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'closed' | 'payment' | 'deposit'>('closed');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (outstanding <= 0) return null;

  function handlePaymentSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await recordPayment(invoiceId, formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMode('closed');
      router.refresh();
    });
  }

  function handleDepositSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await applyDepositToInvoice(invoiceId, formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMode('closed');
      router.refresh();
    });
  }

  if (mode === 'closed') {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setMode('payment')}>
          Record payment
        </Button>
        {depositBalance > 0 && (
          <Button size="sm" variant="outline" onClick={() => setMode('deposit')}>
            Apply deposit ({formatCurrency(depositBalance)} available)
          </Button>
        )}
      </div>
    );
  }

  if (mode === 'deposit') {
    return (
      <form action={handleDepositSubmit} className="space-y-3 rounded-md border border-border p-4">
        <p className="text-xs text-muted-foreground">
          Customer has {formatCurrency(depositBalance)} in deposit. Invoice outstanding:{' '}
          {formatCurrency(outstanding)}.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="depositAmount">Amount to apply</Label>
          <Input
            id="depositAmount"
            name="amount"
            type="number"
            min="1"
            max={Math.min(depositBalance, outstanding)}
            step="1"
            defaultValue={Math.min(depositBalance, outstanding)}
            required
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? 'Applying…' : 'Apply deposit'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode('closed')}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form action={handlePaymentSubmit} className="space-y-3 rounded-md border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            min="0"
            step="1"
            defaultValue={outstanding}
            required
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Outstanding: {formatCurrency(outstanding)}. Paying more automatically becomes deposit.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="method">Method</Label>
          <Select id="method" name="method" required defaultValue="QRIS">
            <option value="QRIS">QRIS</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Input id="date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save payment'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setMode('closed')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
