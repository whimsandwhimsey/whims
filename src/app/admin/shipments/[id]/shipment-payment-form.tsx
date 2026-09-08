'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { recordShipmentPayment } from '../../packing/actions';

export function ShipmentPaymentForm({ shipmentId, outstanding }: { shipmentId: string; outstanding: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState('QRIS');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (outstanding <= 0) return null;

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Record payment
      </Button>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('amount', amount);
      formData.set('method', method);
      const result = await recordShipmentPayment(shipmentId, formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap gap-2">
        <Input
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-32"
        />
        <Select value={method} onChange={(e) => setMethod(e.target.value)} className="w-36">
          <option value="QRIS">QRIS</option>
          <option value="BANK_TRANSFER">Bank Transfer</option>
        </Select>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Menyimpan…' : 'Simpan'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
