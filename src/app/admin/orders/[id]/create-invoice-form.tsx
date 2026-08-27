'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { createInvoice } from '../../invoices/actions';

type InvoiceType = 'DEPOSIT' | 'FINAL_PAYMENT' | 'READY_STOCK';
type DpType = 'PERCENTAGE' | 'FIXED_PER_BOOK' | 'FIXED_TOTAL' | null;

const PO_TYPES = ['PO_REGULAR', 'PO_REMAINDER'];

function computeDpAmount(dpType: DpType, dpValue: number | null, totalAmount: number, totalQuantity: number): number {
  if (!dpType || dpValue === null) return Math.round(totalAmount * 0.25);
  if (dpType === 'PERCENTAGE') return Math.round(totalAmount * (dpValue / 100));
  if (dpType === 'FIXED_PER_BOOK') return Math.round(dpValue * totalQuantity);
  return Math.round(Math.min(dpValue, totalAmount));
}

export function CreateInvoiceForm({
  orderId,
  orderType,
  totalAmount,
  totalQuantity,
  dpType,
  dpValue,
  alreadyInvoiced,
}: {
  orderId: string;
  orderType: string;
  totalAmount: number;
  totalQuantity: number;
  dpType: DpType;
  dpValue: number | null;
  alreadyInvoiced: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const isPoType = PO_TYPES.includes(orderType);
  const remainingToInvoice = Math.max(0, Math.round(totalAmount - alreadyInvoiced));

  const initialType: InvoiceType = !isPoType ? 'READY_STOCK' : alreadyInvoiced === 0 ? 'DEPOSIT' : 'FINAL_PAYMENT';
  const initialAmount = !isPoType
    ? remainingToInvoice
    : alreadyInvoiced === 0
      ? computeDpAmount(dpType, dpValue, totalAmount, totalQuantity)
      : remainingToInvoice;

  const [type, setType] = useState<InvoiceType>(initialType);
  const [amount, setAmount] = useState(String(initialAmount));

  function handleTypeChange(next: InvoiceType) {
    setType(next);
    if (next === 'DEPOSIT') {
      setAmount(String(computeDpAmount(dpType, dpValue, totalAmount, totalQuantity)));
    } else {
      setAmount(String(remainingToInvoice));
    }
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
      {isPoType && type === 'DEPOSIT' && (
        <p className="text-xs text-brass">
          Amount prefilled from this order&apos;s DP rule ({dpType ? dpType.toLowerCase().replace('_', ' ') : 'default 25%'}) — feel free to adjust.
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
            {isPoType && <option value="DEPOSIT">Deposit (DP)</option>}
            {isPoType && <option value="FINAL_PAYMENT">Final Payment (Pelunasan)</option>}
            {!isPoType && <option value="READY_STOCK">Full payment</option>}
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
