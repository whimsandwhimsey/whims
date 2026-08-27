'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/searchable-select';
import { createExpense } from './actions';

export function AddExpenseForm({ orders }: { orders: { id: string; orderNumber: string }[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState('');

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createExpense(formData);
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
      <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
        Add expense
      </Button>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-3 rounded-md border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="exp-date">Date</Label>
          <Input id="exp-date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exp-category">Category</Label>
          <Select id="exp-category" name="category" defaultValue="PACKING" required>
            <option value="PACKING">Packing</option>
            <option value="SHIPPING_TO_WAREHOUSE">Shipping to warehouse</option>
            <option value="OTHER">Other</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exp-amount">Amount</Label>
          <Input id="exp-amount" name="amount" type="number" min="1" step="1" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exp-order">Related order (optional)</Label>
          <input type="hidden" name="orderId" value={orderId} />
          <SearchableSelect
            id="exp-order"
            options={orders.map((o) => ({ value: o.id, label: o.orderNumber }))}
            value={orderId}
            onChange={setOrderId}
            placeholder="General / not order-specific"
            emptyLabel="— General / not order-specific —"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="exp-description">Description</Label>
        <Textarea id="exp-description" name="description" rows={2} placeholder="e.g. Bubble wrap + boxes for July batch" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending} className="flex-1 sm:flex-none">
          {isPending ? 'Saving…' : 'Save expense'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
