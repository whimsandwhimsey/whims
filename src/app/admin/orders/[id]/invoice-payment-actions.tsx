'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
import { recordPayment, recordCombinedPayment, applyDepositToInvoice } from '../../payments/actions';

export function InvoicePaymentActions({
  invoiceId,
  outstanding,
  depositBalance,
  linkedShipmentOutstanding,
}: {
  invoiceId: string;
  outstanding: number;
  depositBalance: number;
  /** When this invoice has ongkir bundled in, its outstanding — the
   * "Record payment" / "Apply deposit" actions then work against the
   * combined total and split automatically (book first, then ongkir). */
  linkedShipmentOutstanding?: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'closed' | 'payment' | 'deposit'>('closed');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const combinedOutstanding = outstanding + (linkedShipmentOutstanding ?? 0);
  const isCombined = linkedShipmentOutstanding !== undefined && linkedShipmentOutstanding > 0;

  if (combinedOutstanding <= 0) return null;

  function handlePaymentSubmit(formData: FormData) {
    setError(null);
    setSuccessMessage(null);
    startTransition(async () => {
      const result = isCombined
        ? await recordCombinedPayment(invoiceId, formData)
        : await recordPayment(invoiceId, formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMode('closed');
      setSuccessMessage('Payment saved.');
      router.refresh();
    });
  }

  function handleDepositSubmit(formData: FormData) {
    setError(null);
    setSuccessMessage(null);
    const applied = Number(formData.get('amount'));
    startTransition(async () => {
      const result = await applyDepositToInvoice(invoiceId, formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMode('closed');
      setSuccessMessage(
        `Applied ${formatCurrency(applied)} from deposit. Outstanding is now ${formatCurrency(Math.max(0, combinedOutstanding - applied))}.`
      );
      router.refresh();
    });
  }

  if (mode === 'closed') {
    return (
      <div className="space-y-2">
        {successMessage && <p className="text-sm text-success">{successMessage}</p>}
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
      </div>
    );
  }

  if (mode === 'deposit') {
    return (
      <form action={handleDepositSubmit} className="space-y-3 rounded-md border border-border p-4">
        <p className="text-xs text-muted-foreground">
          Customer has {formatCurrency(depositBalance)} in deposit. Outstanding
          {isCombined ? ' (buku + ongkir)' : ''}: {formatCurrency(combinedOutstanding)}.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="depositAmount">Amount to apply</Label>
          <Input
            id="depositAmount"
            name="amount"
            type="number"
            min="1"
            max={Math.min(depositBalance, combinedOutstanding)}
            step="1"
            defaultValue={Math.min(depositBalance, combinedOutstanding)}
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
            defaultValue={combinedOutstanding}
            required
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Outstanding{isCombined ? ' (buku + ongkir)' : ''}: {formatCurrency(combinedOutstanding)}.
            {isCombined ? ' Buku dilunasin dulu, sisanya ke ongkir.' : ' Paying more automatically becomes deposit.'}
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
