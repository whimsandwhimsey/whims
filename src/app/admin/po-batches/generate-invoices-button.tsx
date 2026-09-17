'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { generateInvoicesForBatch, type GenerateInvoicesResult } from './actions';

const TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'DP',
  FINAL_PAYMENT: 'Pelunasan',
  READY_STOCK: 'Full payment',
};

export function GenerateInvoicesButton({ batchId, isPoType }: { batchId: string; isPoType: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<GenerateInvoicesResult | null>(null);
  const [invoiceType, setInvoiceType] = useState<'DEPOSIT' | 'FINAL_PAYMENT' | 'READY_STOCK'>(
    isPoType ? 'DEPOSIT' : 'READY_STOCK'
  );

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await generateInvoicesForBatch(batchId, invoiceType);
      setResult(res);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Select
          value={invoiceType}
          onChange={(e) => setInvoiceType(e.target.value as any)}
          className="w-44"
        >
          {isPoType ? (
            <>
              <option value="DEPOSIT">DP</option>
              <option value="FINAL_PAYMENT">Pelunasan</option>
            </>
          ) : (
            <option value="READY_STOCK">Full payment</option>
          )}
        </Select>
        <Button onClick={handleClick} disabled={isPending} className="flex-1 sm:flex-none">
          {isPending ? 'Generating…' : `Generate invoice ${TYPE_LABELS[invoiceType]} buat semua order`}
        </Button>
      </div>
      {result && (
        <div className="text-sm">
          <p className="font-medium">
            {result.created} invoice(s) created, {result.skipped} skipped.
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
