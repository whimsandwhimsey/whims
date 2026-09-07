'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { editInvoiceAmount } from '../actions';

export function EditInvoiceAmount({
  invoiceId,
  amount,
  amountPaid,
}: {
  invoiceId: string;
  amount: number;
  amountPaid: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(amount));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (amountPaid > 0) return null; // locked — no edit affordance once money's attached

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground print:hidden"
      >
        <Pencil className="h-3 w-3" /> Edit jumlah
      </button>
    );
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('amount', value);
      const result = await editInvoiceAmount(invoiceId, formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Input
        type="number"
        min="1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-32"
        autoFocus
      />
      <Button size="sm" onClick={save} disabled={isPending}>
        {isPending ? '…' : 'Simpan'}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Batal
      </Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
