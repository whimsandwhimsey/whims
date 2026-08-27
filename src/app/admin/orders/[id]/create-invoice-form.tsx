'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { createInvoice } from '../../invoices/actions';

type InvoiceType = 'DEPOSIT' | 'FINAL_PAYMENT' | 'READY_STOCK';
type PoBatchType = 'FAST' | 'REGULAR' | 'READY_STOCK';

function computeFinalPaymentAmount(outstandingBalance: number, depositBalance: number): number {
  // If the customer topped up deposit at some point between DP and settlement,
  // the Final Payment invoice should ask for less — the deposit covers part of it.
  return Math.max(0, Math.round((outstandingBalance - depositBalance) * 100) / 100);
}

function computeSmartDefaults(
  poBatchType: PoBatchType | undefined,
  totalQuantity: number,
  amountPaid: number,
  totalAmount: number,
  outstandingBalance: number,
  depositBalance: number
): { type: InvoiceType; amount: number } {
  if (poBatchType === 'FAST') {
    return { type: 'DEPOSIT', amount: Math.round(totalAmount * 0.5) };
  }
  if (poBatchType === 'REGULAR') {
    return { type: 'DEPOSIT', amount: totalQuantity * 50000 };
  }
  if (poBatchType === 'READY_STOCK') {
    return { type: 'READY_STOCK', amount: totalAmount };
  }
  // No PO batch assigned — fall back to the original generic defaults.
  return { type: 'DEPOSIT', amount: amountPaid || outstandingBalance || totalAmount };
}

export function CreateInvoiceForm({
  orderId,
  amountPaid,
  totalAmount,
  outstandingBalance,
  depositBalance = 0,
  poBatchType,
  totalQuantity,
}: {
  orderId: string;
  amountPaid: number;
  totalAmount: number;
  outstandingBalance: number;
  depositBalance?: number;
  poBatchType?: PoBatchType;
  totalQuantity: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const initialDefaults = computeSmartDefaults(
    poBatchType,
    totalQuantity,
    amountPaid,
    totalAmount,
    outstandingBalance,
    depositBalance
  );
  const [type, setType] = useState<InvoiceType>(initialDefaults.type);
  const [amount, setAmount] = useState(String(initialDefaults.amount));

  function handleTypeChange(next: InvoiceType) {
    setType(next);
    const defaults: Record<InvoiceType, number> = {
      DEPOSIT:
        poBatchType === 'REGULAR'
          ? totalQuantity * 50000
          : poBatchType === 'FAST'
            ? Math.round(totalAmount * 0.5)
            : amountPaid,
      FINAL_PAYMENT: computeFinalPaymentAmount(outstandingBalance || totalAmount, depositBalance),
      READY_STOCK: totalAmount,
    };
    setAmount(String(defaults[next] || totalAmount));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createInvoice({ orderId, type, amount: Number(amount) });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/admin/invoices/${result.invoiceId}`);
    });
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        Create invoice
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-border p-4">
      {poBatchType && (
        <p className="text-xs text-brass">
          Amount prefilled from this order&apos;s PO batch rule — feel free to adjust.
        </p>
      )}
      {type === 'FINAL_PAYMENT' && depositBalance > 0 && (
        <p className="text-xs text-brass">
          Customer has {formatCurrency(depositBalance)} in deposit — already subtracted from the
          amount below. Consider applying it via &quot;Apply deposit&quot; on this order too.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="invoiceType">Type</Label>
          <Select
            id="invoiceType"
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as InvoiceType)}
          >
            <option value="DEPOSIT">Deposit</option>
            <option value="FINAL_PAYMENT">Final Payment (Pelunasan)</option>
            <option value="READY_STOCK">Ready Stock</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invoiceAmount">Amount</Label>
          <Input
            id="invoiceAmount"
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending} className="flex-1 sm:flex-none">
          {isPending ? 'Creating…' : 'Create & view'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
